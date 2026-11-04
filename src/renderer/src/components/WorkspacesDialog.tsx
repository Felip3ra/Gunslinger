import { useEffect, useMemo, useState } from 'react';
import type { Workspace, WorkspaceLayout, WorkspacePane } from '@shared/model';
import { isPluginItem } from '@shared/plugins';
import { panesOfLayout } from '@shared/workspaces';
import { api } from '../api';
import { confirmDialog, EMPTY, useStore } from '../store';
import { captureOpenTabs, openWorkspace, saveWorkspace } from '../workspaces';

const close = (): void => useStore.setState({ workspacesDialog: null });

/** Atualiza o n-ésimo painel (ordem de leitura) de um layout. */
function updatePane(layout: WorkspaceLayout, index: number, patch: Partial<WorkspacePane>): WorkspaceLayout {
  let i = 0;
  const walk = (node: WorkspaceLayout): WorkspaceLayout => {
    if (node.type === 'pane') return i++ === index ? { ...node, pane: { ...node.pane, ...patch } } : node;
    return { ...node, children: node.children.map(walk) };
  };
  return walk(layout);
}

function SaveForm(): JSX.Element {
  const [name, setName] = useState('');
  const tabs = useStore((s) => s.groups.length);
  return (
    <form
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-label="Salvar workspace"
      data-testid="workspace-save"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        if (await saveWorkspace({ id: crypto.randomUUID(), name: name.trim(), tabs: captureOpenTabs() })) {
          useStore.getState().pushNotice('info', `Workspace "${name.trim()}" salvo com ${tabs} aba(s).`);
          close();
        }
      }}
    >
      <h2>Salvar abas como workspace</h2>
      <label className="field">
        <span>Nome</span>
        <input
          autoFocus
          aria-label="Nome do workspace"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <p className="hint">
        {tabs} aba(s) com os painéis, pastas e perfis atuais. Comandos iniciais podem ser definidos depois, na
        edição.
      </p>
      <div className="modal-actions">
        <button type="button" onClick={close}>
          Cancelar
        </button>
        <button type="submit" className="primary" disabled={!name.trim()}>
          Salvar
        </button>
      </div>
    </form>
  );
}

