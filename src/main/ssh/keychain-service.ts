import { randomUUID } from 'node:crypto';
import type {
  ConfigSnapshot,
  HostsFile,
  Identity,
  KeychainFile,
  KeychainResult,
  KeychainSnapshot,
  KeychainUsage,
  KeySource,
  PublicIdentity,
  PublicSshKey,
  SaveResult,
  SecretChange,
  SshKey,
} from '@shared/model';
import { generateKey, parsePrivateKey, type ParsedPrivateKey } from './key-codec';
import type { SecretStore } from './secret-store';

export interface KeychainConfig {
  snapshot(): ConfigSnapshot;
  keychainFile(): KeychainFile;
  mutateKeychain(fn: (file: KeychainFile) => KeychainFile): Promise<SaveResult>;
  mutateHosts(fn: (file: HostsFile) => HostsFile): Promise<SaveResult>;
}

export interface KeychainDeps {
  config: KeychainConfig;
  secrets: SecretStore;
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  now?: () => number;
  newId?: () => string;
}

/** Material de uma chave para conectar (só no main). */
export type KeyMaterial =
  | { ok: true; privateKey: string; passphrase: string | null; encrypted: boolean; name: string }
  | { ok: false; error: string };

const MAX_KEY_FILE_BYTES = 64 * 1024;

const PARSE_ERRORS: Record<'needs-passphrase' | 'bad-passphrase' | 'unsupported' | 'invalid', string> = {
  'needs-passphrase': 'A chave é protegida por frase-senha.',
  'bad-passphrase': 'Frase-senha incorreta.',
  unsupported: 'Tipo de chave não suportado (use Ed25519, ECDSA ou RSA).',
  invalid: 'Formato de chave não reconhecido.',
};

/**
 * Chaves, senhas e identidades. Metadados em keychain.json (via ConfigStore), segredos no SecretStore.
 * Nada que sai daqui para o renderer contém segredo ou id de segredo.
 */
export class KeychainService {
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(private readonly deps: KeychainDeps) {
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? randomUUID;
  }

  /** Carrega os segredos e apaga os que nenhum metadado referencia (só com keychain.json válido). */
  async start(): Promise<void> {
    await this.deps.secrets.load();
    if (this.deps.config.snapshot().readOnly.keychain) return;
    await this.deps.secrets.retainOnly(this.referencedSecrets());
  }

  snapshot(): KeychainSnapshot {
    const file = this.deps.config.keychainFile();
    const { secrets } = this.deps;
    return {
      keys: file.keys.map(
        (k): PublicSshKey => ({
          id: k.id,
          name: k.name,
          type: k.type,
          fingerprint: k.fingerprint,
          publicKey: k.publicKey,
          comment: k.comment,
          source: k.source,
          filePath: k.filePath ?? null,
          encrypted: k.encrypted,
          privateKey: k.source === 'file' ? 'none' : secrets.state(k.privateKeySecretId),
          passphrase: secrets.state(k.passphraseSecretId),
          createdAt: k.createdAt,
        }),
      ),
      identities: file.identities.map(
        (i): PublicIdentity => ({ id: i.id, name: i.name, username: i.username, keyId: i.keyId ?? null, password: secrets.state(i.passwordSecretId) }),
      ),
      secretsAvailable: secrets.canStore(),
    };
  }

  // ---------- chaves ----------

  async importKey(req: { name: string; source: KeySource; passphrase?: string; savePassphrase: boolean }): Promise<KeychainResult<{ keyId: string }>> {
    let text: string;
    if (req.source.kind === 'file') {
      try {
        text = await this.deps.readFile(req.source.path);
      } catch (err) {
        return { ok: false, error: `Não foi possível ler o arquivo: ${err instanceof Error ? err.message : String(err)}` };
      }
    } else {
      text = req.source.text;
    }
    if (text.length > MAX_KEY_FILE_BYTES) return { ok: false, error: PARSE_ERRORS.invalid };
    const parsed = parsePrivateKey(text, req.passphrase || undefined);
    if (!parsed.ok) return { ok: false, error: PARSE_ERRORS[parsed.error], ...(parsed.error === 'needs-passphrase' ? { needsPassphrase: true } : {}) };

    const reference = req.source.kind === 'file' && req.source.mode === 'reference';
    return this.addKey(req.name, parsed.key, reference ? { filePath: (req.source as { path: string }).path } : { privateKey: text }, req.savePassphrase ? req.passphrase : undefined);
  }

