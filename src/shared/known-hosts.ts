import type { KnownHost } from './model/known-hosts';

/** `SHA256:<base64 sem '='>`, como o OpenSSH mostra. `digest` é o SHA-256 do blob da chave pública. */
export function formatSha256Fingerprint(digest: Uint8Array): string {
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return `SHA256:${btoa(binary).replace(/=+$/, '')}`;
}

export interface PublicKeyLine {
  type: string;
  /** Blob em base64. */
  key: string;
  comment: string;
}

/** Lê `ssh-ed25519 AAAA... comentário`. */
export function parsePublicKeyLine(line: string): PublicKeyLine | null {
  const m = /^(\S+)\s+([A-Za-z0-9+/]+={0,3})(?:\s+(.*))?$/.exec(line.trim());
  if (!m) return null;
  return { type: m[1]!, key: m[2]!, comment: (m[3] ?? '').trim() };
}

export interface IgnoredKnownHostLine {
  line: number;
  reason: string;
}

export type ParsedKnownHost = Omit<KnownHost, 'addedAt' | 'source'>;

/** Nome de host do known_hosts com porta: `[host]:porta` ou `host` (porta 22). */
function parseHostToken(token: string): { host: string; port: number } | null {
  const bracket = /^\[([^\]]+)\]:(\d+)$/.exec(token);
  if (bracket) {
    const port = Number(bracket[2]);
    return port >= 1 && port <= 65535 ? { host: bracket[1]!.toLowerCase(), port } : null;
  }
  return { host: token.toLowerCase(), port: 22 };
}

/**
 * Lê um `known_hosts` do OpenSSH: listas de nomes, `[host]:porta`, nomes em hash (`|1|salt|hash`)
 * e `@revoked`. Padrões com curinga e `@cert-authority` são ignorados.
 */
export function parseKnownHosts(text: string): { entries: ParsedKnownHost[]; ignored: IgnoredKnownHostLine[] } {
  const entries: ParsedKnownHost[] = [];
  const ignored: IgnoredKnownHostLine[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const content = raw.trim();
    if (!content || content.startsWith('#')) return;
    const fields = content.split(/\s+/);
    let revoked = false;
    if (fields[0]!.startsWith('@')) {
      const marker = fields.shift()!;
      if (marker === '@cert-authority') return void ignored.push({ line, reason: 'autoridades certificadoras não são suportadas' });
      if (marker !== '@revoked') return void ignored.push({ line, reason: `marcador desconhecido: ${marker}` });
      revoked = true;
    }
    const [names, keyType, key] = fields;
    if (!names || !keyType || !key || !/^[A-Za-z0-9+/]+={0,3}$/.test(key)) return void ignored.push({ line, reason: 'linha inválida' });
    for (const name of names.split(',')) {
      if (name.startsWith('|1|')) {
        entries.push({ host: name, port: 22, keyType, key, revoked });
        continue;
      }
      if (/[*?!]/.test(name)) {
        ignored.push({ line, reason: `padrão com curinga: ${name}` });
        continue;
      }
      const parsed = parseHostToken(name);
      if (!parsed) ignored.push({ line, reason: `nome inválido: ${name}` });
      else entries.push({ ...parsed, keyType, key, revoked });
    }
  });
  return { entries, ignored };
}

/** HMAC-SHA1 em base64 de `text` com a chave `saltBase64` (calculado no main). */
export type HashedNameMatcher = (saltBase64: string, text: string) => string;

/** Nome como o OpenSSH o grava em hash: `host` na porta 22, `[host]:porta` nas outras. */
export function knownHostName(host: string, port: number): string {
  return port === 22 ? host.toLowerCase() : `[${host.toLowerCase()}]:${port}`;
}

function entryMatches(entry: KnownHost, host: string, port: number, hmac: HashedNameMatcher): boolean {
  if (entry.host.startsWith('|1|')) {
    const [, , salt, hash] = entry.host.split('|');
    return !!salt && !!hash && hmac(salt, knownHostName(host, port)) === hash;
  }
  return entry.host === host.toLowerCase() && entry.port === port;
}

export type HostKeyCheck =
  | { status: 'known'; entry: KnownHost }
  | { status: 'unknown' }
  | { status: 'changed'; entries: KnownHost[] }
  | { status: 'revoked'; entry: KnownHost };

/**
 * Compara a chave apresentada com a lista. Revogada vence tudo; uma entrada igual é conhecida;
 * havendo entradas para o host e nenhuma igual, a chave mudou.
 */
export function checkHostKey(
  entries: readonly KnownHost[],
  target: { host: string; port: number; keyType: string; key: string },
  hmac: HashedNameMatcher,
): HostKeyCheck {
  const revoked = entries.find((e) => e.revoked && e.key === target.key);
  if (revoked) return { status: 'revoked', entry: revoked };
  const forHost = entries.filter((e) => !e.revoked && entryMatches(e, target.host, target.port, hmac));
  const same = forHost.find((e) => e.key === target.key);
  if (same) return { status: 'known', entry: same };
  // Chave de outro tipo para o mesmo host não conta como troca (servidores oferecem vários tipos).
  const sameType = forHost.filter((e) => e.keyType === target.keyType);
  return sameType.length > 0 ? { status: 'changed', entries: sameType } : { status: 'unknown' };
}
