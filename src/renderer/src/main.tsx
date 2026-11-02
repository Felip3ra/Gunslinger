import '@xterm/xterm/css/xterm.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { compileRules } from '@shared/log-highlight';
import { App } from './App';
import { installGlobalShortcuts } from './actions';
import { api } from './api';
import { useStore } from './store';
import { wireProjectEvents } from './projects';
import { wireTestEvents } from './tests';
import { openTab, wirePtyEvents } from './tabs';
import { terminals } from './terminal/terminal-registry';
import { applyUiColors } from './ui-colors';

// Leitura do conteúdo do terminal para testes e2e (com WebGL, o texto não fica no DOM). Somente leitura.
(window as unknown as Record<string, unknown>)['__gunslingerDebug'] = {
  bufferText(): string {
    const key = useStore.getState().activeKey;
    const term = key ? terminals.get(key) : undefined;
    if (!term) return '';
    const buf = term.buffer.active;
    const lines: string[] = [];
    for (let y = 0; y < buf.length; y++) lines.push(buf.getLine(y)?.translateToString(true) ?? '');
    return lines.join('\n');
  },
  tabs: () => useStore.getState().tabs.map((t) => ({ ...t })),
  fontSizes: () => useStore.getState().tabs.map((t) => terminals.get(t.key)?.options.fontSize ?? 0),
  /** Cor do primeiro caractere de `needle` na saída: { rgb, color } (cor 24 bits ou índice da paleta). */
  cellColor(needle: string): { rgb: boolean; palette: boolean; color: number } | null {
    const key = useStore.getState().activeKey;
    const buf = key ? terminals.get(key)?.buffer.active : undefined;
    if (!buf) return null;
    for (let y = buf.length - 1; y >= 0; y--) {
      const line = buf.getLine(y);
      const x = line?.translateToString(true).indexOf(needle) ?? -1;
      if (line && x >= 0) {
        const cell = line.getCell(x)!;
        return { rgb: cell.isFgRGB(), palette: cell.isFgPalette(), color: cell.getFgColor() };
      }
    }
    return null;
  },
  dims(): { cols: number; rows: number; viewportY: number } {
    const key = useStore.getState().activeKey;
    const term = key ? terminals.get(key) : undefined;
    return { cols: term?.cols ?? 0, rows: term?.rows ?? 0, viewportY: term?.buffer.active.viewportY ?? 0 };
  },
};

async function bootstrap(): Promise<void> {
  const [config, profiles, ui, plugins] = await Promise.all([
    api.invoke('config:get'),
    api.invoke('profiles:list'),
    api.invoke('state:get'),
    api.invoke('plugins:get'),
  ]);
  const store = useStore.getState();
  store.setConfig(config);
  applyUiColors(config.settings.appearance.ui);
  useStore.setState({ plugins });
  terminals.setPluginHighlightRules(plugins.contributions.highlightRules);
  store.setProfiles(profiles);
  store.setUi(ui);

  const warnHighlightErrors = (settings: typeof config.settings): void => {
    for (const error of compileRules(settings.logHighlight.rules).errors)
      useStore.getState().pushNotice('warning', error);
  };
  warnHighlightErrors(config.settings);
  api.on('config:changed', (snapshot) => {
    warnHighlightErrors(snapshot.settings);
    useStore.getState().setConfig(snapshot);
    applyUiColors(snapshot.settings.appearance.ui);
    terminals.applySettings(snapshot.settings);
    const key = useStore.getState().activeKey;
    if (key) requestAnimationFrame(() => terminals.fit(key));
  });
  api.on('plugins:changed', (snapshot) => {
    for (const error of compileRules(snapshot.contributions.highlightRules).errors)
      useStore.getState().pushNotice('warning', `Plugin: ${error}`);
    useStore.setState({ plugins: snapshot });
    terminals.setPluginHighlightRules(snapshot.contributions.highlightRules);
  });
  api.on('profiles:changed', (list) => useStore.getState().setProfiles(list));
  api.on('env:changed', ({ envGeneration }) => useStore.setState({ envGeneration }));
  api.on('status:changed', ({ sessionId, status }) =>
    useStore.setState((s) => ({ statuses: { ...s.statuses, [sessionId]: status } })),
  );
  wirePtyEvents();
  wireProjectEvents();
  wireTestEvents();
  api.on('notification:clicked', ({ sessionId }) => {
    const tab = useStore.getState().tabs.find((t) => t.sessionId === sessionId);
    if (tab) useStore.getState().activate(tab.key);
  });
  // A barra de status recalcula as informações da aba que acabou de ficar ativa.
  useStore.subscribe((s, prev) => {
    const session = s.tabs.find((t) => t.key === s.activeKey)?.sessionId ?? null;
    const prevSession = prev.tabs.find((t) => t.key === prev.activeKey)?.sessionId ?? null;
    if (session !== prevSession) api.send('session:activate', { sessionId: session });
  });
  installGlobalShortcuts();

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  await openTab();
}

void bootstrap();
