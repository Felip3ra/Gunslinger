import { useCallback, useEffect, useState } from 'react';
import type { DockerListResult } from '@shared/docker';
import type { ListeningPort } from '@shared/ports';
import { api } from '../api';
import { containerLogs, containerShell, dockerAction, killPort } from '../docker-ports';
import { groupOf, useStore } from '../store';

const REFRESH_MS = 5000;

/** Nome da aba dona do processo ("Aba 2"), pela sessão do shell. */
function useOwnerLabel(): (sessionId: string | null) => { label: string; key: string } | null {
  const tabs = useStore((s) => s.tabs);
  const groups = useStore((s) => s.groups);
  return (sessionId) => {
    const tab = sessionId ? tabs.find((t) => t.sessionId === sessionId) : undefined;
    if (!tab) return null;
    const group = groupOf(groups, tab.key);
    return { label: `Aba ${group ? groups.indexOf(group) + 1 : '?'}`, key: tab.key };
  };
}

export function DockerPortsPanel(): JSX.Element | null {
  const open = useStore((s) => s.overlay === 'dockerPorts');
  const [ports, setPorts] = useState<ListeningPort[] | null>(null);
  const [docker, setDocker] = useState<DockerListResult | null>(null);
  const [filter, setFilter] = useState('');
  const ownerOf = useOwnerLabel();

  const refresh = useCallback(async () => {
    const [p, d] = await Promise.all([api.invoke('ports:list'), api.invoke('docker:list')]);
    setPorts(p);
    setDocker(d);
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = setInterval(() => {
      // Sem atualizar com um diálogo de confirmação aberto (a lista mudaria por baixo dele).
      if (!useStore.getState().dialog) void refresh();
    }, REFRESH_MS);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !useStore.getState().dialog) useStore.setState({ overlay: null });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, refresh]);

  if (!open) return null;
  const close = (): void => useStore.setState({ overlay: null });
  const term = filter.trim().toLowerCase();
  const visible = (ports ?? []).filter(
    (p) => !term || String(p.port).includes(term) || (p.processName ?? '').toLowerCase().includes(term),
  );

  return (
    <div className="modal-backdrop">
      <div
        className="modal settings"
        role="dialog"
        aria-modal="true"
        aria-label="Docker e portas"
        data-testid="docker-ports-panel"
      >
        <header className="settings-header">
          <h2>Docker e portas</h2>
          <button aria-label="Fechar Docker e portas" onClick={close}>
            ×
          </button>
        </header>

        <section>
          <h3>Portas em escuta</h3>
          <input
            className="ports-filter"
            aria-label="Filtrar portas"
            placeholder="Filtrar por porta ou processo"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {ports === null ? (
            <p className="empty">Carregando…</p>
          ) : visible.length === 0 ? (
            <p className="empty">Nenhuma porta em escuta{term ? ' com esse filtro' : ''}.</p>
          ) : (
            <table className="ports-table">
              <thead>
                <tr>
                  <th>Porta</th>
                  <th>Endereço</th>
                  <th>Processo</th>
                  <th>Aba</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const owner = ownerOf(p.sessionId);
                  return (
                    <tr key={`${p.address}|${p.port}|${p.pid}`} data-testid="port-row">
                      <td>{p.port}</td>
                      <td>{p.address}</td>
                      <td>
                        {p.processName ?? '?'} <small>({p.pid})</small>
                      </td>
                      <td>
                        {owner && (
                          <button
                            className="link small"
                            onClick={() => {
                              useStore.getState().activate(owner.key);
                              close();
                            }}
                          >
                            {owner.label}
                          </button>
                        )}
                      </td>
                      <td>
                        <button
                          className="small"
                          onClick={() =>
                            void killPort(p).then((ok) => {
                              if (ok) void refresh();
                            })
                          }
                        >
                          Encerrar processo
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h3>Containers</h3>
          {docker === null ? (
            <p className="empty">Carregando…</p>
          ) : !docker.available ? (
            <p className="empty" data-testid="docker-unavailable">
              {docker.reason}
            </p>
          ) : docker.containers.length === 0 ? (
            <p className="empty">Nenhum container.</p>
          ) : (
            <ul className="container-list">
              {docker.containers.map((c) => {
                const running = c.state === 'running';
                const act = (action: Parameters<typeof dockerAction>[1]): void =>
                  void dockerAction(c, action).then((ok) => {
                    if (ok) void refresh();
                  });
                return (
                  <li key={c.id} className="container-row" data-testid="container-row">
                    <span className={`container-state ${running ? 'running' : 'stopped'}`} title={c.state} />
                    <span className="container-name">
                      {c.name} <small>{c.image}</small>
                    </span>
                    <small className="container-status">
                      {c.status}
                      {c.ports ? ` · ${c.ports}` : ''}
                    </small>
                    {running ? (
                      <>
                        <button className="small" onClick={() => act('stop')}>
                          Parar
                        </button>
                        <button className="small" onClick={() => act('restart')}>
                          Reiniciar
                        </button>
                        <button className="small" onClick={() => void containerLogs(c)}>
                          Logs
                        </button>
                        <button className="small" onClick={() => void containerShell(c)}>
                          Shell
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="small" onClick={() => act('start')}>
                          Iniciar
                        </button>
                        <button className="small" onClick={() => act('rm')}>
                          Remover
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
