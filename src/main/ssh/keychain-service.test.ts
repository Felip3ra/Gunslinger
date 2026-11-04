import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { utils } from 'ssh2';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../config/config-store';
import type { SecretPort } from '../ports';
import { KeychainService } from './keychain-service';
import { SecretStore } from './secret-store';

const port = (account = 'ana', available = true): SecretPort => ({
  isAvailable: () => available,
  encrypt: (plain) => Buffer.from(`${account}|${plain}`).toString('base64'),
  decrypt: (cipher) => {
    const text = Buffer.from(cipher, 'base64').toString();
    if (!text.startsWith(`${account}|`)) throw new Error('outra conta');
    return text.slice(account.length + 1);
  },
});

let dir: string;
let config: ConfigStore;
let secrets: SecretStore;
let keychain: KeychainService;

async function setup(secretPort = port()): Promise<void> {
  config = new ConfigStore(dir);
  await config.load();
  secrets = new SecretStore(dir, secretPort);
  keychain = new KeychainService({
    config,
    secrets,
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: (p, t) => writeFile(p, t),
  });
  await keychain.start();
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gs-keychain-'));
  await setup();
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

/** Nada do que vai para o renderer pode ter segredo nem id de segredo. */
function expectNoSecrets(...values: string[]): void {
  const text = JSON.stringify(keychain.snapshot()) + JSON.stringify(config.snapshot());
  for (const v of [...values, ...secrets.ids()]) expect(text).not.toContain(v);
}

describe('KeychainService: chaves', () => {
  it('importa uma chave colada e mostra só metadados', async () => {
    const pair = utils.generateKeyPairSync('ed25519', { comment: 'deploy' });
    const r = await keychain.importKey({ name: 'deploy', source: { kind: 'text', text: pair.private }, savePassphrase: false });
    expect(r.ok).toBe(true);
    const [key] = keychain.snapshot().keys;
    expect(key).toMatchObject({ name: 'deploy', type: 'ed25519', source: 'stored', privateKey: 'saved', passphrase: 'none' });
    expect(key!.fingerprint).toMatch(/^SHA256:/);
    expectNoSecrets(pair.private.split('\n')[1]!);
  });

  it('pede frase-senha e só a guarda com "Salvar frase-senha"', async () => {
    const pair = utils.generateKeyPairSync('ed25519', { passphrase: 'frase', cipher: 'aes256-ctr', rounds: 4 } as never);
    const missing = await keychain.importKey({ name: 'k', source: { kind: 'text', text: pair.private }, savePassphrase: false });
    expect(missing).toEqual({ ok: false, error: 'A chave é protegida por frase-senha.', needsPassphrase: true });
    await keychain.importKey({ name: 'k', source: { kind: 'text', text: pair.private }, passphrase: 'frase', savePassphrase: false });
    expect(keychain.snapshot().keys[0]).toMatchObject({ encrypted: true, passphrase: 'none' });
    await keychain.importKey({ name: 'k2', source: { kind: 'text', text: pair.private }, passphrase: 'frase', savePassphrase: true });
    expect(keychain.snapshot().keys[1]).toMatchObject({ passphrase: 'saved' });
    const material = await keychain.loadKeyMaterial(keychain.snapshot().keys[1]!.id);
    expect(material).toMatchObject({ ok: true, passphrase: 'frase' });
    expectNoSecrets('frase');
  });

  it('recusa arquivo que não é chave sem gravar nada', async () => {
    await writeFile(join(dir, 'nota.txt'), 'olá');
    const r = await keychain.importKey({ name: 'x', source: { kind: 'file', path: join(dir, 'nota.txt'), mode: 'copy' }, savePassphrase: false });
    expect(r).toEqual({ ok: false, error: 'Formato de chave não reconhecido.' });
    expect(keychain.snapshot().keys).toEqual([]);
    expect(secrets.ids()).toEqual([]);
  });

  it('chave por referência é lida do disco a cada uso', async () => {
    const path = join(dir, 'id_ed25519');
    await writeFile(path, utils.generateKeyPairSync('ed25519').private);
    const r = await keychain.importKey({ name: 'ref', source: { kind: 'file', path, mode: 'reference' }, savePassphrase: false });
    expect(r.ok).toBe(true);
    const keyId = keychain.snapshot().keys[0]!.id;
    expect(keychain.snapshot().keys[0]).toMatchObject({ source: 'file', filePath: path, privateKey: 'none' });
    expect(secrets.ids()).toEqual([]);
    const second = utils.generateKeyPairSync('ed25519').private;
    await writeFile(path, second);
    expect(await keychain.loadKeyMaterial(keyId)).toMatchObject({ ok: true, privateKey: second });
  });

  it('gera chave e exporta a pública', async () => {
    const r = await keychain.generateKey({ name: 'laptop', type: 'ed25519', savePassphrase: false });
    expect(r.ok).toBe(true);
    const id = keychain.snapshot().keys[0]!.id;
    expect(keychain.publicKey(id)).toMatch(/^ssh-ed25519 AAAA\S+ laptop$/);
    await keychain.exportKey(id, 'public', join(dir, 'laptop.pub'));
    expect(await readFile(join(dir, 'laptop.pub'), 'utf8')).toBe(`${keychain.publicKey(id)}\n`);
  });

  it('recusa gerar com o cofre indisponível', async () => {
    await setup(port('ana', false));
    const r = await keychain.generateKey({ name: 'x', type: 'ed25519', savePassphrase: false });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('cofre do sistema') });
    expect(keychain.snapshot().secretsAvailable).toBe(false);
  });
});

