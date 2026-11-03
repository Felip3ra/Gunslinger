import type { UpdateStatus } from '@shared/update';
import { checkForUpdates } from '../../actions';
import { api } from '../../api';
import { useStore } from '../../store';
import { update } from './update';

const RELEASES_URL = 'https://github.com/Felip3ra/Gunslinger/releases';

function describeStatus(status: UpdateStatus): string {
  switch (status.state) {
    case 'unsupported':
      return 'A atualização automática funciona só no app instalado pelo instalador.';
    case 'idle':
      return status.checkedAt
        ? `Você está na versão mais recente (verificado às ${new Date(status.checkedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}).`
        : 'Ainda não verificado.';
    case 'checking':
      return 'Procurando atualizações…';
    case 'downloading':
      return `Baixando a versão ${status.version}… ${status.percent}%`;
    case 'ready':
      return `A versão ${status.version} está pronta. Ela é instalada ao reiniciar (ou na próxima vez que você fechar o app).`;
    case 'error':
      return `Não foi possível verificar: ${status.message}`;
  }
}

/** Versão do app e atualização automática. */
export function About(): JSX.Element {
  const status = useStore((s) => s.update);
  const auto = useStore((s) => s.config!.settings.updates.auto);
  const busy = status?.state === 'checking' || status?.state === 'downloading';
  return (
    <>
      <p className="about-version">
        <strong>Gunslinger</strong> {status ? `versão ${status.currentVersion}` : ''}
      </p>
      <p data-testid="update-status">{status ? describeStatus(status) : ''}</p>
      <div className="row-actions">
        {status?.state === 'ready' ? (
          <button className="primary" data-testid="update-install" onClick={() => void api.invoke('update:install')}>
            Reiniciar e atualizar
          </button>
        ) : (
          <button data-testid="update-check" disabled={busy || status?.state === 'unsupported'} onClick={() => void checkForUpdates()}>
            Procurar atualizações
          </button>
        )}
        <button onClick={() => void api.invoke('shell:openExternal', { url: RELEASES_URL })}>Ver todas as versões</button>
      </div>
      <label className="checkline">
        <input type="checkbox" checked={auto} onChange={(e) => void update(['updates', 'auto'], e.target.checked)} />
        Procurar e baixar atualizações automaticamente (a instalação acontece ao reiniciar)
      </label>
    </>
  );
}
