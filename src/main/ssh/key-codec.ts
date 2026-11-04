import { createHash } from 'node:crypto';
import { utils } from 'ssh2';
import { formatSha256Fingerprint, parsePublicKeyLine } from '@shared/known-hosts';
import type { SshKeyType } from '@shared/model';
import type { OpenSshKeyInfo } from '@shared/ssh-config';

export interface ParsedPrivateKey {
  type: SshKeyType;
  /** Linha OpenSSH da pública, com o comentário. */
  publicKey: string;
  fingerprint: string;
  comment: string;
  /** A chave exige frase-senha. */
  encrypted: boolean;
}

export type ParseKeyResult = { ok: true; key: ParsedPrivateKey } | { ok: false; error: 'needs-passphrase' | 'bad-passphrase' | 'unsupported' | 'invalid' };

export function keyTypeOf(sshType: string): SshKeyType | null {
  if (sshType === 'ssh-ed25519') return 'ed25519';
  if (sshType.startsWith('ecdsa-sha2-')) return 'ecdsa';
  if (sshType === 'ssh-rsa') return 'rsa';
  return null;
}

/** `SHA256:...` do blob da chave pública. */
export function fingerprintOf(blob: Buffer): string {
  return formatSha256Fingerprint(createHash('sha256').update(blob).digest());
}

const NEEDS_PASSPHRASE = /no passphrase|passphrase.*(required|given)|encrypted/i;
const BAD_PASSPHRASE = /bad passphrase|wrong passphrase|bad decrypt|integrity check/i;

/** Lê uma chave privada OpenSSH/PEM; sem frase-senha, informa se ela é necessária. */
export function parsePrivateKey(text: string | Buffer, passphrase?: string): ParseKeyResult {
  const parsed = utils.parseKey(text, passphrase);
  const key = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!key || key instanceof Error) {
    const message = key instanceof Error ? key.message : '';
    if (passphrase === undefined && NEEDS_PASSPHRASE.test(message)) return { ok: false, error: 'needs-passphrase' };
    if (passphrase !== undefined && (BAD_PASSPHRASE.test(message) || NEEDS_PASSPHRASE.test(message))) return { ok: false, error: 'bad-passphrase' };
    return { ok: false, error: 'invalid' };
  }
  if (!key.isPrivateKey()) return { ok: false, error: 'invalid' };
  const type = keyTypeOf(key.type);
  if (!type) return { ok: false, error: 'unsupported' };
  const blob = key.getPublicSSH();
  const comment = key.comment ?? '';
  // Abriu sem frase-senha: não é cifrada. Com frase-senha, confere se ela era mesmo necessária.
  const encrypted = passphrase !== undefined && utils.parseKey(text) instanceof Error;
  return {
    ok: true,
    key: {
      type,
      publicKey: `${key.type} ${blob.toString('base64')}${comment ? ` ${comment}` : ''}`,
      fingerprint: fingerprintOf(blob),
      comment,
      encrypted,
    },
  };
}

/**
 * Metadados de uma chave do `~/.ssh/config`: do `.pub` ao lado (funciona com chave cifrada) ou da
 * própria chave quando ela não tem frase-senha. null se a chave não existe ou não pôde ser lida.
 */
export async function readOpenSshKeyInfo(path: string, read: (p: string) => Promise<string>): Promise<OpenSshKeyInfo | null> {
  const privateText = await read(path).catch(() => null);
  if (privateText === null) return null;
  const direct = parsePrivateKey(privateText);
  if (direct.ok) return direct.key;
  if (direct.error !== 'needs-passphrase') return null;
  const pubText = await read(`${path}.pub`).catch(() => null);
  const pub = pubText ? parsePublicKeyLine(pubText) : null;
  const type = pub ? keyTypeOf(pub.type) : null;
  if (!pub || !type) return null;
  return {
    type,
    publicKey: `${pub.type} ${pub.key}${pub.comment ? ` ${pub.comment}` : ''}`,
    fingerprint: fingerprintOf(Buffer.from(pub.key, 'base64')),
    comment: pub.comment,
    encrypted: true,
  };
}

export interface GeneratedKey {
  privateKey: string;
  parsed: ParsedPrivateKey;
}

/** Gera um par Ed25519 (padrão) ou RSA 4096 no formato OpenSSH, com frase-senha opcional. */
export function generateKey(type: 'ed25519' | 'rsa', options: { comment: string; passphrase?: string }): GeneratedKey {
  const passphrase = options.passphrase || undefined;
  const common = { comment: options.comment, ...(passphrase ? { passphrase, cipher: 'aes256-ctr', rounds: 16 } : {}) };
  const pair = type === 'rsa' ? utils.generateKeyPairSync('rsa', { ...common, bits: 4096 }) : utils.generateKeyPairSync('ed25519', common);
  const parsed = parsePrivateKey(pair.private, passphrase);
  if (!parsed.ok) throw new Error('Falha ao gerar a chave.');
  return { privateKey: pair.private, parsed: { ...parsed.key, encrypted: !!passphrase } };
}