  async generateKey(req: { name: string; type: 'ed25519' | 'rsa'; comment?: string; passphrase?: string; savePassphrase: boolean }): Promise<KeychainResult<{ keyId: string }>> {
    const error = this.deps.secrets.storeError();
    if (error) return { ok: false, error };
    const generated = generateKey(req.type, { comment: req.comment?.trim() || req.name, ...(req.passphrase ? { passphrase: req.passphrase } : {}) });
    return this.addKey(req.name, generated.parsed, { privateKey: generated.privateKey }, req.savePassphrase ? req.passphrase : undefined);
  }

  private async addKey(
    name: string,
    parsed: ParsedPrivateKey,
    content: { privateKey: string } | { filePath: string },
    passphrase: string | undefined,
  ): Promise<KeychainResult<{ keyId: string }>> {
    const { secrets } = this.deps;
    const needsSecret = 'privateKey' in content || (passphrase !== undefined && passphrase !== '');
    if (needsSecret) {
      const error = secrets.storeError();
      if (error) return { ok: false, error };
    }
    // Segredos antes dos metadados: se a gravação dos metadados falhar, sobram órfãos (apagados no próximo início).
    const privateKeySecretId = 'privateKey' in content ? await secrets.add(content.privateKey) : undefined;
    const passphraseSecretId = passphrase ? await secrets.add(passphrase) : undefined;
    const key: SshKey = {
      id: this.newId(),
      name: name.trim(),
      type: parsed.type,
      fingerprint: parsed.fingerprint,
      publicKey: parsed.publicKey,
      comment: parsed.comment,
      source: 'filePath' in content ? 'file' : 'stored',
      ...('filePath' in content ? { filePath: content.filePath } : {}),
      ...(privateKeySecretId ? { privateKeySecretId } : {}),
      ...(passphraseSecretId ? { passphraseSecretId } : {}),
      encrypted: parsed.encrypted,
      createdAt: this.now(),
    };
    const saved = await this.deps.config.mutateKeychain((f) => ({ ...f, keys: [...f.keys, key] }));
    if (!saved.ok) {
      await secrets.remove([privateKeySecretId, passphraseSecretId]);
      return saved;
    }
    return { ok: true, keyId: key.id };
  }

  /** Salva ou apaga a frase-senha de uma chave (conferindo que ela abre a chave). */
  async setKeyPassphrase(keyId: string, passphrase: string | null): Promise<SaveResult> {
    const key = this.key(keyId);
    if (!key) return { ok: false, error: 'Chave não encontrada.' };
    if (passphrase !== null) {
      const material = await this.loadKeyMaterial(keyId);
      if (!material.ok) return material;
      const check = parsePrivateKey(material.privateKey, passphrase);
      if (!check.ok) return { ok: false, error: PARSE_ERRORS[check.error] };
    }
    const old = key.passphraseSecretId;
    const id = passphrase ? await this.trySecret(passphrase) : null;
    if (id && typeof id !== 'string') return id;
    const saved = await this.deps.config.mutateKeychain((f) => ({
      ...f,
      keys: f.keys.map((k) => {
        if (k.id !== keyId) return k;
        const { passphraseSecretId: _drop, ...rest } = k;
        return id ? { ...rest, passphraseSecretId: id } : rest;
      }),
    }));
    if (!saved.ok) {
      if (id) await this.deps.secrets.remove([id]);
      return saved;
    }
    await this.deps.secrets.remove([old]);
    return { ok: true };
  }

