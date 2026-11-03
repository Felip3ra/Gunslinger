import { api } from './api';
import { useStore } from './store';
import { openTab } from './tabs';
import { captureOpenTabs, openWorkspace } from './workspaces';

const SAVE_DELAY_MS = 500;

/** Grava as abas abertas sempre que mudam, para reabri-las na próxima vez. */
export function wireSessionSaving(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let last = '';
  useStore.subscribe((s, prev) => {
    if (s.groups === prev.groups && s.tabs === prev.tabs) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const tabs = captureOpenTabs();
      const text = JSON.stringify(tabs);
      if (text === last || tabs.length === 0) return;
      last = text;
      void api.invoke('session:save', { tabs }).catch(() => undefined);
    }, SAVE_DELAY_MS);
  });
}

/** Reabre a última sessão (abas, painéis e pastas, sem comandos) ou abre uma aba nova. */
export async function restoreSessionOrOpenTab(): Promise<void> {
  const { ui, config } = useStore.getState();
  const last = ui?.lastSession ?? [];
  if (config?.settings.session.restore && last.length > 0) {
    await openWorkspace({ id: 'last-session', name: 'Última sessão', tabs: last });
    if (useStore.getState().tabs.length > 0) return;
  }
  await openTab();
}
