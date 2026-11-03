import type { StateCreator } from 'zustand';

export type TabStatus = 'starting' | 'running' | 'exited' | 'error';

export interface Tab {
  /** Identificador estável no renderer (a sessão muda ao reiniciar). */
  key: string;
  sessionId: string | null;
  profileId: string;
  projectId: string | null;
  shellTitle: string | null;
  cwd: string | null;
  envGeneration: number;
  status: TabStatus;
  exitCode: number | null;
  error: string | null;
  commandRunning: boolean;
  /** Shell elevado (administrador). */
  elevated: boolean;
  /** Perfil de ambiente ativo na aba (nova aba com ambiente ou ambiente aplicado). */
  envProfileId: string | null;
  /** Quando a sessão atual começou (para reconhecer o UAC recusado). */
  startedAt: number;
  /** Versão do Node informada pelo shell (fnm por sessão); null = a do ambiente do app. */
  nodeVersion: string | null;
}

/** Abas abertas e a aba ativa. */
export interface TabsSlice {
  tabs: Tab[];
  activeKey: string | null;
  addTab(tab: Tab): void;
  updateTab(key: string, patch: Partial<Tab>): void;
  removeTab(key: string): void;
  activate(key: string | null): void;
}

export const createTabsSlice: StateCreator<TabsSlice, [], [], TabsSlice> = (set) => ({
  tabs: [],
  activeKey: null,
  addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab], activeKey: tab.key })),
  updateTab: (key, patch) => set((s) => ({ tabs: s.tabs.map((t) => (t.key === key ? { ...t, ...patch } : t)) })),
  removeTab: (key) =>
    set((s) => {
      const index = s.tabs.findIndex((t) => t.key === key);
      const tabs = s.tabs.filter((t) => t.key !== key);
      let activeKey = s.activeKey;
      if (activeKey === key) activeKey = tabs[Math.min(index, tabs.length - 1)]?.key ?? null;
      return { tabs, activeKey };
    }),
  activate: (key) => set({ activeKey: key }),
});
