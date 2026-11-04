import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkHostKey, formatSha256Fingerprint, knownHostName, parseKnownHosts, parsePublicKeyLine } from './known-hosts';
import type { KnownHost } from './model/known-hosts';

const hmac = (salt: string, text: string) => createHmac('sha1', Buffer.from(salt, 'base64')).update(text).digest('base64');
const KEY_A = 'AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';
const KEY_B = 'AAAAC3NzaC1lZDI1NTE5AAAAIBBBBnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';

const entry = (extra: Partial<KnownHost>): KnownHost => ({ host: '10.0.0.12', port: 22, keyType: 'ssh-ed25519', key: KEY_A, addedAt: 1, revoked: false, source: 'app', ...extra });

describe('formatSha256Fingerprint', () => {
  it('formata como o OpenSSH (base64 sem "=")', () => {
    const digest = createHash('sha256').update(Buffer.from(KEY_A, 'base64')).digest();
    expect(formatSha256Fingerprint(digest)).toBe(`SHA256:${digest.toString('base64').replace(/=+$/, '')}`);
  });
});

describe('parsePublicKeyLine', () => {
  it('separa tipo, blob e comentário', () => {
    expect(parsePublicKeyLine(`ssh-ed25519 ${KEY_A} ana@laptop`)).toEqual({ type: 'ssh-ed25519', key: KEY_A, comment: 'ana@laptop' });
    expect(parsePublicKeyLine('lixo')).toBeNull();
  });
});

describe('parseKnownHosts', () => {
  it('lê listas, portas, hash e @revoked, e ignora curingas e @cert-authority', () => {
    const salt = Buffer.from('saltsaltsaltsaltsalt').toString('base64');
    const hashed = `|1|${salt}|${hmac(salt, 'github.com')}`;
    const text = [
      `GitHub.com,140.82.112.3 ssh-ed25519 ${KEY_A}`,
      `[10.0.0.12]:2222 ssh-ed25519 ${KEY_A} comentário`,
      `${hashed} ssh-ed25519 ${KEY_B}`,
      `@revoked * ssh-rsa ${KEY_B}`,
      `@revoked velho.interno ssh-rsa ${KEY_B}`,
      `@cert-authority *.corp ssh-ed25519 ${KEY_A}`,
      `*.interno ssh-ed25519 ${KEY_A}`,
      '# comentário',
      'quebrada',
    ].join('\n');
    const { entries, ignored } = parseKnownHosts(text);
    expect(entries.map((e) => [e.host, e.port, e.revoked])).toEqual([
      ['github.com', 22, false],
      ['140.82.112.3', 22, false],
      ['10.0.0.12', 2222, false],
      [hashed, 22, false],
      ['velho.interno', 22, true],
    ]);
    expect(ignored.map((i) => i.line)).toEqual([4, 6, 7, 9]);
  });
});

describe('checkHostKey', () => {
  const target = { host: '10.0.0.12', port: 22, keyType: 'ssh-ed25519', key: KEY_A };

  it('host conhecido com a mesma chave', () => {
    expect(checkHostKey([entry({})], target, hmac).status).toBe('known');
  });

  it('host desconhecido, inclusive em outra porta', () => {
    expect(checkHostKey([], target, hmac).status).toBe('unknown');
    expect(checkHostKey([entry({ port: 2222 })], target, hmac).status).toBe('unknown');
  });

  it('chave diferente do mesmo tipo é troca de chave', () => {
    const r = checkHostKey([entry({ key: KEY_B })], target, hmac);
    expect(r).toMatchObject({ status: 'changed', entries: [{ key: KEY_B }] });
  });

  it('chave de outro tipo não conta como troca', () => {
    expect(checkHostKey([entry({ key: KEY_B, keyType: 'ssh-rsa' })], target, hmac).status).toBe('unknown');
  });

  it('chave revogada bloqueia mesmo com entrada igual', () => {
    const r = checkHostKey([entry({}), entry({ host: 'outro', revoked: true })], target, hmac);
    expect(r.status).toBe('revoked');
  });

  it('confere nomes em hash, com e sem porta', () => {
    const salt = Buffer.from('0123456789abcdefghij').toString('base64');
    const at22 = entry({ host: `|1|${salt}|${hmac(salt, knownHostName('10.0.0.12', 22))}` });
    const at2222 = entry({ host: `|1|${salt}|${hmac(salt, knownHostName('10.0.0.12', 2222))}` });
    expect(checkHostKey([at22], target, hmac).status).toBe('known');
    expect(checkHostKey([at2222], { ...target, port: 2222 }, hmac).status).toBe('known');
    expect(checkHostKey([at2222], target, hmac).status).toBe('unknown');
  });
});
