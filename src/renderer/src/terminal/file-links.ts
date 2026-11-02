import type { ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import { findFileCandidates, resolveCandidatePath } from '@shared/file-links';
import { api } from '../api';
import { askDialog, useStore } from '../store';

const CACHE_TTL_MS = 30_000;
const existsCache = new Map<string, { exists: boolean; at: number }>();

/** Verifica em lote quais arquivos existem, com cache de 30 s. */
async function existing(paths: string[]): Promise<Set<string>> {
  const now = Date.now();
  const unknown = [...new Set(paths)].filter((p) => {
    const hit = existsCache.get(p.toLowerCase());
    return !hit || now - hit.at > CACHE_TTL_MS;
  });
  if (unknown.length > 0) {
    const flags = await api.invoke('fs:statMany', { paths: unknown }).catch(() => unknown.map(() => false));
    unknown.forEach((p, i) => existsCache.set(p.toLowerCase(), { exists: flags[i] ?? false, at: now }));
  }
  return new Set(paths.filter((p) => existsCache.get(p.toLowerCase())?.exists));
}

export async function openFileLink(file: string, line?: number, column?: number): Promise<void> {
  const result = await api.invoke('editor:open', { file, ...(line ? { line } : {}), ...(column ? { column } : {}) });
  if (result.ok) return;
  const choice = await askDialog({
    title: 'Não foi possível abrir no editor',
    message: result.error,
    detail: 'Configure o editor em settings.json ("editor": { "command", "args" }).',
    buttons: [
      { label: 'Fechar', value: 'close' },
      { label: 'Abrir settings.json', value: 'settings' },
      { label: 'Abrir com o programa padrão', value: 'default', primary: true },
    ],
  });
  if (choice === 'default') await api.invoke('editor:open', { file, useDefaultApp: true });
  if (choice === 'settings') await api.invoke('settings:openFile');
}

/** Caminhos de arquivo (com linha/coluna) clicáveis com Ctrl+clique; só os que existem viram link. */
export function registerFileLinks(term: Terminal, tabKey: string): void {
  const provider: ILinkProvider = {
    provideLinks(y, callback) {
      const text = term.buffer.active.getLine(y - 1)?.translateToString(true) ?? '';
      const candidates = findFileCandidates(text);
      if (candidates.length === 0) return callback(undefined);
      const state = useStore.getState();
      const tab = state.tabs.find((t) => t.key === tabKey);
      const profile = state.profiles.find((p) => p.id === tab?.profileId);
      const resolved = candidates.map((c) => ({ c, file: resolveCandidatePath(c.path, tab?.cwd ?? null, profile?.shellType ?? 'cmd', profile?.wslDistro) }));
      const files = resolved.map((r) => r.file).filter((f): f is string => !!f);
      void existing(files).then((ok) => {
        const links: ILink[] = resolved
          .filter((r) => r.file && ok.has(r.file))
          .map(({ c, file }) => ({
            text: c.text,
            range: { start: { x: c.start + 1, y }, end: { x: c.start + c.text.length, y } },
            decorations: { pointerCursor: true, underline: true },
            activate: (event: MouseEvent) => {
              if (event.ctrlKey) void openFileLink(file!, c.line, c.column);
            },
          }));
        callback(links.length > 0 ? links : undefined);
      });
    },
  };
  term.registerLinkProvider(provider);
}
