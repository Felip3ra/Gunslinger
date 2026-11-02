import { useMemo } from 'react';
import { projectRunnables } from '@shared/project-runnables';
import { reanalyzeProject } from '../projects';
import { activeTab, useStore } from '../store';
import { CommandRow, Group } from './Sidebar';

/** Seção do projeto ativo no painel: grupos por tipo lado a lado e comandos vinculados. */
export function ProjectSection(): JSX.Element | null {
  const tab = useStore(activeTab);
  const project = useStore((s) => (tab?.projectId ? s.config?.projects.projects.find((p) => p.id === tab.projectId) : undefined));
  const analysis = useStore((s) => (project ? s.projectAnalyses[project.id] : undefined));
  const saved = useStore((s) => s.config?.commands.commands);
  const runnables = useMemo(() => (project ? projectRunnables(project, analysis, saved ?? []) : null), [project, analysis, saved]);
  if (!project || !runnables) return null;

  return (
    <div className="project-section" data-testid="project-section">
      <header className="project-header">
        <strong>◆ {project.name}</strong>
        <span>
          <button className="link small" title="Reanalisar projeto" aria-label="Reanalisar projeto" onClick={() => void reanalyzeProject(project)}>
            ⟳
          </button>
          <button className="link small" title="Editar projeto" aria-label="Editar projeto" onClick={() => useStore.setState({ projectsDialog: project })}>
            ✎
          </button>
        </span>
      </header>
      {runnables.ef.length > 0 && (
        <Group label="EF Core" testId="group-ef">
          {runnables.ef.map((c) => (
            <CommandRow key={c.id} command={c} />
          ))}
        </Group>
      )}
      {runnables.launch.length > 0 && (
        <Group label="Perfis de execução" testId="group-launch">
          {runnables.launch.map((c) => (
            <CommandRow key={c.id} command={c} />
          ))}
        </Group>
      )}
      {runnables.node.map((g) => (
        <Group key={g.pkg.dir} label={`Node: ${g.label} · ${g.pkg.packageManager}`} testId="group-node">
          {g.pkg.error && <p className="group-alert error">{g.pkg.error}{g.pkg.stale ? ' (lista desatualizada)' : ''}</p>}
          {g.pkg.warnings.map((w) => (
            <p key={w} className="group-alert warning">
              {w}
            </p>
          ))}
          {g.scripts.length === 0 && !g.pkg.error && <p className="empty">Nenhum script</p>}
          {g.scripts.map((c) => (
            <CommandRow key={c.id} command={c} />
          ))}
          {g.commands.map((c) => (
            <CommandRow key={c.id} command={c} />
          ))}
        </Group>
      ))}
      {runnables.linked.length > 0 && (
        <Group label="Comandos do projeto" testId="group-linked">
          {runnables.linked.map((c) => (
            <CommandRow key={c.id} command={c} saved={saved?.find((s) => s.id === c.id)} />
          ))}
        </Group>
      )}
    </div>
  );
}
