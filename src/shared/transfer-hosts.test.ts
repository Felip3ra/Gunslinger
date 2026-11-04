import { describe, expect, it } from 'vitest';
import { defaultCommandsFile, defaultProjectsFile, defaultSettings, type Host, type HostsFile, type KeychainFile } from './model';
import { openSshToImport, parseSshConfig } from './ssh-config';
import { exportFileSchema } from './transfer';
import { applyImport, buildExport, previewItems, type DataSnapshot } from './transfer-logic';

const host = (id: string, extra: Partial<Host> = {}): Host => ({ id, name: id, address: `${id}.interno`, groupId: null, color: null, tags: [], ...extra });

const hosts: HostsFile = {
  version: 1,
  groups: [
    { id: 'clientes', name: 'Clientes', parentId: null, defaults: {} },
    { id: 'prod', name: 'Produção', parentId: 'clientes', defaults: { identityId: 'ops' } },
  ],
  hosts: [host('bastion', { keyId: 'k-file' }), host('db', { groupId: 'prod', jumpHostId: 'bastion', keyId: 'k-stored' }), host('outro')],
};
const keychain: KeychainFile = {
  version: 1,
  keys: [
    { id: 'k-file', name: 'id_ed25519', type: 'ed25519', fingerprint: 'SHA256:file', publicKey: 'ssh-ed25519 AAAA', comment: '', source: 'file', filePath: 'C:\\Users\\ana\\.ssh\\id_ed25519', encrypted: false, createdAt: 1 },
    { id: 'k-stored', name: 'deploy', type: 'ed25519', fingerprint: 'SHA256:stored', publicKey: 'ssh-ed25519 BBBB', comment: '', source: 'stored', privateKeySecretId: 'SEGREDO-CHAVE', encrypted: false, createdAt: 1 },
  ],
  identities: [{ id: 'ops', name: 'ops', username: 'ops', passwordSecretId: 'SEGREDO-SENHA' }],
};
const data: DataSnapshot = { commands: defaultCommandsFile, projects: defaultProjectsFile, settings: defaultSettings, hosts, keychain };
const selection = { categories: [] as string[], profileIds: [], projectIds: [] };

describe('exportação de hosts', () => {
  it('leva o host, o salto, os grupos e a identidade, sem segredos nem chaves guardadas', () => {
    const file = buildExport(data, { ...selection, hostIds: ['db'] });
    expect(file.hosts.map((h) => h.id).sort()).toEqual(['bastion', 'db']);
    expect(file.hostGroups.map((g) => g.id).sort()).toEqual(['clientes', 'prod']);
    expect(file.identities).toEqual([{ id: 'ops', name: 'ops', username: 'ops' }]);
    expect(file.sshKeys.map((k) => k.id)).toEqual(['k-file']);
    const text = JSON.stringify(file);
    expect(text).not.toContain('SEGREDO');
    expect(text).not.toContain('SecretId');
    expect(exportFileSchema.safeParse(JSON.parse(text)).success).toBe(true);
  });

  it('um arquivo com passwordSecretId tem o campo descartado ao ler', () => {
    const file = buildExport(data, { ...selection, hostIds: ['db'] });
    const tampered = { ...file, identities: [{ ...file.identities[0], passwordSecretId: 'x' }] };
    expect(exportFileSchema.parse(tampered).identities[0]).not.toHaveProperty('passwordSecretId');
  });
});

