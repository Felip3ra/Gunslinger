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
            <ProfileIcon icon={p.icon} color={p.color} />
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
  const activate = useStore((s) => s.activate);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="tabbar" role="tablist">
      {groups.map((group) => {
        const panes = panesOf(group.root);
        const tab = tabs.find((t) => t.key === displayPane(group));
        if (!tab) return null;
        const selected = !!activeKey && panes.includes(activeKey);
        const profile = profiles.find((p) => p.id === tab.profileId);
        const env = tab.envProfileId ? environments.find((e) => e.id === tab.envProfileId) : undefined;
        const dirty = tab.sessionId ? statuses[tab.sessionId]?.git?.dirty : false;
        return (
          <div
            key={group.id}
            role="tab"
            aria-selected={selected}
            className={`tab ${selected ? 'active' : ''}`}
            style={{ ['--tab-accent' as string]: profile?.color ?? 'var(--accent)' }}
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
            {profile && <ProfileIcon icon={profile.icon} color={profile.color} />}
            {tab.elevated && (
              <span className="tab-shield" title="Administrador" data-testid="tab-shield">
                🛡
              </span>
            )}
            {env && <span className="env-dot" style={{ background: env.color }} title={`Ambiente: ${env.name}`} data-testid="tab-env" />}
            <span className="tab-title">{tab.shellTitle ?? profileName(tab)}</span>
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
    </div>
  );
}