describe('KeychainService: identidades', () => {
  it('troca e apaga a senha sem revelar e sem deixar o segredo antigo', async () => {
    const r = await keychain.saveIdentity({ name: 'deploy', username: 'deploy', keyId: null, password: { action: 'set', value: 'velha' } });
    if (!r.ok) throw new Error(r.error);
    expect(keychain.snapshot().identities[0]).toMatchObject({ password: 'saved', username: 'deploy' });
    const oldSecret = secrets.ids()[0];
    await keychain.saveIdentity({ id: r.identityId, name: 'deploy', username: 'deploy', keyId: null, password: { action: 'set', value: 'nova' } });
    expect(keychain.identityCredentials(r.identityId)).toMatchObject({ password: 'nova' });
    expect(secrets.ids()).not.toContain(oldSecret);
    await keychain.saveIdentity({ id: r.identityId, name: 'deploy', username: 'deploy', keyId: null, password: { action: 'keep' } });
    expect(keychain.identityCredentials(r.identityId)?.password).toBe('nova');
    await keychain.saveIdentity({ id: r.identityId, name: 'deploy', username: 'deploy', keyId: null, password: { action: 'clear' } });
    expect(keychain.snapshot().identities[0]!.password).toBe('none');
    expect(secrets.ids()).toEqual([]);
    expectNoSecrets('nova', 'velha');
  });

  it('segredo cifrado por outra conta aparece como indisponível', async () => {
    const r = await keychain.saveIdentity({ name: 'd', username: 'd', keyId: null, password: { action: 'set', value: 'x' } });
    await setup(port('bruno'));
    expect(keychain.snapshot().identities[0]!.password).toBe('unavailable');
    expect(r.ok && keychain.identityCredentials(r.identityId)?.password).toBeNull();
  });
});

describe('KeychainService: exclusão', () => {
  it('lista quem usa a chave e, ao excluir, tira as referências e apaga os segredos', async () => {
    await keychain.generateKey({ name: 'deploy-ed25519', type: 'ed25519', savePassphrase: false });
    const keyId = keychain.snapshot().keys[0]!.id;
    const ident = await keychain.saveIdentity({ name: 'deploy', username: 'deploy', keyId, password: { action: 'keep' } });
    await config.mutateHosts((f) => ({
      ...f,
      groups: [{ id: 'g', name: 'Produção', parentId: null, defaults: { keyId } }],
      hosts: [
        { id: 'h1', name: 'Prod DB', address: '10.0.0.1', groupId: 'g', color: null, tags: [], keyId },
        { id: 'h2', name: 'Prod API', address: '10.0.0.2', groupId: 'g', color: null, tags: [] },
      ],
    }));
    expect(keychain.usage('key', keyId)).toEqual({ hosts: ['Prod DB'], groups: ['Produção'], identities: ['deploy'] });

    expect(await keychain.delete('key', keyId)).toEqual({ ok: true });
    const hosts = config.snapshot().hosts;
    expect(hosts.hosts[0]!.keyId).toBeUndefined();
    expect(hosts.groups[0]!.defaults.keyId).toBeUndefined();
    expect(ident.ok && keychain.identityCredentials(ident.identityId)?.keyId).toBeNull();
    expect(secrets.ids()).toEqual([]);
  });
});

describe('KeychainService: órfãos', () => {
  it('apaga ao iniciar segredos que nenhum metadado referencia', async () => {
    await secrets.add('sobra');
    await keychain.saveIdentity({ name: 'd', username: 'd', keyId: null, password: { action: 'set', value: 'fica' } });
    await setup();
    expect(secrets.ids()).toHaveLength(1);
    expect(keychain.snapshot().identities[0]!.password).toBe('saved');
  });

  it('não apaga nada com keychain.json inválido', async () => {
    await keychain.saveIdentity({ name: 'd', username: 'd', keyId: null, password: { action: 'set', value: 'fica' } });
    await writeFile(join(dir, 'keychain.json'), '{ quebrado');
    await setup();
    expect(secrets.ids()).toHaveLength(1);
  });
});
