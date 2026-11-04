import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, utils } from 'ssh2';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Host, SshSettings } from '@shared/model';
import type { SshAnswer, SshPrompt } from '@shared/ssh';
import { ConfigStore } from '../config/config-store';
import type { SecretPort } from '../ports';
import { SshConnectionPool, SshConnectError } from './connection-pool';
import { KeychainService } from './keychain-service';
import { KnownHostsService } from './known-hosts-service';
import { SecretStore } from './secret-store';
import { hostKeyBlob, startTestServer, type TestServer } from './testing/ssh-test-server';

const secretPort: SecretPort = {
  isAvailable: () => true,
  encrypt: (p) => Buffer.from(p).toString('base64'),
  decrypt: (c) => Buffer.from(c, 'base64').toString(),
};

let dir: string;
let config: ConfigStore;
let keychain: KeychainService;
let knownHosts: KnownHostsService;
let servers: TestServer[];
let asked: SshPrompt[];
let script: (p: SshPrompt) => SshAnswer | null;
let settings: SshSettings;

function pool(): SshConnectionPool {
  return new SshConnectionPool({
    createClient: () => new Client(),
    hostsFile: () => config.snapshot().hosts,
    settings: () => settings,
    keychain,
    knownHosts,
    prompts: {
      ask: async (_group, _target, prompt) => {
        asked.push(prompt);
        return script(prompt);
      },
      cancelGroup: () => undefined,
    },
    linkIdentity: (hostId, identityId) => config.mutateHosts((f) => ({ ...f, hosts: f.hosts.map((h) => (h.id === hostId ? { ...h, identityId } : h)) })),
  });
}

async function addHost(host: Partial<Host> & { id: string; port: number }): Promise<void> {
  const full: Host = { name: host.id, address: '127.0.0.1', groupId: null, color: null, tags: [], username: 'deploy', ...host };
  const r = await config.mutateHosts((f) => ({ ...f, hosts: [...f.hosts.filter((h) => h.id !== full.id), full] }));
  if (!r.ok) throw new Error(r.error);
}

async function server(opts: Parameters<typeof startTestServer>[0]): Promise<TestServer> {
  const s = await startTestServer(opts);
  servers.push(s);
  return s;
}

/** Responde "confiar" ao fingerprint e a senha dada, salvando ou não. */
const trustAnd =
  (password: string | null, save = false) =>
  (p: SshPrompt): SshAnswer | null => {
    if (p.kind === 'hostKey-new') return { kind: 'hostKey', decision: 'trust' };
    if (p.kind === 'password' && password !== null) return { kind: 'text', value: password, save };
    return null;
  };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gs-pool-'));
  config = new ConfigStore(dir);
  await config.load();
  keychain = new KeychainService({ config, secrets: new SecretStore(dir, secretPort), readFile: async () => '', writeFile: async () => undefined });
  await keychain.start();
  knownHosts = new KnownHostsService(config);
  servers = [];
  asked = [];
  script = () => null;
  settings = { agent: 'off', keepaliveSec: 0, connectTimeoutSec: 5 };
});
afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  await rm(dir, { recursive: true, force: true });
});

