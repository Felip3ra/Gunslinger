import { createHmac } from 'node:crypto';
import { checkHostKey, parseKnownHosts, type HashedNameMatcher, type HostKeyCheck, type IgnoredKnownHostLine } from '@shared/known-hosts';
import type { KnownHost, KnownHostsFile, KnownHostView, SaveResult } from '@shared/model';
import { fingerprintOf } from './key-codec';

export interface KnownHostsConfig {
  knownHostsFile(): KnownHostsFile;
  mutateKnownHosts(fn: (file: KnownHostsFile) => KnownHostsFile): Promise<SaveResult>;
}

/** Chave apresentada pelo servidor. */
export interface PresentedKey {
  host: string;
  port: number;
  keyType: string;
  /** Blob em base64. */
  key: string;
}

export const hmacSha1: HashedNameMatcher = (salt, text) => createHmac('sha1', Buffer.from(salt, 'base64')).update(text).digest('base64');

export function fingerprintOfBase64(key: string): string {
  return fingerprintOf(Buffer.from(key, 'base64'));
}

const sameEntry = (a: Pick<KnownHost, 'host' | 'port' | 'key'>, b: Pick<KnownHost, 'host' | 'port' | 'key'>): boolean =>
  a.host === b.host && a.port === b.port && a.key === b.key;

/** Lista de hosts conhecidos (known_hosts.json via ConfigStore). */
export class KnownHostsService {
  constructor(
    private readonly config: KnownHostsConfig,
    private readonly now: () => number = Date.now,
  ) {}

  check(target: PresentedKey): HostKeyCheck {
    return checkHostKey(this.config.knownHostsFile().entries, target, hmacSha1);
  }

  /** "Confiar e conectar": grava a chave do host. */
  accept(target: PresentedKey): Promise<SaveResult> {
    const entry: KnownHost = { ...target, host: target.host.toLowerCase(), addedAt: this.now(), revoked: false, source: 'app' };
    return this.config.mutateKnownHosts((f) => (f.entries.some((e) => !e.revoked && sameEntry(e, entry)) ? f : { ...f, entries: [...f.entries, entry] }));
  }

  /** "Substituir a chave gravada": troca as chaves do mesmo tipo para o host pela apresentada. Revogadas continuam. */
  replace(target: PresentedKey): Promise<SaveResult> {
    if (this.check(target).status === 'revoked') return Promise.resolve({ ok: false, error: 'Esta chave do servidor foi revogada.' });
    const host = target.host.toLowerCase();
    const old = this.check(target);
    const stale = old.status === 'changed' ? old.entries : [];
    const entry: KnownHost = { ...target, host, addedAt: this.now(), revoked: false, source: 'app' };
    return this.config.mutateKnownHosts((f) => ({ ...f, entries: [...f.entries.filter((e) => !stale.some((s) => sameEntry(s, e))), entry] }));
  }

  list(): KnownHostView[] {
    return this.config.knownHostsFile().entries.map((e) => ({
      host: e.host.startsWith('|1|') ? 'nome oculto' : e.host,
      port: e.port,
      keyType: e.keyType,
      fingerprint: fingerprintOfBase64(e.key),
      addedAt: e.addedAt,
      revoked: e.revoked,
      hashed: e.host.startsWith('|1|'),
    }));
  }

  /** Exclui pela posição na lista (entradas em hash não têm nome para identificar). */
  delete(index: number): Promise<SaveResult> {
    return this.config.mutateKnownHosts((f) => {
      if (index < 0 || index >= f.entries.length) throw new Error('Entrada não encontrada.');
      return { ...f, entries: f.entries.filter((_, i) => i !== index) };
    });
  }

  /** Importa um known_hosts do OpenSSH, sem duplicar entradas. */
  async importOpenSsh(text: string): Promise<{ ok: true; added: number; ignored: IgnoredKnownHostLine[] } | { ok: false; error: string }> {
    const { entries, ignored } = parseKnownHosts(text);
    let added = 0;
    const saved = await this.config.mutateKnownHosts((f) => {
      const next = [...f.entries];
      for (const e of entries) {
        if (next.some((n) => n.revoked === e.revoked && sameEntry(n, e))) continue;
        next.push({ ...e, addedAt: this.now(), source: 'openssh' });
        added++;
      }
      return { ...f, entries: next };
    });
    return saved.ok ? { ok: true, added, ignored } : saved;
  }
}
