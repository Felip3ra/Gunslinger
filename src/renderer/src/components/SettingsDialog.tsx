import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
import { About } from './settings/About';
import { Appearance } from './settings/Appearance';
import { Environments } from './settings/Environments';
import { History } from './settings/History';
import { Plugins } from './settings/Plugins';
import { Profiles } from './settings/Profiles';
import { Shortcuts } from './settings/Shortcuts';
import { SshSettings } from './settings/SshSettings';
import { TerminalSettings } from './settings/TerminalSettings';

export type SettingsSection =
  | 'aparencia'
  | 'terminal'
  | 'atalhos'
  | 'perfis'
  | 'ambientes'
  | 'ssh'
  | 'plugins'
  | 'historico'
  | 'sobre';

export function SettingsDialog(): JSX.Element | null {
  const open = useStore((s) => s.overlay === 'settings');
  const [section, setSection] = useState<SettingsSection>('aparencia');
  const requested = useStore((s) => s.settingsSection);
  useEffect(() => {
    if (!open || !requested) return;
    setSection(requested);
    useStore.setState({ settingsSection: null });
  }, [open, requested]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !useStore.getState().dialog) useStore.setState({ overlay: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open) return null;
  const tabs: [SettingsSection, string][] = [
    ['aparencia', 'Aparência'],
    ['terminal', 'Terminal e editor'],
    ['atalhos', 'Atalhos'],
    ['perfis', 'Perfis de shell'],
    ['ambientes', 'Ambientes'],
    ['ssh', 'SSH e hosts conhecidos'],
    ['plugins', 'Plugins'],
    ['historico', 'Histórico'],
    ['sobre', 'Sobre e atualizações'],
  ];
  return (
    <div className="modal-backdrop">
      <div
        className="modal settings"
        role="dialog"
        aria-modal="true"
        aria-label="Configurações"
        data-testid="settings"
      >
        <header className="settings-header">
          <h2>Configurações</h2>
          <div className="row-actions">
            <button onClick={() => void api.invoke('settings:openFile')}>Abrir settings.json</button>
            <button aria-label="Fechar configurações" onClick={() => useStore.setState({ overlay: null })}>
              ×
            </button>
          </div>
        </header>
        <nav className="settings-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={section === id}
              className={section === id ? 'on' : ''}
              onClick={() => setSection(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        {section === 'aparencia' && <Appearance />}
        {section === 'terminal' && <TerminalSettings />}
        {section === 'atalhos' && <Shortcuts />}
        {section === 'perfis' && <Profiles />}
        {section === 'ambientes' && <Environments />}
        {section === 'ssh' && <SshSettings />}
        {section === 'plugins' && <Plugins />}
        {section === 'historico' && <History />}
        {section === 'sobre' && <About />}
      </div>
    </div>
  );
}