describe('SshConnectionPool: host novo e senha', () => {
  it('pergunta o fingerprint, pede a senha, salva e na segunda vez não pergunta nada', async () => {
    const s = await server({ password: 'segredo' });
    await addHost({ id: 'vm', port: s.port });
    script = trustAnd('segredo', true);
    const p = pool();
    const handle = await p.acquire({ kind: 'host', hostId: 'vm' });
    expect(asked.map((a) => a.kind)).toEqual(['hostKey-new', 'password']);
    expect(asked[1]).toMatchObject({ canSave: true });
    handle.release();

    asked = [];
    script = () => {
      throw new Error('não devia perguntar');
    };
    const again = await pool().acquire({ kind: 'host', hostId: 'vm' });
    expect(asked).toEqual([]);
    expect(config.snapshot().hosts.hosts[0]!.identityId).toBeDefined();
    again.release();
  });

  it('"Conectar só desta vez" não grava a chave do servidor', async () => {
    const s = await server({ password: 'x' });
    await addHost({ id: 'vm', port: s.port });
    script = (p) => (p.kind === 'hostKey-new' ? { kind: 'hostKey', decision: 'once' } : { kind: 'text', value: 'x', save: false });
    (await pool().acquire({ kind: 'host', hostId: 'vm' })).release();
    expect(knownHosts.list()).toEqual([]);
  });

  it('cancelar o fingerprint não envia credencial nenhuma', async () => {
    const s = await server({ password: 'x' });
    await addHost({ id: 'vm', port: s.port });
    script = () => ({ kind: 'cancel' });
    await expect(pool().acquire({ kind: 'host', hostId: 'vm' })).rejects.toMatchObject({ message: 'Conexão cancelada', cancelled: true });
    expect(s.authAttempts).toEqual([]);
  });

  it('chave alterada bloqueia sem enviar credencial', async () => {
    const s = await server({ password: 'x' });
    await addHost({ id: 'vm', port: s.port });
    const other = hostKeyBlob(utils.generateKeyPairSync('ed25519').private);
    await knownHosts.accept({ host: '127.0.0.1', port: s.port, ...other });
    script = (p) => (p.kind === 'hostKey-changed' ? { kind: 'cancel' } : null);
    await expect(pool().acquire({ kind: 'host', hostId: 'vm' })).rejects.toThrow('A chave do servidor mudou; conexão bloqueada.');
    expect(asked[0]).toMatchObject({ kind: 'hostKey-changed', previous: [expect.stringMatching(/^SHA256:/)] });
    expect(s.authAttempts).toEqual([]);
  });

  it('chave revogada bloqueia sem opção de prosseguir', async () => {
    const s = await server({ password: 'x' });
    await addHost({ id: 'vm', port: s.port });
    const blob = hostKeyBlob(s.hostKey);
    await knownHosts.importOpenSsh(`@revoked * ${blob.keyType} ${blob.key}`.replace('*', '127.0.0.1'));
    await expect(pool().acquire({ kind: 'host', hostId: 'vm' })).rejects.toThrow('revogada');
    expect(s.authAttempts).toEqual([]);
  });

  it('senha errada é pedida de novo e a recusa vira mensagem em português', async () => {
    const s = await server({ password: 'certa' });
    await addHost({ id: 'vm', port: s.port });
    script = trustAnd('errada');
    await expect(pool().acquire({ kind: 'host', hostId: 'vm' })).rejects.toThrow('Autenticação recusada pelo servidor');
    expect(asked.filter((a) => a.kind === 'password').map((a) => (a as { retry: boolean }).retry)).toEqual([false, true, true]);
  });
});

describe('SshConnectionPool: chaves e keyboard-interactive', () => {
  it('usa a chave configurada e pede a frase-senha, salvando quando marcado', async () => {
    const pair = utils.generateKeyPairSync('ed25519', { passphrase: 'frase', cipher: 'aes256-ctr', rounds: 4 } as never);
    const s = await server({ authorizedKey: pair.public });
    const imported = await keychain.importKey({ name: 'deploy', source: { kind: 'text', text: pair.private }, passphrase: 'frase', savePassphrase: false });
    if (!imported.ok) throw new Error(imported.error);
    await addHost({ id: 'vm', port: s.port, keyId: imported.keyId });
    script = (p) => (p.kind === 'hostKey-new' ? { kind: 'hostKey', decision: 'trust' } : p.kind === 'passphrase' ? { kind: 'text', value: 'frase', save: true } : null);
    (await pool().acquire({ kind: 'host', hostId: 'vm' })).release();
    expect(asked.map((a) => a.kind)).toEqual(['hostKey-new', 'passphrase']);
    expect(s.authAttempts).toContain('publickey');
    expect(keychain.snapshot().keys[0]!.passphrase).toBe('saved');
  });

  it('senha e código 2FA em sequência, sem opção de salvar o código', async () => {
    const s = await server({ password: 'segredo', otp: '123456', passwordViaKeyboard: true });
    await addHost({ id: 'vm', port: s.port });
    script = (p) => {
      if (p.kind === 'hostKey-new') return { kind: 'hostKey', decision: 'trust' };
      if (p.kind === 'keyboard-interactive') return { kind: 'responses', values: [/code/i.test(p.prompts[0]!.prompt) ? '123456' : 'segredo'], save: false };
      return null;
    };
    (await pool().acquire({ kind: 'host', hostId: 'vm' })).release();
    const kbd = asked.filter((a): a is Extract<SshPrompt, { kind: 'keyboard-interactive' }> => a.kind === 'keyboard-interactive');
    expect(kbd.map((k) => [k.prompts[0]!.prompt, k.canSave])).toEqual([
      ['Password: ', true],
      ['Verification code: ', false],
    ]);
  });

  it('conexão rápida não oferece salvar a senha', async () => {
    const s = await server({ password: 'x' });
    script = trustAnd('x');
    (await pool().acquire({ kind: 'quick', username: 'deploy', address: '127.0.0.1', port: s.port })).release();
    expect(asked[1]).toMatchObject({ kind: 'password', canSave: false });
  });

  it('pede o usuário quando não há nenhum', async () => {
    const s = await server({ password: 'x' });
    script = (p) => (p.kind === 'username' ? { kind: 'text', value: 'deploy', save: false } : trustAnd('x')(p));
    const h = await pool().acquire({ kind: 'quick', username: null, address: '127.0.0.1', port: s.port });
    expect(h.label).toBe(`deploy@127.0.0.1:${s.port}`);
    h.release();
  });
});

