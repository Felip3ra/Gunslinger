import type { PluginInfo } from '@shared/plugins';
import { api } from '../../api';
import { useStore } from '../../store';

const COUNT_LABELS: [keyof PluginInfo['counts'], string][] = [
  ['commands', 'comando(s)'],
  ['workspaces', 'workspace(s)'],
  ['profiles', 'perfil(s)'],
  ['themes', 'tema(s)'],
  ['logHighlight', 'regra(s) de log'],
];

function summary(p: PluginInfo): string {
  const parts = COUNT_LABELS.filter(([k]) => p.counts[k] > 0).map(([k, label]) => `${p.counts[k]} ${label}`);
  return parts.length > 0 ? parts.join(', ') : 'sem contribuições';
}

/** Plugins declarativos (só dados): lista, erros e ativação. */
export function Plugins(): JSX.Element {
  const snapshot = useStore((s) => s.plugins);
  const pushNotice = useStore((s) => s.pushNotice);
  const report = (result: { ok: true } | { ok: false; error: string }): void => {
    if (!result.ok) pushNotice('error', result.error);
  };
  const plugins = snapshot?.plugins ?? [];

  return (
    <>
      <p className="hint">
        Cada plugin é uma pasta com um <code>plugin.json</code> em <code>{snapshot?.dir ?? 'plugins'}</code>.
        Plugins só trazem dados (comandos, workspaces, perfis de shell, temas e regras de destaque de log);
        nenhum código é executado. Mudanças na pasta são aplicadas sem reiniciar.
      </p>
      <div className="row-actions">
        <button onClick={async () => report(await api.invoke('plugins:openFolder'))}>
          Abrir pasta de plugins
        </button>
        <button onClick={async () => useStore.setState({ plugins: await api.invoke('plugins:reload') })}>
          Recarregar
        </button>
      </div>
      {plugins.length === 0 ? (
        <p className="empty">Nenhum plugin instalado.</p>
      ) : (
        <ul className="project-list" data-testid="plugin-list">
          {plugins.map((p) => (
            <li key={p.folder} data-testid="plugin-item">
              <div>
                <strong>{p.name}</strong> {p.version && <small>v{p.version}</small>}
                <small>
                  {p.error ? (
                    <span className="field-error">{p.error}</span>
                  ) : (
                    `${p.description ? `${p.description} · ` : ''}${summary(p)}`
                  )}
                </small>
              </div>
              {p.id && !p.error && (
                <div className="row-actions">
                  <label className="checkline">
                    <input
                      type="checkbox"
                      aria-label={`Ativar ${p.name}`}
                      checked={p.enabled}
                      onChange={async (e) =>
                        report(
                          await api.invoke('plugins:setEnabled', { id: p.id!, enabled: e.target.checked }),
                        )
                      }
                    />{' '}
                    Ativo
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
