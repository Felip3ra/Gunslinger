import { useEffect, useRef } from 'react';
import { containsPane, resizeSplit, type LayoutNode } from '../layout/layout';
import { useStore, type Tab, type TabGroup } from '../store';
import { closeTab, restartTab } from '../tabs';
import { terminals } from '../terminal/terminal-registry';

function TabOverlay({ tab }: { tab: Tab }): JSX.Element | null {
  if (tab.status === 'exited') {
    return (
      <div className="tab-overlay" data-testid="tab-exited">
        <p>Processo encerrado com código {tab.exitCode}</p>
        <div className="overlay-actions">
          <button className="primary" onClick={() => void restartTab(tab.key)}>
            Reiniciar
          </button>
          <button onClick={() => void closeTab(tab.key)}>Fechar</button>
        </div>
      </div>
    );
  }
  if (tab.status === 'error') {
    return (
      <div className="tab-overlay error" data-testid="tab-error">
        <p>{tab.error}</p>
        <div className="overlay-actions">
          <button className="primary" onClick={() => void restartTab(tab.key)}>
            Tentar de novo
          </button>
          <button onClick={() => void closeTab(tab.key)}>Fechar</button>
        </div>
      </div>
    );
  }
  return null;
}

/** Um painel: terminal montado uma vez, ajustado ao tamanho do próprio contêiner. */
function TerminalPane({ tab, active, highlight }: { tab: Tab; active: boolean; highlight: boolean }): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    terminals.mount(tab.key, host);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => terminals.fit(tab.key), 50);
    });
    observer.observe(host);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [tab.key]);
  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      terminals.fit(tab.key);
      terminals.focus(tab.key);
    });
  }, [active, tab.key]);
  return (
    <div
      className={`terminal-pane ${highlight ? 'focused' : ''}`}
      data-testid={active ? 'active-terminal' : 'terminal-pane'}
      onMouseDown={() => !active && useStore.getState().activate(tab.key)}
    >
      <div className="terminal-host" ref={hostRef} />
      <TabOverlay tab={tab} />
    </div>
  );
}

function Divider({ group, path, index, direction }: { group: TabGroup; path: number[]; index: number; direction: 'row' | 'column' }): JSX.Element {
  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault();
    const container = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const total = direction === 'row' ? container.width : container.height;
    let last = direction === 'row' ? e.clientX : e.clientY;
    const move = (ev: MouseEvent): void => {
      const pos = direction === 'row' ? ev.clientX : ev.clientY;
      const delta = (pos - last) / total;
      last = pos;
      const current = useStore.getState().groups.find((g) => g.id === group.id);
      if (current) useStore.getState().setGroupRoot(group.id, resizeSplit(current.root, path, index, delta));
    };
    const up = (): void => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return <div className={`divider ${direction}`} role="separator" aria-orientation={direction === 'row' ? 'vertical' : 'horizontal'} data-testid="divider" onMouseDown={onMouseDown} />;
}

function LayoutView({ node, group, path, tabs, activeKey, multi }: { node: LayoutNode; group: TabGroup; path: number[]; tabs: Tab[]; activeKey: string | null; multi: boolean }): JSX.Element | null {
  if (node.type === 'pane') {
    const tab = tabs.find((t) => t.key === node.key);
    return tab ? <TerminalPane tab={tab} active={tab.key === activeKey} highlight={multi && tab.key === activeKey} /> : null;
  }
  return (
    <div className={`split ${node.direction}`}>
      {node.children.map((child, i) => (
        <div key={child.type === 'pane' ? child.key : `s${i}`} className="split-cell" style={{ flexGrow: node.sizes[i], flexBasis: 0 }}>
          <LayoutView node={child} group={group} path={[...path, i]} tabs={tabs} activeKey={activeKey} multi={multi} />
        </div>
      )).flatMap((cell, i) => (i === 0 ? [cell] : [<Divider key={`d${i}`} group={group} path={path} index={i - 1} direction={node.direction} />, cell]))}
    </div>
  );
}

export function TerminalArea(): JSX.Element {
  const tabs = useStore((s) => s.tabs);
  const groups = useStore((s) => s.groups);
  const activeKey = useStore((s) => s.activeKey);
  return (
    <div className="terminal-area">
      {groups.map((group) => {
        const visible = !!activeKey && tabs.some((t) => t.key === activeKey) && containsPane(group.root, activeKey);
        return (
          <div key={group.id} className={`terminal-group ${visible ? 'active' : ''}`}>
            <LayoutView node={group.root} group={group} path={[]} tabs={tabs} activeKey={activeKey} multi={group.root.type === 'split'} />
          </div>
        );
      })}
    </div>
  );
}