function Editor({ initial }: { initial: Workspace }): JSX.Element {
  const [draft, setDraft] = useState(initial);
  const profiles = useStore((s) => s.profiles);
  const hosts = useStore((s) => s.config?.hosts.hosts ?? EMPTY);
  return (
    <form
      className="modal wide"
      role="dialog"
      aria-modal="true"
      aria-label="Editar workspace"
      data-testid="workspace-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await saveWorkspace({ ...draft, name: draft.name.trim() || initial.name }))
          useStore.setState({ workspacesDialog: 'list' });
      }}
    >
      <h2>Editar workspace</h2>
      <label className="field">
        <span>Nome</span>
        <input
          aria-label="Nome do workspace"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
      </label>
      {draft.tabs.map((layout, t) => (
        <fieldset key={t} className="variables">
          <legend>
            Aba {t + 1}
            {draft.tabs.length > 1 && (
              <button
                type="button"
                className="link small"
                onClick={() => setDraft({ ...draft, tabs: draft.tabs.filter((_, i) => i !== t) })}
              >
                remover
              </button>
            )}
          </legend>
          {panesOfLayout(layout).map((pane, p) => {
            const set = (patch: Partial<WorkspacePane>): void =>
              setDraft({ ...draft, tabs: draft.tabs.map((l, i) => (i === t ? updatePane(l, p, patch) : l)) });
            return (
              <div key={p} className="workspace-pane" data-testid="workspace-pane">
                <select
                  aria-label={`Perfil do painel ${t + 1}.${p + 1}`}
                  value={pane.hostId ? `host:${pane.hostId}` : (pane.profileId ?? '')}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Painel SSH: o host define tudo; perfil, pasta e projeto não se aplicam.
                    if (v.startsWith('host:')) set({ hostId: v.slice(5), profileId: null, cwd: null, projectId: null });
                    else set({ profileId: v || null, hostId: null });
                  }}
                >
                  <option value="">Perfil padrão</option>
                  {profiles.map((pr) => (
                    <option key={pr.id} value={pr.id}>
                      {pr.name}
                    </option>
                  ))}
                  {hosts.length > 0 && (
                    <optgroup label="Hosts SSH">
                      {hosts.map((h) => (
                        <option key={h.id} value={`host:${h.id}`}>
                          SSH: {h.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {pane.hostId && !hosts.some((h) => h.id === pane.hostId) && <option value={`host:${pane.hostId}`}>SSH: host não encontrado</option>}
                </select>
                <input
                  aria-label={`Pasta do painel ${t + 1}.${p + 1}`}
                  placeholder={pane.hostId ? 'Pasta (não se aplica a SSH)' : 'Pasta'}
                  disabled={!!pane.hostId}
                  value={pane.cwd ?? ''}
                  onChange={(e) => set({ cwd: e.target.value || null })}
                />
                <input
                  aria-label={`Comando do painel ${t + 1}.${p + 1}`}
                  placeholder="Comando inicial (opcional)"
                  value={pane.command ?? ''}
                  onChange={(e) => set({ command: e.target.value || null })}
                />
              </div>
            );
          })}
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() =>
          setDraft({
            ...draft,
            tabs: [
              ...draft.tabs,
              { type: 'pane', pane: { profileId: null, cwd: null, projectId: null, command: null, hostId: null } },
            ],
          })
        }
      >
        + Aba
      </button>
      <div className="modal-actions">
        <button type="button" onClick={() => useStore.setState({ workspacesDialog: 'list' })}>
          Cancelar
        </button>
        <button type="submit" className="primary">
          Salvar
        </button>
      </div>
    </form>
  );
}

function List(): JSX.Element {
  const own = useStore((s) => s.config?.workspaces.workspaces ?? EMPTY);
  const fromPlugins = useStore((s) => s.plugins?.contributions.workspaces ?? EMPTY);
  const workspaces = useMemo(() => [...own, ...fromPlugins], [own, fromPlugins]);
  return (
    <div
      className="modal wide"
      role="dialog"
      aria-modal="true"
      aria-label="Workspaces"
      data-testid="workspaces-list"
    >
      <h2>Workspaces</h2>
      {workspaces.length === 0 && (
        <p className="empty">Nenhum workspace salvo. Monte as abas e use "Salvar abas atuais".</p>
      )}
      <ul className="project-list">
        {workspaces.map((w) => (
          <li key={w.id} data-testid="workspace-item">
            <div>
              <strong>{w.name}</strong>
              <small>
                {w.tabs.length} aba(s), {w.tabs.flatMap(panesOfLayout).length} painel(is)
              </small>
            </div>
            <div className="row-actions">
              <button
                className="primary"
                onClick={() => {
                  close();
                  void openWorkspace(w);
                }}
              >
                Abrir
              </button>
              {!isPluginItem(w.id) && (
                <>
                  <button onClick={() => useStore.setState({ workspacesDialog: w })}>Editar</button>
                  <button
                    onClick={async () => {
                      if (!(await confirmDialog('Excluir workspace', `Excluir "${w.name}"?`, 'Excluir')))
                        return;
                      const r = await api.invoke('workspaces:delete', { id: w.id });
                      if (!r.ok) useStore.getState().pushNotice('error', r.error);
                    }}
                  >
                    Excluir
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <div className="modal-actions">
        <button onClick={close}>Fechar</button>
        <button className="primary" onClick={() => useStore.setState({ workspacesDialog: 'save' })}>
          Salvar abas atuais
        </button>
      </div>
    </div>
  );
}

export function WorkspacesDialog(): JSX.Element | null {
  const dialog = useStore((s) => s.workspacesDialog);
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !useStore.getState().dialog) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);
  if (!dialog) return null;
  return (
    <div className="modal-backdrop">
      {dialog === 'list' ? (
        <List />
      ) : dialog === 'save' ? (
        <SaveForm />
      ) : (
        <Editor key={dialog.id} initial={dialog} />
      )}
    </div>
  );
}
