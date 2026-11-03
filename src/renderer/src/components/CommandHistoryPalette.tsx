import { useEffect, useMemo, useRef, useState } from 'react';
import type { CommandHistoryEntry } from '@shared/command-history';
import { prepareItems, rankItems, type SearchItem } from '@shared/fuzzy';
import { applyHistoryEntry } from '../command-history';
import { EMPTY, useStore } from '../store';
import { terminals } from '../terminal/terminal-registry';

interface HistoryItem extends SearchItem {
  entry: CommandHistoryEntry;
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias". */
export function timeAgo(at: number, now = Date.now()): string {
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

/** Busca nos comandos digitados em todas as abas. Enter escreve no terminal; Ctrl+Enter executa. */
export function CommandHistoryPalette(): JSX.Element | null {
  const open = useStore((s) => s.overlay === 'commandHistory');
  const history = useStore((s) => s.ui?.commandHistory ?? EMPTY);
  const enabled = useStore((s) => s.config?.settings.terminal.commandHistory ?? true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const prepared = useMemo(
    () =>
      prepareItems<HistoryItem>(
        history.map((entry) => ({ id: entry.command, title: entry.command, secondary: entry.cwd ?? '', detail: '', entry })),
      ),
    [history],
  );
  // Campo vazio: os mais recentes primeiro (a ordem do histórico).
  const results = useMemo(() => rankItems(query, prepared, 500), [query, prepared]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const close = (): void => {
    useStore.setState({ overlay: null });
    const key = useStore.getState().activeKey;
    if (key) terminals.focus(key);
  };
  const activate = (index: number, execute: boolean): void => {
    const result = results[index];
    if (!result) return;
    useStore.setState({ overlay: null });
    applyHistoryEntry(result.item.entry, execute);
  };

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="palette" role="dialog" aria-label="Histórico de comandos" data-testid="command-history">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Buscar nos comandos digitados (Enter escreve no terminal, Ctrl+Enter executa)"
          aria-label="Buscar no histórico de comandos"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              activate(selected, e.ctrlKey);
            }
          }}
        />
        <div className="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && (
            <p className="empty">
              {!enabled ? 'O histórico de comandos está desligado (Configurações > Terminal e editor).' : history.length === 0 ? 'Nenhum comando guardado ainda.' : 'Nenhum resultado'}
            </p>
          )}
          {results.map((r, i) => {
            const { entry } = r.item;
            const failed = entry.exitCode !== null && entry.exitCode !== 0;
            return (
              <div
                key={entry.command}
                role="option"
                aria-selected={i === selected}
                className={`palette-item ${i === selected ? 'selected' : ''}`}
                data-testid="command-history-item"
                title={entry.cwd ?? undefined}
                onMouseEnter={() => setSelected(i)}
                onClick={(e) => activate(i, e.ctrlKey)}
              >
                <span className={`palette-kind ${failed ? 'history-failed' : ''}`} title={failed ? `Saiu com código ${entry.exitCode}` : undefined}>
                  {failed ? `✗ ${entry.exitCode}` : entry.count > 1 ? `${entry.count}×` : '›'}
                </span>
                <span className="palette-title mono">
                  <Highlighted text={entry.command} indexes={r.titleIndexes} />
                </span>
                <span className="palette-secondary">
                  {entry.cwd ? `${entry.cwd} · ` : ''}
                  {timeAgo(entry.at)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Highlighted({ text, indexes }: { text: string; indexes: number[] }): JSX.Element {
  if (indexes.length === 0) return <>{text}</>;
  const set = new Set(indexes);
  return <>{[...text].map((ch, i) => (set.has(i) ? <mark key={i}>{ch}</mark> : <span key={i}>{ch}</span>))}</>;
}