  async renameKey(keyId: string, name: string): Promise<SaveResult> {
    if (!this.key(keyId)) return { ok: false, error: 'Chave não encontrada.' };
    return this.deps.config.mutateKeychain((f) => ({ ...f, keys: f.keys.map((k) => (k.id === keyId ? { ...k, name: name.trim() } : k)) }));
  }

  publicKey(keyId: string): string | null {
    return this.key(keyId)?.publicKey ?? null;
  }

  /** Grava a chave privada (como está guardada, com a mesma cifra) ou a pública num arquivo escolhido pelo usuário. */
  async exportKey(keyId: string, which: 'private' | 'public', path: string): Promise<SaveResult> {
    const key = this.key(keyId);
    if (!key) return { ok: false, error: 'Chave não encontrada.' };
    let text: string;
    if (which === 'public') {
      text = `${key.publicKey}\n`;
    } else {
      const material = await this.loadKeyMaterial(keyId);
      if (!material.ok) return material;
      text = material.privateKey.endsWith('\n') ? material.privateKey : `${material.privateKey}\n`;
    }
    try {
      await this.deps.writeFile(path, text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Não foi possível gravar: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  /** Chave privada e frase-senha salva, para conectar. */
  async loadKeyMaterial(keyId: string): Promise<KeyMaterial> {
    const key = this.key(keyId);
    if (!key) return { ok: false, error: 'Chave não encontrada no keychain.' };
    let privateKey: string | null;
    if (key.source === 'file') {
      try {
        privateKey = await this.deps.readFile(key.filePath!);
      } catch {
        return { ok: false, error: `Não foi possível ler a chave em ${key.filePath}.` };
      }
    } else {
      privateKey = this.deps.secrets.get(key.privateKeySecretId);
      if (privateKey === null) return { ok: false, error: `A chave "${key.name}" está indisponível neste computador ou nesta conta.` };
    }
    return { ok: true, privateKey, passphrase: this.deps.secrets.get(key.passphraseSecretId), encrypted: key.encrypted, name: key.name };
  }

  // ---------- identidades ----------

  async saveIdentity(req: { id?: string; name: string; username: string; keyId: string | null; password: SecretChange }): Promise<KeychainResult<{ identityId: string }>> {
    const file = this.deps.config.keychainFile();
    const current = req.id ? file.identities.find((i) => i.id === req.id) : undefined;
    if (req.id && !current) return { ok: false, error: 'Identidade não encontrada.' };
    if (req.keyId && !file.keys.some((k) => k.id === req.keyId)) return { ok: false, error: 'Chave não encontrada.' };

    let passwordSecretId = current?.passwordSecretId;
    let created: string | undefined;
    if (req.password.action === 'set') {
      const id = await this.trySecret(req.password.value);
      if (typeof id !== 'string') return id;
      created = id;
      passwordSecretId = id;
    } else if (req.password.action === 'clear') {
      passwordSecretId = undefined;
    }
    const identity: Identity = {
      id: current?.id ?? this.newId(),
      name: req.name.trim(),
      username: req.username.trim(),
      ...(req.keyId ? { keyId: req.keyId } : {}),
      ...(passwordSecretId ? { passwordSecretId } : {}),
    };
    const saved = await this.deps.config.mutateKeychain((f) => ({
      ...f,
      identities: current ? f.identities.map((i) => (i.id === identity.id ? identity : i)) : [...f.identities, identity],
    }));
    if (!saved.ok) {
      await this.deps.secrets.remove([created]);
      return saved;
    }
    if (current?.passwordSecretId && current.passwordSecretId !== passwordSecretId) await this.deps.secrets.remove([current.passwordSecretId]);
    return { ok: true, identityId: identity.id };
  }

  /**
   * "Salvar no keychain" no diálogo de senha: atualiza a senha da identidade do host ou, se ele não
   * tiver uma, cria a identidade (o chamador a liga ao host).
   */
  async rememberPassword(req: { identityId: string | null; username: string; name: string; password: string }): Promise<KeychainResult<{ identityId: string; created: boolean }>> {
    const existing = req.identityId ? this.deps.config.keychainFile().identities.find((i) => i.id === req.identityId) : undefined;
    const r = existing
      ? await this.saveIdentity({ id: existing.id, name: existing.name, username: existing.username, keyId: existing.keyId ?? null, password: { action: 'set', value: req.password } })
      : await this.saveIdentity({ name: req.name, username: req.username, keyId: null, password: { action: 'set', value: req.password } });
    return r.ok ? { ok: true, identityId: r.identityId, created: !existing } : r;
  }

  /** Usuário, senha e chave de uma identidade, para conectar. */
  identityCredentials(identityId: string): { username: string; password: string | null; keyId: string | null } | null {
    const identity = this.deps.config.keychainFile().identities.find((i) => i.id === identityId);
    if (!identity) return null;
    return { username: identity.username, password: this.deps.secrets.get(identity.passwordSecretId), keyId: identity.keyId ?? null };
  }

  // ---------- exclusão ----------

  usage(kind: 'key' | 'identity', id: string): KeychainUsage {
    const field = kind === 'key' ? 'keyId' : 'identityId';
    const hosts = this.deps.config.snapshot().hosts;
    return {
      hosts: hosts.hosts.filter((h) => h[field] === id).map((h) => h.name),
      groups: hosts.groups.filter((g) => g.defaults[field] === id).map((g) => g.name),
      identities: kind === 'key' ? this.deps.config.keychainFile().identities.filter((i) => i.keyId === id).map((i) => i.name) : [],
    };
  }

  /** Exclui a chave ou identidade, tira as referências de hosts, grupos e identidades e apaga os segredos. */
  async delete(kind: 'key' | 'identity', id: string): Promise<SaveResult> {
    const file = this.deps.config.keychainFile();
    const item = kind === 'key' ? file.keys.find((k) => k.id === id) : file.identities.find((i) => i.id === id);
    if (!item) return { ok: false, error: kind === 'key' ? 'Chave não encontrada.' : 'Identidade não encontrada.' };
    const field = kind === 'key' ? 'keyId' : 'identityId';
    const usage = this.usage(kind, id);
    if (usage.hosts.length > 0 || usage.groups.length > 0) {
      const unset = <T extends Partial<Record<typeof field, string>>>(o: T): T => {
        if (o[field] !== id) return o;
        const { [field]: _drop, ...rest } = o;
        return rest as T;
      };
      const r = await this.deps.config.mutateHosts((f) => ({
        ...f,
        hosts: f.hosts.map(unset),
        groups: f.groups.map((g) => ({ ...g, defaults: unset(g.defaults) })),
      }));
      if (!r.ok) return r;
    }
    const saved = await this.deps.config.mutateKeychain((f) =>
      kind === 'key'
        ? {
            ...f,
            keys: f.keys.filter((k) => k.id !== id),
            identities: f.identities.map((i) => {
              if (i.keyId !== id) return i;
              const { keyId: _drop, ...rest } = i;
              return rest;
            }),
          }
        : { ...f, identities: f.identities.filter((i) => i.id !== id) },
    );
    if (!saved.ok) return saved;
    const secretIds = kind === 'key' ? [(item as SshKey).privateKeySecretId, (item as SshKey).passphraseSecretId] : [(item as Identity).passwordSecretId];
    await this.deps.secrets.remove(secretIds);
    return { ok: true };
  }

  // ---------- auxiliares ----------

  private key(id: string): SshKey | undefined {
    return this.deps.config.keychainFile().keys.find((k) => k.id === id);
  }

  private async trySecret(value: string): Promise<string | { ok: false; error: string }> {
    const error = this.deps.secrets.storeError();
    if (error) return { ok: false, error };
    return this.deps.secrets.add(value);
  }

  private referencedSecrets(): Set<string> {
    const file = this.deps.config.keychainFile();
    const ids = new Set<string>();
    for (const k of file.keys) for (const id of [k.privateKeySecretId, k.passphraseSecretId]) if (id) ids.add(id);
    for (const i of file.identities) if (i.passwordSecretId) ids.add(i.passwordSecretId);
    return ids;
  }
}
