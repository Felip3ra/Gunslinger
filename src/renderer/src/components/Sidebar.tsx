import { useMemo, useRef, useState, type ReactNode } from 'react';
import { globalCommands, groupByCategory } from '@shared/commands';
import type { SavedCommand } from '@shared/model';
import { isPluginItem } from '@shared/plugins';
import { fromSavedCommand, type RunnableCommand } from '@shared/runnable';
import { api } from '../api';
import { runCommand } from '../run-command';
import { confirmDialog, useStore, EMPTY } from '../store';
import { matchesFilter } from '@shared/text';
import { HostsSection } from './HostsSection';

export function newCommand(partial: Partial<SavedCommand> = {}): SavedCommand {
  return {
    id: '',
    name: '',
    command: '',
    description: '',
    category: '',
    targetProfileId: null,
    cwd: null,
    projectId: null,
    variables: {},
    ...partial,
  };
}

export function CommandRow({
  command,
  saved,
  warning,
}: {
  command: RunnableCommand;
  saved?: SavedCommand;
  warning?: string | null;
}): JSX.Element {
  const selected = useStore((s) => s.selectedCommandId === command.id);
  const disabled = !!command.disabledReason;
  return (
    <div
      className={`command-row ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      data-testid="command-row"
      title={command.disabledReason ?? (command.description || command.text)}
      onClick={() => useStore.setState({ selectedCommandId: command.id })}
      onKeyDown={(e) => {
        // Enter sobre o comando é uma ação explícita de executar.
        if (e.key === 'Enter') {
          e.preventDefault();
          void runCommand(command, e.shiftKey ? 'insert' : 'execute');
        }
      }}
    >
      <div className="command-main">
        <span className="command-name">
          {warning && (
            <span className="warn-icon" title={warning}>
              ⚠
            </span>
          )}
          {command.title}
        </span>
        <code className="command-text">{command.text}</code>
      </div>
      <div className="command-actions">
        <button
          aria-label={`Executar ${command.title}`}
          title="Executar"
          disabled={disabled}
          onClick={() => void runCommand(command, 'execute')}
        >
          ▶
        </button>
        <button
          aria-label={`Inserir ${command.title}`}
          title="Inserir sem executar"
          disabled={disabled}
          onClick={() => void runCommand(command, 'insert')}
        >
          ⤓
        </button>
        {saved && (
          <>
            <button
              aria-label={`Editar ${command.title}`}
              title="Editar"
              onClick={() => useStore.setState({ editingCommand: saved })}
            >
              ✎
            </button>
            <button
              aria-label={`Duplicar ${command.title}`}
              title="Duplicar"
              onClick={() =>
                useStore.setState({ editingCommand: { ...saved, id: '', name: `${saved.name} (cópia)` } })
              }
            >
              ⧉
            </button>
            <button
              aria-label={`Excluir ${command.title}`}
              title="Excluir"
              onClick={async () => {
                if (!(await confirmDialog('Excluir comando', `Excluir "${saved.name}"?`, 'Excluir'))) return;
                const result = await api.invoke('commands:delete', { id: saved.id });
                if (!result.ok) useStore.getState().pushNotice('error', result.error);
              }}
            >
              🗑
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function Group({
  label,
  children,
  actions,
  testId,
}: {
  label: string;
  children: ReactNode;
  actions?: ReactNode;
  testId?: string;
}): JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <section className="group" data-testid={testId}>
      <header className="group-header">
        <button className="group-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '▾' : '▸'} {label}
        </button>
        {actions}
      </header>
      {open && <div role="listbox">{children}</div>}
    </section>
  );
}

function targetWarning(command: SavedCommand): string | null {
  if (!command.targetProfileId) return null;
  const profile = useStore.getState().profiles.find((p) => p.id === command.targetProfileId);
  return profile && profile.available ? null : 'Shell de destino não encontrado';
}

export function Sidebar({ projectSection }: { projectSection?: ReactNode }): JSX.Element {
  const commands = useStore((s) => s.config?.commands.commands ?? EMPTY);
  const pluginCommands = useStore((s) => s.plugins?.contributions.commands ?? EMPTY);
  const profiles = useStore((s) => s.profiles);
  const sidebar = useStore((s) => s.ui!.sidebar);
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);
  const dragging = useRef(false);

  const groups = useMemo(() => {
    const visible = globalCommands([...commands, ...pluginCommands]).filter((c) =>
      matchesFilter(filter, [c.name, c.command, c.category, c.description]),
    );
    return groupByCategory(visible);
    // profiles: o aviso de shell ausente depende da lista de perfis
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, pluginCommands, filter, profiles]);

  const startResize = (e: React.MouseEvent): void => {
    dragging.current = true;
    const startX = e.clientX;
    const startWidth = sidebar.width;
    let width = startWidth;
    const move = (ev: MouseEvent): void => {
      width = Math.min(800, Math.max(160, startWidth + ev.clientX - startX));
      const ui = useStore.getState().ui!;
      useStore.getState().setUi({ ...ui, sidebar: { ...ui.sidebar, width } });
    };
    const up = (): void => {
      dragging.current = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      void api.invoke('state:patch', { sidebar: { visible: true, width } });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <aside className="sidebar" style={{ width: sidebar.width }} data-testid="sidebar">
      <div className="sidebar-toolbar">
        <input
          placeholder="Filtrar comandos"
          aria-label="Filtrar comandos"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          title="Novo comando"
          aria-label="Novo comando"
          onClick={() => useStore.setState({ editingCommand: newCommand() })}
        >
          +
        </button>
        <button
          title="Projetos"
          aria-label="Projetos"
          onClick={() => useStore.setState({ projectsDialog: 'list' })}
        >
          ◆
        </button>
      </div>
      {projectSection}
      <HostsSection />
      {groups.length === 0 && (
        <p className="empty">{filter ? 'Nenhum comando encontrado.' : 'Nenhum comando salvo ainda.'}</p>
      )}
      {groups.map((g) => (
        <Group
          key={g.category}
          label={g.label}
          testId="category"
          actions={
            g.category && commands.some((c) => c.category === g.category) ? (
              <button
                className="link small"
                title="Renomear categoria"
                aria-label={`Renomear ${g.label}`}
                onClick={() => setRenaming({ from: g.category, to: g.category })}
              >
                ✎
              </button>
            ) : undefined
          }
        >
          {g.commands.map((c) => (
            <CommandRow
              key={c.id}
              command={fromSavedCommand(c)}
              saved={isPluginItem(c.id) ? undefined : c}
              warning={targetWarning(c)}
            />
          ))}
        </Group>
      ))}
      {renaming && (
        <div className="modal-backdrop">
          <form
            className="modal"
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await api.invoke('commands:renameCategory', renaming);
              if (!result.ok) useStore.getState().pushNotice('error', result.error);
              setRenaming(null);
            }}
          >
            <h2>Renomear categoria</h2>
            <label className="field">
              <span>Novo nome</span>
              <input
                autoFocus
                value={renaming.to}
                onChange={(e) => setRenaming({ ...renaming, to: e.target.value })}
              />
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setRenaming(null)}>
                Cancelar
              </button>
              <button type="submit" className="primary" disabled={!renaming.to.trim()}>
                Renomear
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="sidebar-resizer" onMouseDown={startResize} />
    </aside>
  );
}