describe('SshConnectionPool: agente e algoritmos', () => {
  it('agente indisponível não derruba a conexão: segue para a senha', async () => {
    settings = { ...settings, agent: 'pageant' };
    const s = await server({ password: 'x' });
    await addHost({ id: 'vm', port: s.port });
    script = trustAnd('x');
    (await pool().acquire({ kind: 'host', hostId: 'vm' })).release();
    expect(asked.map((a) => a.kind)).toEqual(['hostKey-new', 'password']);
  });

  it('recusa servidor que só oferece assinatura ssh-rsa (SHA-1)', async () => {
    const rsa = utils.generateKeyPairSync('rsa', { bits: 2048 }).private;
    const s = await server({ password: 'x', hostKey: rsa, algorithms: { serverHostKey: ['ssh-rsa'] } });
    await addHost({ id: 'velho', port: s.port });
    await expect(pool().acquire({ kind: 'host', hostId: 'velho' })).rejects.toThrow('Nenhum algoritmo em comum com o servidor');
    expect(asked).toEqual([]);
  });

  it('servidor RSA moderno (rsa-sha2) continua aceito', async () => {
    const rsa = utils.generateKeyPairSync('rsa', { bits: 2048 }).private;
    const s = await server({ password: 'x', hostKey: rsa });
    await addHost({ id: 'rsa', port: s.port });
    script = trustAnd('x');
    (await pool().acquire({ kind: 'host', hostId: 'rsa' })).release();
    expect(asked[0]).toMatchObject({ kind: 'hostKey-new', keyType: 'ssh-rsa' });
  });
});

describe('SshConnectionPool: compartilhamento e ciclo de vida', () => {
  it('pedidos simultâneos ao mesmo host fazem uma conexão e um prompt só', async () => {
    const s = await server({ password: 'x' });
    await addHost({ id: 'vm', port: s.port });
    script = trustAnd('x');
    const p = pool();
    const [a, b] = await Promise.all([p.acquire({ kind: 'host', hostId: 'vm' }), p.acquire({ kind: 'host', hostId: 'vm' })]);
    expect(asked.map((x) => x.kind)).toEqual(['hostKey-new', 'password']);
    expect(a.client).toBe(b.client);
    expect(p.usesOf({ kind: 'host', hostId: 'vm' })).toBe(2);
    a.release();
    expect(p.usesOf({ kind: 'host', hostId: 'vm' })).toBe(1);
    const closed = new Promise<string | null>((resolve) => b.onClose(resolve));
    b.release();
    expect(await closed).toBeNull();
    expect(p.usesOf({ kind: 'host', hostId: 'vm' })).toBe(0);
  });

  it('queda da conexão avisa quem usa', async () => {
    const s = await server({ password: 'x' });
    await addHost({ id: 'vm', port: s.port });
    script = trustAnd('x');
    const h = await pool().acquire({ kind: 'host', hostId: 'vm' });
    const closed = new Promise<string | null>((resolve) => h.onClose(resolve));
    s.dropAll();
    await closed;
    h.release();
  });

  it('conexão recusada vira mensagem em português', async () => {
    const free = createServer();
    await new Promise<void>((r) => free.listen(0, '127.0.0.1', () => r()));
    const port = (free.address() as AddressInfo).port;
    await new Promise<void>((r) => free.close(() => r()));
    await addHost({ id: 'vm', port });
    const err = await pool()
      .acquire({ kind: 'host', hostId: 'vm' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SshConnectError);
    expect((err as Error).message).toBe(`Conexão recusada por 127.0.0.1:${port}`);
  });

  it('conecta pelo host de salto, verificando e autenticando cada um', async () => {
    const target = await server({ password: 'alvo' });
    const bastion = await server({ password: 'borda', allowForwarding: true });
    await addHost({ id: 'bastion', port: bastion.port });
    await addHost({ id: 'app', port: target.port, jumpHostId: 'bastion' });
    script = (p) => {
      if (p.kind === 'hostKey-new') return { kind: 'hostKey', decision: 'trust' };
      if (p.kind === 'password') return { kind: 'text', value: asked.filter((a) => a.kind === 'password').length === 1 ? 'borda' : 'alvo', save: false };
      return null;
    };
    const p = pool();
    const h = await p.acquire({ kind: 'host', hostId: 'app' });
    expect(asked.map((a) => a.kind)).toEqual(['hostKey-new', 'password', 'hostKey-new', 'password']);
    expect(p.usesOf({ kind: 'host', hostId: 'bastion' })).toBe(1);
    h.release();
    expect(p.usesOf({ kind: 'host', hostId: 'bastion' })).toBe(0);
  });
});
