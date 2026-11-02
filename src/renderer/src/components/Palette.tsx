import { useEffect, useMemo, useRef, useState } from 'react';
import { prepareItems, rankItems, type SearchItem } from '@shared/fuzzy';
import type { ActionId } from '@shared/model';
import { disabledEfRunnables, projectRunnables } from '@shared/project-runnables';
import { fromSavedCommand, type RunnableCommand } from '@shared/runnable';
import { actions } from '../actions';
import { canElevate, openElevated } from '../elevation';
import { applyEnvironment, openWithEnvironment } from '../environments';
import { openProject } from '../projects';
import { openWorkspace } from '../workspaces';
import { runCommand, type RunMode } from '../run-command';
import { activeTab, useStore, EMPTY } from '../store';
import { openTab } from '../tabs';
import { terminals } from '../terminal/terminal-registry';

type Kind = 'Comando' | 'Script' | 'Projeto' | 'Ação' | 'Perfil';

interface PaletteItem extends SearchItem {
  kind: Kind;
  shortcut: string | null;
  disabled: string | null;
  run(mode: RunMode): void;
}

function commandItem(c: RunnableCommand): PaletteItem {
  return {
    id: c.id,
    kind: c.source === 'node-script' ? 'Script' : 'Comando',
    title: c.title,
    secondary: [c.group, c.description].filter(Boolean).join(' · '),
    detail: c.text,
    shortcut: null,
    disabled: c.disabledReason ?? null,
    run: (mode) => void runCommand(c, mode),
  };
}

function useItems(): PaletteItem[] {
  const config = useStore((s) => s.config);
  const profiles = useStore((s) => s.profiles);
  const tab = useStore(activeTab);
  const analyses = useStore((s) => s.projectAnalyses);
  const plugins = useStore((s) => s.plugins);
  return useMemo(() => {
    if (!config) return [];
    const items: PaletteItem[] = [];
    const commands = config.commands.commands;
    for (const c of commands.filter((c) => c.projectId === null))
      items.push(commandItem(fromSavedCommand(c)));
    for (const c of plugins?.contributions.commands ?? [])
      if (c.projectId === null) items.push(commandItem(fromSavedCommand(c)));

    const project = tab?.projectId ? config.projects.projects.find((p) => p.id === tab.projectId) : undefined;
    if (project) {
      const r = projectRunnables(project, analyses[project.id], commands);
      for (const c of [
        ...r.linked,
        ...r.ef,
        ...r.launch,
        ...r.node.flatMap((g) => [...g.scripts, ...g.commands]),
      ])
        items.push(commandItem(c));
    }
    if (!project?.types.dotnet) for (const c of disabledEfRunnables()) items.push(commandItem(c));

    const keybindings = config.settings.keybindings;
    for (const action of Object.values(actions)) {
      if (action.id === 'palette.open') continue;
      items.push({
        id: `action:${action.id}`,
        kind: 'Ação',
        title: action.title,
        secondary: '',
        detail: '',
        shortcut: keybindings[action.id as ActionId] ?? null,
        disabled: null,
        run: () => void action.run(),
      });
    }
    items.push({
      id: 'action:projects',
      kind: 'Ação',
      title: 'Gerenciar projetos',
      secondary: '',
      detail: '',
      shortcut: null,
      disabled: null,
      run: () => useStore.setState({ projectsDialog: 'list' }),
    });
    for (const p of profiles.filter((p) => !p.hidden)) {
      items.push({
        id: `profile:${p.id}`,
        kind: 'Perfil',
        title: `Nova aba: ${p.name}`,
        secondary: p.executable,
        detail: '',
        shortcut: null,
        disabled: p.available ? null : 'Executável não encontrado',
        run: () => void openTab({ profileId: p.id }),
      });
      if (canElevate(p)) {
        items.push({
          id: `profile-admin:${p.id}`,
          kind: 'Perfil',
          title: `Nova aba como administrador: ${p.name}`,
          secondary: p.executable,
          detail: '',
          shortcut: null,
          disabled: null,
          run: () => void openElevated(p.id),
        });
      }
    }
    for (const env of config.settings.environments) {
      const base = {
        kind: 'Ação' as const,
        secondary: Object.keys(env.variables).join(', '),
        detail: '',
        shortcut: null,
        disabled: null,
      };
      items.push({
        ...base,
        id: `env-new:${env.id}`,
        title: `Nova aba com ambiente: ${env.name}`,
        run: () => void openWithEnvironment(env.id),
      });
      items.push({
        ...base,
        id: `env-apply:${env.id}`,
        title: `Aplicar ambiente: ${env.name}`,
        run: () => void applyEnvironment(env.id),
      });
    }
    for (const w of [...config.workspaces.workspaces, ...(plugins?.contributions.workspaces ?? [])]) {
      items.push({
        id: `workspace:${w.id}`,
        kind: 'Ação',
        title: `Abrir workspace: ${w.name}`,
        secondary: `${w.tabs.length} aba(s)`,
        detail: '',
        shortcut: null,
        disabled: null,
        run: () => void openWorkspace(w),
      });
    }
    for (const p of config.projects.projects) {
      items.push({
        id: `project:${p.id}`,
        kind: 'Projeto',
        title: `Abrir projeto: ${p.name}`,
        secondary: p.rootPath,
        detail: '',
        shortcut: null,
        disabled: null,
        run: () => void openProject(p),
      });
    }
    return items;
  }, [config, profiles, tab?.projectId, analyses, plugins]);
}

