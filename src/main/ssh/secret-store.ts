import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { SecretState } from '@shared/model';
import { writeFileAtomic } from '../config/atomic-write';
import type { SecretPort } from '../ports';

const secretsFileSchema = z.object({
  version: z.literal(1),
  secrets: z.record(z.string().min(1), z.string().min(1)),
});

export const SECRETS_FILE = 'secrets.json';

/**
 * Segredos cifrados pelo cofre do sistema, em `secrets.json` (id → base64 cifrado).
 * Nunca sai do processo principal. Arquivo ilegível não é sobrescrito: os segredos ficam "indisponíveis".
 */
export class SecretStore {
  private secrets = new Map<string, string>();
  private unavailable = new Set<string>();
  private readable = true;
  private write: Promise<void> = Promise.resolve();

  constructor(
    private readonly dir: string,
    private readonly port: SecretPort,
  ) {}

  get path(): string {
    return join(this.dir, SECRETS_FILE);
  }

  async load(): Promise<void> {
    this.secrets.clear();
    this.unavailable.clear();
    let text: string;
    try {
      text = await readFile(this.path, 'utf8');
    } catch (err) {
      this.readable = (err as NodeJS.ErrnoException).code === 'ENOENT';
      return;
    }
    let parsed: z.infer<typeof secretsFileSchema>;
    try {
      parsed = secretsFileSchema.parse(JSON.parse(text));
    } catch {
      this.readable = false;
      return;
    }
    this.readable = true;
    for (const [id, cipher] of Object.entries(parsed.secrets)) {
      this.secrets.set(id, cipher);
      if (!this.tryDecrypt(cipher)) this.unavailable.add(id);
    }
  }

  /** Dá para gravar segredos novos: cofre disponível e arquivo legível. */
  canStore(): boolean {
    return this.readable && this.port.isAvailable();
  }

  /** Por que não dá para gravar, em português (null quando dá). */
  storeError(): string | null {
    if (!this.port.isAvailable()) return 'O cofre do sistema não está disponível; o segredo não pode ser salvo.';
    if (!this.readable) return `${SECRETS_FILE} está ilegível; restaure ${SECRETS_FILE}.bak ou apague o arquivo para salvar segredos de novo.`;
    return null;
  }

  state(id: string | undefined): SecretState {
    if (!id) return 'none';
    if (!this.readable || this.unavailable.has(id)) return 'unavailable';
    return this.secrets.has(id) ? 'saved' : 'unavailable';
  }

  /** Segredo decifrado, ou null se não existe ou não pode ser decifrado. */
  get(id: string | undefined): string | null {
    if (!id || this.unavailable.has(id)) return null;
    const cipher = this.secrets.get(id);
    return cipher ? this.tryDecrypt(cipher) : null;
  }

  /** Grava um segredo novo e devolve o id. */
  async add(plain: string): Promise<string> {
    const error = this.storeError();
    if (error) throw new Error(error);
    const id = randomUUID();
    this.secrets.set(id, this.port.encrypt(plain));
    await this.persist();
    return id;
  }

  async remove(ids: (string | undefined)[]): Promise<void> {
    let changed = false;
    for (const id of ids) {
      if (id && this.secrets.delete(id)) {
        this.unavailable.delete(id);
        changed = true;
      }
    }
    if (changed) await this.persist();
  }

  /** Apaga os segredos que nenhum metadado referencia mais. */
  async retainOnly(ids: ReadonlySet<string>): Promise<number> {
    const orphans = [...this.secrets.keys()].filter((id) => !ids.has(id));
    await this.remove(orphans);
    return orphans.length;
  }

  ids(): string[] {
    return [...this.secrets.keys()];
  }

  private tryDecrypt(cipher: string): string | null {
    try {
      return this.port.decrypt(cipher);
    } catch {
      return null;
    }
  }

  private persist(): Promise<void> {
    if (!this.readable) return Promise.reject(new Error(this.storeError() ?? 'secrets.json ilegível'));
    const text = JSON.stringify({ version: 1, secrets: Object.fromEntries(this.secrets) }, null, 2) + '\n';
    const next = this.write.then(() => writeFileAtomic(this.path, text, { backup: true }));
    this.write = next.catch(() => undefined);
    return next;
  }
}
