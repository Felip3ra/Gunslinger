import { utils } from 'ssh2';
import { describe, expect, it } from 'vitest';
import { generateKey, parsePrivateKey } from './key-codec';

describe('parsePrivateKey', () => {
  it('lê uma chave Ed25519 sem frase-senha com tipo, pública e fingerprint', () => {
    const pair = utils.generateKeyPairSync('ed25519', { comment: 'ana@laptop' });
    const r = parsePrivateKey(pair.private);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key).toMatchObject({ type: 'ed25519', comment: 'ana@laptop', encrypted: false });
    expect(r.key.publicKey).toBe(`${pair.public.trim()}`);
    expect(r.key.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
  });

  it('pede frase-senha quando a chave é cifrada e recusa a errada', () => {
    const pair = utils.generateKeyPairSync('ed25519', { comment: 'x', passphrase: 'certa', cipher: 'aes256-ctr', rounds: 4 } as never);
    expect(parsePrivateKey(pair.private)).toEqual({ ok: false, error: 'needs-passphrase' });
    expect(parsePrivateKey(pair.private, 'errada')).toEqual({ ok: false, error: 'bad-passphrase' });
    const ok = parsePrivateKey(pair.private, 'certa');
    expect(ok.ok && ok.key.encrypted).toBe(true);
  });

  it('recusa texto que não é chave', () => {
    expect(parsePrivateKey('isto não é uma chave')).toEqual({ ok: false, error: 'invalid' });
  });

  it('recusa uma chave pública no lugar da privada', () => {
    const pair = utils.generateKeyPairSync('ed25519');
    expect(parsePrivateKey(pair.public)).toEqual({ ok: false, error: 'invalid' });
  });
});

describe('generateKey', () => {
  it('gera Ed25519 com comentário e frase-senha opcional', () => {
    const plain = generateKey('ed25519', { comment: 'laptop' });
    expect(plain.parsed.publicKey).toMatch(/^ssh-ed25519 AAAA\S+ laptop$/);
    expect(plain.parsed.encrypted).toBe(false);
    const locked = generateKey('ed25519', { comment: 'laptop', passphrase: 'frase' });
    expect(locked.parsed.encrypted).toBe(true);
    expect(parsePrivateKey(locked.privateKey)).toEqual({ ok: false, error: 'needs-passphrase' });
  });

  it('gera RSA de 4096 bits', () => {
    const rsa = generateKey('rsa', { comment: 'velho' });
    expect(rsa.parsed.type).toBe('rsa');
    const blob = Buffer.from(rsa.parsed.publicKey.split(' ')[1]!, 'base64');
    expect(blob.length).toBeGreaterThan(500); // módulo de 4096 bits
  }, 60_000);
});
