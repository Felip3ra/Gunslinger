import { useEffect } from 'react';
import { useStore, EMPTY } from '../store';

const FILE_NAMES = {
  settings: 'settings.json',
  commands: 'commands.json',
  projects: 'projects.json',
  workspaces: 'workspaces.json',
  hosts: 'hosts.json',
  keychain: 'keychain.json',
  knownHosts: 'known_hosts.json',
} as const;

/** Banner não bloqueante com os erros de configuração; some quando o arquivo é corrigido. */
export function ConfigBanner(): JSX.Element | null {
  const issues = useStore((s) => s.config?.issues ?? EMPTY);
  if (issues.length === 0) return null;
  const hasError = issues.some((i) => i.severity === 'error');
  return (
    <div className={`banner ${hasError ? 'error' : 'warning'}`} role="alert" data-testid="config-banner">
      <strong>{hasError ? 'Configuração inválida: usando valores padrão onde há erro.' : 'Avisos de configuração:'}</strong>
      <ul>
        {issues.map((i, n) => (
          <li key={n}>
            {FILE_NAMES[i.file]}
            {i.line ? ` (linha ${i.line})` : ''}
            {i.path.length ? ` [${i.path.join('.')}]` : ''}: {i.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Notices(): JSX.Element {
  const notices = useStore((s) => s.notices);
  const dismiss = useStore((s) => s.dismissNotice);
  useEffect(() => {
    const timers = notices.filter((n) => n.kind === 'info').map((n) => setTimeout(() => dismiss(n.id), 5000));
    return () => timers.forEach(clearTimeout);
  }, [notices, dismiss]);
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice ${n.kind}`} data-testid="notice">
          <span>{n.message}</span>
          <button aria-label="Dispensar" onClick={() => dismiss(n.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