describe('importação de hosts', () => {
  const empty: DataSnapshot = { ...data, hosts: { version: 1, groups: [], hosts: [] }, keychain: { version: 1, keys: [], identities: [] } };
  const file = buildExport(data, { ...selection, hostIds: ['db'] });

  it('avisa da chave que não veio e da senha que não é exportada', () => {
    const items = previewItems(empty, file, { knownProfileIds: new Set(), executableExists: () => true });
    expect(items.find((i) => i.key === 'host:db')!.notes).toContain('A chave privada não vai no arquivo: o host fica sem chave até você importá-la.');
    expect(items.find((i) => i.kind === 'identity')!.notes).toEqual(['Senhas não são exportadas: será pedida ao conectar.']);
  });

  it('em outra máquina, recria grupos, identidade sem senha, chave por arquivo e mantém o salto', () => {
    const applied = applyImport(empty, file, [], () => 'novo');
    const db = applied.hosts.hosts.find((h) => h.name === 'db')!;
    expect(db.jumpHostId).toBe('bastion');
    expect(db.keyId).toBeUndefined();
    expect(applied.hosts.groups.find((g) => g.id === db.groupId)!.defaults.identityId).toBe('ops');
    expect(applied.keychain.identities).toEqual([{ id: 'ops', name: 'ops', username: 'ops' }]);
    expect(applied.keychain.keys).toMatchObject([{ id: 'k-file', source: 'file', filePath: 'C:\\Users\\ana\\.ssh\\id_ed25519' }]);
    expect(applied.result).toEqual({ added: 4, replaced: 0, skipped: 0 });
  });

  it('na mesma máquina: chave igual é reaproveitada, conflito "Ignorar" mantém o existente e grupos não duplicam', () => {
    const applied = applyImport(data, file, [{ key: 'host:db', action: 'skip' }, { key: 'host:bastion', action: 'skip' }, { key: 'identity:ops', action: 'skip' }], () => 'novo');
    expect(applied.hosts).toEqual(hosts);
    expect(applied.keychain).toEqual(keychain);
  });

  it('"Substituir" na identidade preserva a senha salva', () => {
    const applied = applyImport(data, file, [{ key: 'identity:ops', action: 'replace' }], () => 'novo');
    expect(applied.keychain.identities[0]).toMatchObject({ id: 'ops', passwordSecretId: 'SEGREDO-SENHA' });
  });

  it('"Manter ambos" cria cópias com outro nome e outro id', () => {
    let n = 0;
    const applied = applyImport(data, file, [{ key: 'host:db', action: 'keepBoth' }], () => `novo-${++n}`);
    expect(applied.hosts.hosts.map((h) => h.name)).toContain('db (2)');
  });
});

describe('importação do OpenSSH', () => {
  const ctx = { home: 'C:\\Users\\ana', localUser: 'ana' };
  const text = 'Host *\n  User ops\n  ServerAliveInterval 15\nHost bastion\n  HostName 200.1.1.1\n  IdentityFile ~/.ssh/id_ed25519\nHost app\n  HostName 10.0.0.5\n  ProxyJump bastion\n  IdentityFile ~/.ssh/cifrada\n  Compression yes';
  const keyPath = 'C:\\Users\\ana/.ssh/id_ed25519';
  const info = { type: 'ed25519' as const, publicKey: 'ssh-ed25519 AAAA', fingerprint: 'SHA256:x', comment: '', encrypted: false };

  it('cria o grupo com os padrões de Host *, os hosts com o salto e as chaves por referência', () => {
    let n = 0;
    const { file, warnings } = openSshToImport(parseSshConfig(text, ctx), new Map([[keyPath, info], ['C:\\Users\\ana/.ssh/cifrada', null]]), () => `id${++n}`);
    expect(file.hostGroups).toEqual([{ id: 'id1', name: 'Importados do OpenSSH', parentId: null, defaults: { username: 'ops', keepaliveSec: 15 } }]);
    const byName = Object.fromEntries(file.hosts.map((h) => [h.name, h]));
    expect(byName['app']!.jumpHostId).toBe(byName['bastion']!.id);
    expect(byName['bastion']!.keyId).toBe(file.sshKeys[0]!.id);
    expect(byName['app']!.keyId).toBeUndefined();
    expect(file.sshKeys).toMatchObject([{ name: 'id_ed25519', filePath: keyPath }]);
    expect(warnings.some((w) => w.includes('Compression yes'))).toBe(true);
    expect(warnings.some((w) => w.includes('cifrada') && w.includes('não importada'))).toBe(true);
    expect(exportFileSchema.safeParse(file).success).toBe(true);
  });

  it('importar de novo não duplica o grupo', () => {
    let n = 0;
    const first = openSshToImport(parseSshConfig(text, ctx), new Map([[keyPath, info]]), () => `a${++n}`).file;
    const empty: DataSnapshot = { ...data, hosts: { version: 1, groups: [], hosts: [] }, keychain: { version: 1, keys: [], identities: [] } };
    const once = applyImport(empty, first, [], () => `b${++n}`);
    const second = openSshToImport(parseSshConfig(text, ctx), new Map([[keyPath, info]]), () => `c${++n}`).file;
    const twice = applyImport({ ...empty, hosts: once.hosts, keychain: once.keychain }, second, [], () => `d${++n}`);
    expect(twice.hosts.groups).toHaveLength(1);
    expect(twice.keychain.keys).toHaveLength(1);
  });
});
