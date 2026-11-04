import { formatTarget, resolveHost } from '@shared/ssh-hosts';
import { activeTab, hostOf, useStore, type Tab } from '../store';
import { restartTab, profileName } from '../tabs';
import { reloadEnvironment } from '../actions';
import { api } from '../api';

/** Aba SSH: `usuário@endereço` no lugar de projeto, pasta, Git e versões locais. */
function SshStatusBar({ tab }: { tab: Tab }): JSX.Element {
  const host = useStore((s) => hostOf(s, tab));
  const groups = useStore((s) => s.config?.hosts.groups);
  const identities = useStore((s) => s.keychain?.identities);
  const keepalive = useStore((s) => s.config?.settings.ssh.keepaliveSec ?? 30);
  let target = tab.sshLabel ?? 'SSH';
  if (host && groups) {
    const r = resolveHost(host, groups, { keepaliveSec: keepalive });
    const username = r.username ?? identities?.find((i) => i.id === r.identityId)?.username ?? null;
    target = formatTarget(username, r.address, r.port);
  } else if (tab.sshTarget?.kind === 'quick') {
    target = formatTarget(tab.sshTarget.username, tab.sshTarget.address, tab.sshTarget.port);
  }
  const connected = tab.status === 'running' && !!tab.sessionId;
  return (
    <div className="statusbar" data-testid="statusbar">
      <span className="status-item" data-testid="status-ssh" title={host?.name}>
        <span className="host-dot" style={{ background: host?.color ?? 'var(--text-muted)' }} aria-hidden /> {target}
      </span>
      <span className="status-item">{connected ? 'SSH conectado' : tab.status === 'starting' ? 'Conectando…' : 'Desconectado'}</span>
      <span className="spacer" />
    </div>
  );
}

export function StatusBar(): JSX.Element {
  const tab = useStore(activeTab);
  const envGeneration = useStore((s) => s.envGeneration);
  const status = useStore((s) => (tab?.sessionId ? s.statuses[tab.sessionId] : undefined));
  const projects = useStore((s) => s.config?.projects.projects);
  const project = tab?.projectId ? projects?.find((p) => p.id === tab.projectId) : undefined;
  const environment = useStore((s) => (tab?.envProfileId ? s.config?.settings.environments.find((e) => e.id === tab.envProfileId) : undefined));
  const outdated = tab && tab.status === 'running' && tab.envGeneration < envGeneration;
  const update = useStore((s) => s.update);
  // fnm por sessão: a versão informada pelo shell vale mais que a do ambiente do app.
  const nodeVersion = tab?.nodeVersion ?? status?.node?.version ?? null;

  if (tab?.kind === 'ssh') return <SshStatusBar tab={tab} />;

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
      {(status?.node || tab?.nodeVersion) && (
        <button
          className="status-item link"
          data-testid="status-node"
          title={tab?.nodeVersion ? 'Versão do Node desta aba (fnm)' : undefined}
          onClick={() => nodeVersion === null && void reloadEnvironment()}
        >
          {nodeVersion ? `Node ${nodeVersion}` : 'Node não encontrado'}
        </button>
      )}
      {status?.dotnet && (
        <button className="status-item link" data-testid="status-dotnet" onClick={() => status.dotnet?.version === null && void reloadEnvironment()}>
          {status.dotnet.version ? `.NET ${status.dotnet.version}` : '.NET não encontrado'}
        </button>
      )}
      {update?.state === 'ready' && (
        <button className="status-item update" data-testid="status-update" title="Fecha o app, instala e abre de novo" onClick={() => void api.invoke('update:install')}>
          ⬆ Versão {update.version} pronta · Reiniciar
        </button>
      )}
      {update?.state === 'downloading' && (
        <span className="status-item" data-testid="status-update-progress">
          ⬇ Baixando {update.version}… {update.percent}%
        </span>
      )}
      {outdated && (
        <button className="status-item warning" data-testid="env-outdated" onClick={() => void restartTab(tab.key)} title="Reiniciar aba com o ambiente atual">
          ambiente desatualizado · Reiniciar aba
        </button>
      )}
    </div>
  );
}
