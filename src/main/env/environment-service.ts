import type { PlatformAdapter } from '../platform';
import type { Env } from './env-utils';

function sameEnv(a: Env, b: Env): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

export interface EnvSnapshot {
  env: Env;
  generation: number;
}

/**
 * Fonte única do ambiente para shells e ferramentas. A geração 0 é o ambiente do lançamento;
 * cada "Recarregar ambiente" bem-sucedido cria uma geração nova.
 */
export class EnvironmentService {
  private snapshot: EnvSnapshot;
  private readonly listeners = new Set<(snapshot: EnvSnapshot) => void>();

  constructor(
    private readonly platform: PlatformAdapter,
    initial: Env,
  ) {
    this.snapshot = { env: { ...initial }, generation: 0 };
  }

  current(): EnvSnapshot {
    return this.snapshot;
  }

  async reload(): Promise<{ envGeneration: number } | { error: string }> {
    try {
      const env = await this.platform.readSystemEnvironment(this.snapshot.env);
      this.snapshot = { env, generation: this.snapshot.generation + 1 };
    } catch (err) {
      // Falha na leitura: o ambiente anterior continua valendo.
      return { error: err instanceof Error ? err.message : String(err) };
    }
    for (const listener of this.listeners) listener(this.snapshot);
    return { envGeneration: this.snapshot.generation };
  }

  /**
   * Recarrega só se o ambiente do sistema mudou de fato (o aviso do Windows também chega por
   * mudanças de tema, idioma etc.). Devolve true quando criou uma geração nova.
   */
  async reloadIfChanged(): Promise<boolean> {
    let env: Env;
    try {
      env = await this.platform.readSystemEnvironment(this.snapshot.env);
    } catch {
      return false;
    }
    if (sameEnv(env, this.snapshot.env)) return false;
    this.snapshot = { env, generation: this.snapshot.generation + 1 };
    for (const listener of this.listeners) listener(this.snapshot);
    return true;
  }

  onChange(listener: (snapshot: EnvSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
