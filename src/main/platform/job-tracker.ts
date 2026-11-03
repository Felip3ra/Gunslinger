import type { ProcessTracker, TrackedProcess } from './types';

/** Processo auxiliar que fala o protocolo de linhas do rastreador. */
export interface HelperProcess {
  write(line: string): void;
  onLine(listener: (line: string) => void): void;
  onExit(listener: () => void): void;
  kill(): void;
}

/** A primeira requisição inclui a compilação do auxiliar (Add-Type), que leva alguns segundos. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Processos do console que somem junto com o processo dono; não são mostrados ao usuário. */
const HIDDEN = new Set(['conhost', 'openconsole']);

/** Converte a resposta de `release` (`pid:nome` separados por tabulação). */
export function parseReleased(text: string): TrackedProcess[] {
  if (!text.trim()) return [];
  return text
    .split('\t')
    .map((part) => {
      const sep = part.indexOf(':');
      return { pid: Number(part.slice(0, sep)), name: part.slice(sep + 1).trim() };
    })
    .filter((p) => Number.isInteger(p.pid) && p.pid > 0 && !HIDDEN.has(p.name.toLowerCase()));
}

/**
 * Rastreador de processos por grupo (Job Object no Windows), via um processo auxiliar iniciado
 * sob demanda. Protocolo: `track <id> <chave> <pid>` → `<id> ok|err ...`;
 * `release <id> <chave>` → `<id> <pid:nome>\t...`. Falhas nunca impedem o uso do terminal.
 */
export class JobTracker implements ProcessTracker {
  private helper: HelperProcess | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, (result: string) => void>();

  constructor(private readonly startHelper: () => HelperProcess) {}

  track(key: string, pid: number): void {
    void this.request((id) => `track ${id} ${key} ${pid}`);
  }

  async release(key: string): Promise<TrackedProcess[]> {
    return parseReleased(await this.request((id) => `release ${id} ${key}`));
  }

  dispose(): void {
    this.helper?.kill();
    this.helper = null;
    this.failAll();
  }

  private request(line: (id: number) => string): Promise<string> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      let helper: HelperProcess;
      try {
        helper = this.ensureHelper();
      } catch {
        resolve('');
        return;
      }
      // Auxiliar travado não pode segurar o fechamento da aba.
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) resolve('');
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      helper.write(line(id));
    });
  }

  private ensureHelper(): HelperProcess {
    if (this.helper) return this.helper;
    const helper = this.startHelper();
    helper.onLine((line) => {
      const sep = line.indexOf(' ');
      const id = Number(sep < 0 ? line : line.slice(0, sep));
      const resolve = this.pending.get(id);
      if (!resolve) return;
      this.pending.delete(id);
      resolve(sep < 0 ? '' : line.slice(sep + 1));
    });
    helper.onExit(() => {
      if (this.helper === helper) this.helper = null;
      this.failAll();
    });
    this.helper = helper;
    return helper;
  }

  private failAll(): void {
    for (const resolve of this.pending.values()) resolve('');
    this.pending.clear();
  }
}