function Highlighted({ text, indexes }: { text: string; indexes: number[] }): JSX.Element {
  if (indexes.length === 0) return <>{text}</>;
  const set = new Set(indexes);
  return (
    <>{[...text].map((ch, i) => (set.has(i) ? <mark key={i}>{ch}</mark> : <span key={i}>{ch}</span>))}</>
  );
}

export function Palette(): JSX.Element | null {
  const open = useStore((s) => s.overlay === 'palette');
  const recents = useStore((s) => s.ui?.recents ?? EMPTY);
  const items = useItems();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prepared = useMemo(() => prepareItems(items), [items]);

  const results = useMemo(() => {
    if (query.trim()) return rankItems(query, prepared);
    // Campo vazio: usados recentemente primeiro.
    const order = new Map(recents.map((id, i) => [id, i]));
    return [...prepared]
      .sort((a, b) => (order.get(a.item.id) ?? Infinity) - (order.get(b.item.id) ?? Infinity))
      .map((p) => ({ item: p.item, score: 0, titleIndexes: [] as number[] }));
  }, [query, prepared, recents]);

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
  const activate = (index: number, mode: RunMode): void => {
    const result = results[index];
    if (!result) return;
    if (result.item.disabled) {
      useStore.getState().pushNotice('warning', result.item.disabled);
      return;
    }
    close();
    result.item.run(mode);
  };

  return (
    <div
      className="modal-backdrop palette-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="palette" role="dialog" aria-label="Paleta de comandos" data-testid="palette">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Buscar comandos, scripts, projetos e ações"
          aria-label="Buscar na paleta"
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
              activate(selected, e.shiftKey ? 'insert' : 'execute');
            }
          }}
        />
        <div className="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <p className="empty">Nenhum resultado</p>}
          {results.map((r, i) => (
            <div
              key={r.item.id}
              role="option"
              aria-selected={i === selected}
              aria-disabled={!!r.item.disabled}
              className={`palette-item ${i === selected ? 'selected' : ''} ${r.item.disabled ? 'disabled' : ''}`}
              data-testid="palette-item"
              title={r.item.disabled ?? r.item.detail}
              onMouseEnter={() => setSelected(i)}
              onClick={() => activate(i, 'execute')}
            >
              <span className="palette-kind">{r.item.kind}</span>
              <span className="palette-title">
                <Highlighted text={r.item.title} indexes={r.titleIndexes} />
                {r.item.disabled && <em className="hint"> — {r.item.disabled}</em>}
              </span>
              <span className="palette-secondary">{r.item.secondary || r.item.detail}</span>
              {r.item.shortcut && <kbd>{r.item.shortcut}</kbd>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
