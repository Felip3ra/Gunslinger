import { useEffect, useState } from 'react';
import { packageManagers, type PackageManager, type Project, type ProjectAnalysis } from '@shared/model';
import { packageLabel } from '@shared/project-runnables';
import { api } from '../api';
import { deleteProject, emptyProject, openProject } from '../projects';
import { useStore, EMPTY } from '../store';

const EF_VARS = ['project', 'startupProject'];

function ProjectList(): JSX.Element {
  const projects = useStore((s) => s.config?.projects.projects ?? EMPTY);
  const close = (): void => useStore.setState({ projectsDialog: null });
  return (
    <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="projects-title" data-testid="projects-list">
      <h2 id="projects-title">Projetos</h2>
      {projects.length === 0 && <p className="empty">Nenhum projeto cadastrado.</p>}
      <ul className="project-list">
        {projects.map((p) => (
          <li key={p.id} data-testid="project-item">
            <div>
              <strong>{p.name}</strong>
              <small>
                {p.rootPath} · {[p.types.dotnet && '.NET', p.types.node && 'Node.js'].filter(Boolean).join(' + ') || 'sem tipo'}
              </small>
            </div>
            <div className="row-actions">
              <button
                className="primary"
                onClick={() => {
                  close();
                  void openProject(p);
                }}
              >
                Abrir
              </button>
              <button onClick={() => useStore.setState({ projectsDialog: p })}>Editar</button>
              <button onClick={() => void deleteProject(p)}>Excluir</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="modal-actions">
        <button onClick={close}>Fechar</button>
        <button className="primary" onClick={() => useStore.setState({ projectsDialog: emptyProject() })}>
          Novo projeto
        </button>
      </div>
    </div>
  );
}

function ProjectForm({ initial }: { initial: Project }): JSX.Element {
  const profiles = useStore((s) => s.profiles);
  const [draft, setDraft] = useState<Project>(initial);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  // Edição: carrega a análise da pasta já cadastrada para listar candidatos e pacotes.
  useEffect(() => {
    if (initial.rootPath) {
      api.invoke('projects:analyze', { root: initial.rootPath }).then(setAnalysis, () => setAnalysis(null));
    }
  }, [initial.rootPath]);

  const chooseRoot = async (): Promise<void> => {
    const folder = await api.invoke('projects:pickFolder');
    if (!folder) return;
    try {
      const result = await api.invoke('projects:analyze', { root: folder });
      setAnalysis(result);
      const name = draft.name || folder.split(/[\\/]/).filter(Boolean).pop() || '';
      const variables = { ...draft.variables };
      if (result.dotnet.suggestedProject && !variables['project']) variables['project'] = result.dotnet.suggestedProject;
      if (result.dotnet.suggestedStartupProject && !variables['startupProject']) variables['startupProject'] = result.dotnet.suggestedStartupProject;
      setDraft({ ...draft, name, rootPath: folder, types: { ...result.suggestedTypes }, variables });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const otherVars = Object.entries(draft.variables).filter(([k]) => !EF_VARS.includes(k));
  const setVar = (key: string, value: string): void => setDraft({ ...draft, variables: { ...draft.variables, [key]: value } });
  const save = async (): Promise<void> => {
    setTouched(true);
    if (!draft.name.trim() || !draft.rootPath.trim()) return;
    const variables = Object.fromEntries(Object.entries(draft.variables).filter(([k, v]) => k.trim() && v.trim()));
    const project: Project = { ...draft, id: draft.id || crypto.randomUUID(), name: draft.name.trim(), variables };
    const result = await api.invoke('projects:save', project);
    if (result.ok) useStore.setState({ projectsDialog: 'list' });
    else setError(result.error);
  };

  return (
    <form
      className="modal wide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-form-title"
      data-testid="project-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <h2 id="project-form-title">{draft.id ? 'Editar projeto' : 'Novo projeto'}</h2>
      <label className="field">
        <span>Pasta raiz *</span>
        <div className="input-with-button">
          <input aria-label="Pasta raiz" aria-invalid={touched && !draft.rootPath} value={draft.rootPath} onChange={(e) => setDraft({ ...draft, rootPath: e.target.value })} />
          <button type="button" onClick={() => void chooseRoot()}>
            Escolher…
          </button>
        </div>
      </label>
      <div className="field-row">
        <label className="field">
          <span>Nome *</span>
          <input aria-label="Nome do projeto" aria-invalid={touched && !draft.name.trim()} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </label>
        <label className="field">
          <span>Shell padrão</span>
          <select value={draft.defaultProfileId ?? ''} onChange={(e) => setDraft({ ...draft, defaultProfileId: e.target.value || null })}>
            <option value="">Perfil padrão do app</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <span>Tipos</span>
        <div className="checks">
          <label>
            <input type="checkbox" checked={draft.types.dotnet} onChange={(e) => setDraft({ ...draft, types: { ...draft.types, dotnet: e.target.checked } })} /> .NET
          </label>
          <label>
            <input type="checkbox" checked={draft.types.node} onChange={(e) => setDraft({ ...draft, types: { ...draft.types, node: e.target.checked } })} /> Node.js
          </label>
        </div>
      </div>
      {draft.types.dotnet && (
        <div className="field-row">
          {EF_VARS.map((key) => {
            const candidates = key === 'project' ? analysis?.dotnet.projectCandidates : analysis?.dotnet.startupCandidates;
            return (
              <label key={key} className="field">
                <span>{key === 'project' ? '--project (migrations)' : '--startup-project'}</span>
                <input list={`cand-${key}`} aria-label={key} value={draft.variables[key] ?? ''} onChange={(e) => setVar(key, e.target.value)} />
                <datalist id={`cand-${key}`}>
                  {(candidates ?? analysis?.dotnet.projects.map((p) => p.path) ?? []).map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </label>
            );
          })}
        </div>
      )}
      {draft.types.node && analysis && analysis.nodePackages.length > 0 && (
        <fieldset className="variables">
          <legend>Gerenciador de pacotes</legend>
          {analysis.nodePackages.map((pkg) => (
            <label key={pkg.dir} className="inline-field">
              <span>{packageLabel(pkg)}</span>
              <select
                aria-label={`Gerenciador de ${packageLabel(pkg)}`}
                value={draft.node.packageManagerOverrides[pkg.dir] ?? ''}
                onChange={(e) => {
                  const overrides = { ...draft.node.packageManagerOverrides };
                  if (e.target.value) overrides[pkg.dir] = e.target.value as PackageManager;
                  else delete overrides[pkg.dir];
                  setDraft({ ...draft, node: { packageManagerOverrides: overrides } });
                }}
              >
                <option value="">Automático ({pkg.packageManager})</option>
                {packageManagers.map((pm) => (
                  <option key={pm} value={pm}>
                    {pm}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}
      <fieldset className="variables">
        <legend>Variáveis do projeto</legend>
        {otherVars.map(([key, value], i) => (
          <div key={i} className="kv-row">
            <input
              aria-label="Nome da variável"
              value={key}
              onChange={(e) => {
                const entries = Object.entries(draft.variables).map(([k, v]) => (k === key ? [e.target.value, v] : [k, v]));
                setDraft({ ...draft, variables: Object.fromEntries(entries) });
              }}
            />
            <input aria-label="Valor da variável" value={value} onChange={(e) => setVar(key, e.target.value)} />
            <button
              type="button"
              aria-label="Remover variável"
              onClick={() => {
                const rest = { ...draft.variables };
                delete rest[key];
                setDraft({ ...draft, variables: rest });
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setVar(`var${otherVars.length + 1}`, '')}>
          + Variável
        </button>
      </fieldset>
      {error && <p className="field-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={() => useStore.setState({ projectsDialog: 'list' })}>
          Cancelar
        </button>
        <button type="submit" className="primary">
          Salvar
        </button>
      </div>
    </form>
  );
}

export function ProjectsDialog(): JSX.Element | null {
  const dialog = useStore((s) => s.projectsDialog);
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !useStore.getState().dialog) {
        e.stopPropagation();
        useStore.setState({ projectsDialog: dialog === 'list' ? null : 'list' });
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog]);
  if (!dialog) return null;
  return <div className="modal-backdrop">{dialog === 'list' ? <ProjectList /> : <ProjectForm key={dialog.id || 'new'} initial={dialog} />}</div>;
}
