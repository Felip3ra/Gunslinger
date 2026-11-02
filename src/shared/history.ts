import type { ConfigFileName } from './model';

/** auto = captura após mudança; manual = ponto de restauração com nome; restore = antes de restaurar. */
export type HistoryKind = 'auto' | 'manual' | 'restore';

export interface HistoryEntry {
  id: string;
  createdAt: number;
  kind: HistoryKind;
  label: string | null;
  counts: { commands: number; projects: number; workspaces: number };
  hash: string;
}

export type HistoryFiles = Partial<Record<ConfigFileName, string>>;

export interface HistorySnapshot extends HistoryEntry {
  files: HistoryFiles;
}

export const HISTORY_KEEP = 50;

/** FNV-1a de 32 bits sobre os textos em ordem fixa (só para deduplicar). */
export function historyHash(files: HistoryFiles): string {
  let h = 0x811c9dc5;
  for (const name of Object.keys(files).sort()) {
    const text = `${name}\u0000${files[name as ConfigFileName] ?? ''}\u0000`;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

function countOf(text: string | undefined, key: string): number {
  if (!text) return 0;
  try {
    const value = (JSON.parse(text) as Record<string, unknown>)[key];
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}

export function historyCounts(files: HistoryFiles): HistoryEntry['counts'] {
  return {
    commands: countOf(files.commands, 'commands'),
    projects: countOf(files.projects, 'projects'),
    workspaces: countOf(files.workspaces, 'workspaces'),
  };
}

/** Automáticos além dos `keep` mais recentes; manuais e "antes de restaurar" nunca entram. */
export function entriesToPrune(entries: HistoryEntry[], keep = HISTORY_KEEP): HistoryEntry[] {
  const autos = entries.filter((e) => e.kind === 'auto').sort((a, b) => b.createdAt - a.createdAt);
  return autos.slice(keep);
}

/** Mais recente primeiro; empate pelo id (que cresce com o tempo). */
export function sortHistory(entries: HistoryEntry[]): HistoryEntry[] {
  return [...entries].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}
