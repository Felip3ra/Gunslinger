import type { PlatformAdapter } from '../platform';
import type { Env } from './env-utils';

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

  onChange(listener: (snapshot: EnvSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
