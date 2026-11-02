import { activeTab, useStore } from '../store';
import { restartTab, profileName } from '../tabs';
import { reloadEnvironment } from '../actions';

export function StatusBar(): JSX.Element {
  const tab = useStore(activeTab);
  const envGeneration = useStore((s) => s.envGeneration);
  const status = useStore((s) => (tab?.sessionId ? s.statuses[tab.sessionId] : undefined));
  const projects = useStore((s) => s.config?.projects.projects);
  const project = tab?.projectId ? projects?.find((p) => p.id === tab.projectId) : undefined;
  const environment = useStore((s) => (tab?.envProfileId ? s.config?.settings.environments.find((e) => e.id === tab.envProfileId) : undefined));
  const outdated = tab && tab.status === 'running' && tab.envGeneration < envGeneration;

  return (
    <div className="statusbar" data-testid="statusbar">
      {tab && <span className="status-item">{profileName(tab)}</span>}
      {tab?.elevated && (
        <span className="status-item admin" data-testid="status-admin">
          🛡 Administrador
        </span>
      )}
      {environment && (
        <span className="status-item" data-testid="status-env" style={{ color: environment.color }}>
          ● {environment.name}
        </span>
      )}
      {project && (
        <span className="status-item" data-testid="status-project">
          ◆ {project.name}
        </span>
      )}
      {tab?.cwd && (
        <span className="status-item status-cwd" title={tab.cwd} data-testid="status-cwd">
          {tab.cwd}
        </span>
      )}
      {status?.git && (
        <span className="status-item" data-testid="status-git">
          ⎇ {status.git.branch ?? status.git.detachedSha}
          {status.git.dirty && <span className="dirty-dot" title="Alterações locais" />}
        </span>
      )}
      <span className="spacer" />
      {status?.node && (
        <button className="status-item link" data-testid="status-node" onClick={() => status.node?.version === null && void reloadEnvironment()}>
          {status.node.version ? `Node ${status.node.version}` : 'Node não encontrado'}
        </button>
      )}
      {status?.dotnet && (
        <button className="status-item link" data-testid="status-dotnet" onClick={() => status.dotnet?.version === null && void reloadEnvironment()}>
          {status.dotnet.version ? `.NET ${status.dotnet.version}` : '.NET não encontrado'}
        </button>
      )}
      {outdated && (
        <button className="status-item warning" data-testid="env-outdated" onClick={() => void restartTab(tab.key)} title="Reiniciar aba com o ambiente atual">
          ambiente desatualizado · Reiniciar aba
        </button>
      )}
    </div>
  );
}
