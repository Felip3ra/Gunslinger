import { useEffect, useMemo, useRef, useState } from 'react';
import { EMPTY, useStore } from '../store';
import { panesOf } from '../layout/layout';
import { closeGroup, displayPane, openTab, profileName } from '../tabs';
import { canElevate, openElevated } from '../elevation';
import { ProfileIcon } from './ProfileIcon';

function NewTabMenu({ onClose }: { onClose: () => void }): JSX.Element {
  const allProfiles = useStore((s) => s.profiles);
  const profiles = useMemo(() => allProfiles.filter((p) => !p.hidden), [allProfiles]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="menu" ref={ref} role="menu" data-testid="new-tab-menu">
      {profiles.map((p) => (
        <div key={p.id} className="menu-row">
          <button
            role="menuitem"
            className="menu-item"
            disabled={!p.available}
            title={p.available ? p.executable : 'Executável não encontrado'}
            onClick={() => {
              onClose();
              void openTab({ profileId: p.id });
            }}
          >
            <ProfileIcon icon={p.icon} color={p.color} data={p.iconData} />
            <span>{p.name}</span>
          </button>
          {canElevate(p) && (
            <button
              role="menuitem"
              className="menu-admin"
              aria-label={`${p.name} como administrador`}
              title="Abrir como administrador"
              onClick={() => {
                onClose();
                void openElevated(p.id);
              }}
            >
              🛡 Admin
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function TabBar(): JSX.Element {
  const tabs = useStore((s) => s.tabs);
  const groups = useStore((s) => s.groups);
  const activeKey = useStore((s) => s.activeKey);
  const profiles = useStore((s) => s.profiles);
  const statuses = useStore((s) => s.statuses);
  const environments = useStore((s) => s.config?.settings.environments ?? EMPTY);
  const hostList = useStore((s) => s.config?.hosts.hosts ?? EMPTY);
  const hostsById = useMemo(() => new Map(hostList.map((h) => [h.id, h])), [hostList]);
  const activate = useStore((s) => s.activate);
  const [menuOpen, setMenuOpen] = useState(false);
  const settingsShortcut = useStore((s) => s.config?.settings.keybindings['settings.open'] ?? null);

  return (
    <div className="tabbar" role="tablist">
      {groups.map((group) => {
        const panes = panesOf(group.root);
        const tab = tabs.find((t) => t.key === displayPane(group));
        if (!tab) return null;
        const selected = !!activeKey && panes.includes(activeKey);
        const profile = tab.kind === 'ssh' ? undefined : profiles.find((p) => p.id === tab.profileId);
        const host = tab.sshTarget?.kind === 'host' ? hostsById.get(tab.sshTarget.hostId) : undefined;
        const accent = tab.kind === 'ssh' ? (host?.color ?? 'var(--accent)') : (profile?.color ?? 'var(--accent)');
        const env = tab.envProfileId ? environments.find((e) => e.id === tab.envProfileId) : undefined;
        const dirty = tab.sessionId ? statuses[tab.sessionId]?.git?.dirty : false;
        return (
          <div
            key={group.id}
            role="tab"
            aria-selected={selected}
            className={`tab ${selected ? 'active' : ''}`}
            style={{ ['--tab-accent' as string]: accent }}
            data-testid="tab"
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                void closeGroup(group.id);
              }
            }}
            onClick={() => activate(tab.key)}
            title={tab.cwd ?? undefined}
          >
            {profile && <ProfileIcon icon={profile.icon} color={profile.color} data={profile.iconData} />}
            {tab.kind === 'ssh' && <span className="host-dot" style={{ background: accent }} title="SSH" data-testid="tab-ssh" />}
            {tab.elevated && (
              <span className="tab-shield" title="Administrador" data-testid="tab-shield">
                🛡
              </span>
            )}
            {env && <span className="env-dot" style={{ background: env.color }} title={`Ambiente: ${env.name}`} data-testid="tab-env" />}
            {/* SSH: o nome do host (o shell remoto costuma trocar o título por usuário@máquina). */}
            <span className="tab-title">{tab.kind === 'ssh' ? profileName(tab) : (tab.shellTitle ?? profileName(tab))}</span>
            {panes.length > 1 && (
              <span className="tab-panes" title={`${panes.length} painéis`} data-testid="tab-panes">
                ▦{panes.length}
              </span>
            )}
            {dirty && <span className="tab-dirty" title="Alterações não commitadas" />}
            <button
              className="tab-close"
              aria-label="Fechar aba"
              onClick={(e) => {
                e.stopPropagation();
                void closeGroup(group.id);
              }}
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="newtab">
        <button className="newtab-button" aria-label="Nova aba" title="Nova aba" onClick={() => void openTab()}>
          +
        </button>
        <button className="newtab-button" aria-label="Escolher perfil" title="Escolher perfil" data-testid="new-tab-menu-button" onClick={() => setMenuOpen((v) => !v)}>
          ▾
        </button>
        {menuOpen && <NewTabMenu onClose={() => setMenuOpen(false)} />}
      </div>
      <button
        className="tabbar-settings"
        aria-label="Configurações"
        title={`Configurações${settingsShortcut ? ` (${settingsShortcut})` : ''}`}
        data-testid="open-settings"
        onClick={() => useStore.setState({ overlay: 'settings' })}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  );
}
