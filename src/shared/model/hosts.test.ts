import { describe, expect, it } from 'vitest';
import { hostSchema, isValidHostAddress } from './hosts';
import { sshKeySchema } from './keychain';
import { defaultSettings, settingsSchema } from './settings';

const host = { id: 'h1', name: 'Homolog API', address: '10.0.0.12', groupId: null, color: null, tags: [] };

describe('isValidHostAddress', () => {
  it.each(['10.0.0.12', 'db.interno', 'homolog-api.example.com', 'srv_01', '::1', 'fe80::1%eth0', '2001:db8::8a2e:370:7334', '::ffff:10.0.0.1', 'localhost'])(
    'aceita %s',
    (v) => expect(isValidHostAddress(v)).toBe(true),
  );

  it.each(['', '256.0.0.1', '10.0.0', '10.0.0.01', 'a b', '-inicio.com', '1:2:3:4:5:6:7:8:9', '1::2::3', 'gggg::1', '[::1]', 'user@host'])(
    'recusa %j',
    (v) => expect(isValidHostAddress(v)).toBe(false),
  );
});

describe('hostSchema', () => {
  it('aceita um host mínimo e deixa os campos herdáveis vazios', () => {
    const parsed = hostSchema.parse(host);
    expect(parsed.port).toBeUndefined();
    expect(parsed.username).toBeUndefined();
  });

  it('recusa endereço vazio e porta fora de 1–65535', () => {
    expect(hostSchema.safeParse({ ...host, address: '  ' }).success).toBe(false);
    expect(hostSchema.safeParse({ ...host, port: 0 }).success).toBe(false);
    expect(hostSchema.safeParse({ ...host, port: 65536 }).success).toBe(false);
    expect(hostSchema.safeParse({ ...host, port: 2222 }).success).toBe(true);
  });
});

describe('sshKeySchema', () => {
  const key = { id: 'k1', name: 'deploy', type: 'ed25519', fingerprint: 'SHA256:x', publicKey: 'ssh-ed25519 AAAA', comment: '', encrypted: false, createdAt: 1 };

  it("exige filePath em chaves 'file' e o segredo em chaves 'stored'", () => {
    expect(sshKeySchema.safeParse({ ...key, source: 'file', filePath: 'C:\\Users\\ana\\.ssh\\id_ed25519' }).success).toBe(true);
    expect(sshKeySchema.safeParse({ ...key, source: 'file' }).success).toBe(false);
    expect(sshKeySchema.safeParse({ ...key, source: 'stored', privateKeySecretId: 's1' }).success).toBe(true);
    expect(sshKeySchema.safeParse({ ...key, source: 'stored', privateKeySecretId: 's1', filePath: 'x' }).success).toBe(false);
  });
});

describe('settings.ssh', () => {
  it('tem padrão com o agente do OpenSSH e keepalive de 30 s', () => {
    expect(settingsSchema.parse(defaultSettings).ssh).toEqual({ agent: 'openssh', keepaliveSec: 30, connectTimeoutSec: 20 });
  });
});
