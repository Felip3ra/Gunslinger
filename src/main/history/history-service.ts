import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  entriesToPrune,
  historyCounts,
  historyHash,
  sortHistory,
  type HistoryEntry,
  type HistoryFiles,
  type HistoryKind,
  type HistorySnapshot,
} from '@shared/history';
import type { SaveResult } from '@shared/model';
import { writeFileAtomic } from '../config/atomic-write';

/** O que o histórico precisa do `ConfigStore`. */
export interface HistorySource {
  fileTexts(): HistoryFiles | null;
  restoreFiles(texts: HistoryFiles): Promise<SaveResult>;
  onChange(listener: () => void): () => void;
}

const ID = /^\d{13}-\d{3}$/;

/** Snapshots versionados dos dados do usuário em `<dados>/history/`. */
export class HistoryService {
  private timer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;
  private seq = 0;
  /** Serializa capturas, restaurações e exclusões (evita duas gravações com o mesmo estado). */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly dir: string,
    private readonly source: HistorySource,
    private readonly options: { debounceMs?: number; keep?: number; now?: () => number } = {},
  ) {}

  /** Captura o estado inicial e passa a capturar após cada mudança. */
  async start(): Promise<void> {
    await this.capture('auto');
    this.unsubscribe = this.source.onChange(() => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.capture('auto'), this.options.debounceMs ?? 3000);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** Grava um snapshot; automáticos iguais ao mais recente são ignorados. */
  capture(kind: HistoryKind, label: string | null = null): Promise<SaveResult> {
    return this.serial(() => this.captureNow(kind, label));
  }

  private async captureNow(kind: HistoryKind, label: string | null): Promise<SaveResult> {
    const files = this.source.fileTexts();
    if (!files) return { ok: false, error: 'Há arquivos de configuração inválidos; corrija-os antes de criar um ponto de restauração.' };
    const hash = historyHash(files);
    const entries = await this.readEntries();
    if (kind === 'auto' && entries[0]?.hash === hash) return { ok: true };

    const createdAt = (this.options.now ?? Date.now)();
    const id = `${String(createdAt).padStart(13, '0')}-${String(this.seq++ % 1000).padStart(3, '0')}`;
    const snapshot: HistorySnapshot = { id, createdAt, kind, label, counts: historyCounts(files), hash, files };
    await mkdir(this.dir, { recursive: true });
    await writeFileAtomic(join(this.dir, `${id}.json`), JSON.stringify(snapshot));

    for (const old of entriesToPrune([snapshot, ...entries], this.options.keep)) await rm(join(this.dir, `${old.id}.json`), { force: true });
    return { ok: true };
  }

  list(): Promise<HistoryEntry[]> {
    return this.serial(() => this.readEntries());
  }

  private async readEntries(): Promise<HistoryEntry[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const entries: HistoryEntry[] = [];
    for (const name of names) {
      const snapshot = await this.read(name.replace(/\.json$/, ''));
      if (snapshot) {
        const { files: _files, ...entry } = snapshot;
        entries.push(entry);
      }
    }
    return sortHistory(entries);
  }

  private async read(id: string): Promise<HistorySnapshot | null> {
    if (!ID.test(id)) return null;
    try {
      const data = JSON.parse(await readFile(join(this.dir, `${id}.json`), 'utf8')) as HistorySnapshot;
      return data.id === id && typeof data.files === 'object' ? data : null;
    } catch {
      return null;
    }
  }

  /** Grava "antes de restaurar" e substitui os arquivos pelos do snapshot. */
  restore(id: string): Promise<SaveResult> {
    return this.serial(async () => {
      const snapshot = await this.read(id);
      if (!snapshot) return { ok: false, error: 'Snapshot não encontrado.' };
      const current = this.source.fileTexts();
      // Com arquivo inválido não dá para capturar o estado atual; o .bak da gravação guarda o conteúdo.
      if (current) await this.captureNow('restore', 'Antes de restaurar');
      return this.source.restoreFiles(snapshot.files);
    });
  }

  remove(id: string): Promise<SaveResult> {
    return this.serial(async () => {
      if (!ID.test(id)) return { ok: false, error: 'Snapshot não encontrado.' };
      await rm(join(this.dir, `${id}.json`), { force: true });
      return { ok: true };
    });
  }
}
