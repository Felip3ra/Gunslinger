import { useEffect, useRef, useState } from 'react';
import type { ISearchOptions } from '@xterm/addon-search';
import { useStore } from '../store';
import { terminals } from '../terminal/terminal-registry';

const DECORATIONS: ISearchOptions['decorations'] = {
  matchBackground: '#634d00',
  matchOverviewRuler: '#d29922',
  activeMatchBackground: '#9e6a03',
  activeMatchColorOverviewRuler: '#f0b72f',
};

/** Busca na saída do terminal ativo (Ctrl+F), com destaques de todas as ocorrências. */
export function SearchBar(): JSX.Element | null {
  const activeKey = useStore((s) => s.activeKey);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [opts, setOpts] = useState({ caseSensitive: false, wholeWord: false, regex: false });
  const [results, setResults] = useState<{ index: number; count: number } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onFind = (): void => {
      setOpen(true);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    };
    window.addEventListener('gunslinger:find', onFind);
    return () => window.removeEventListener('gunslinger:find', onFind);
  }, []);

  const addon = activeKey ? terminals.searchAddon(activeKey) : undefined;
  useEffect(() => {
    if (!addon) return;
    const sub = addon.onDidChangeResults(({ resultIndex, resultCount }) => setResults({ index: resultIndex, count: resultCount }));
    return () => sub.dispose();
  }, [addon]);

  const search = (direction: 'next' | 'prev', incremental = false): void => {
    if (!addon) return;
    if (!query) {
      addon.clearDecorations();
      setResults(null);
      return;
    }
    if (opts.regex) {
      try {
        new RegExp(query);
      } catch {
        setInvalid(true);
        addon.clearDecorations();
        setResults(null);
        return;
      }
    }
    setInvalid(false);
    const options: ISearchOptions = { ...opts, incremental, decorations: DECORATIONS };
    if (direction === 'next') addon.findNext(query, options);
    else addon.findPrevious(query, options);
  };

  useEffect(() => {
    if (open) search('next', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, opts, open]);

  if (!open) return null;
  const close = (): void => {
    addon?.clearDecorations();
    setOpen(false);
    setResults(null);
    if (activeKey) terminals.focus(activeKey);
  };
  const toggle = (key: keyof typeof opts, label: string, title: string): JSX.Element => (
    <button type="button" className={`toggle ${opts[key] ? 'on' : ''}`} aria-pressed={opts[key]} title={title} onClick={() => setOpts({ ...opts, [key]: !opts[key] })}>
      {label}
    </button>
  );

  return (
    <div className="searchbar" role="search" data-testid="searchbar">
      <input
        ref={inputRef}
        aria-label="Buscar no terminal"
        aria-invalid={invalid}
        placeholder="Buscar"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            search(e.shiftKey ? 'prev' : 'next');
          }
        }}
      />
      {toggle('caseSensitive', 'Aa', 'Diferenciar maiúsculas')}
      {toggle('wholeWord', 'ab', 'Palavra inteira')}
      {toggle('regex', '.*', 'Expressão regular')}
      <span className="search-count" data-testid="search-count">
        {invalid ? 'Expressão inválida' : results && query ? (results.count > 0 ? `${results.index + 1} de ${results.count}` : 'Nenhum resultado') : ''}
      </span>
      <button type="button" aria-label="Anterior" onClick={() => search('prev')}>
        ↑
      </button>
      <button type="button" aria-label="Próximo" onClick={() => search('next')}>
        ↓
      </button>
      <button type="button" aria-label="Fechar busca" onClick={close}>
        ×
      </button>
    </div>
  );
}
