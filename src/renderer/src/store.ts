import { create } from 'zustand';
import type { Host, ShellProfile } from '@shared/model';
import { createDataSlice, type DataSlice } from './store/data-slice';
import { createHostsSlice, type HostsSlice } from './store/hosts-slice';
import { createLayoutSlice, type LayoutSlice } from './store/layout-slice';
import { createOverlaysSlice, type DialogRequest, type OverlaysSlice } from './store/overlays-slice';
import { createTabsSlice, type Tab, type TabsSlice } from './store/tabs-slice';
import { createTestsSlice, type TestsSlice } from './store/tests-slice';

export type { DialogButton, DialogRequest, Notice } from './store/overlays-slice';
import { hasModalOpen as overlaysOpen } from './store/overlays-slice';

/** true quando algum modal está aberto (as teclas são dele, não dos atalhos globais). */
export function hasModalOpen(s: AppState): boolean {
  return overlaysOpen(s) || s.testsOpen || s.sshPrompts.length > 0 || !!s.hostDialog || !!s.hostGroupDialog || s.keychainOpen;
}
export type { Tab, TabStatus } from './store/tabs-slice';
export { groupOf, type TabGroup } from './store/layout-slice';

/** Estado do renderer, composto por fatias (uma por responsabilidade). */
export type AppState = DataSlice & TabsSlice & LayoutSlice & OverlaysSlice & TestsSlice & HostsSlice;

export const useStore = create<AppState>()((...a) => ({
  ...createDataSlice(...a),
  ...createHostsSlice(...a),
  ...createTabsSlice(...a),
  ...createLayoutSlice(...a),
  ...createOverlaysSlice(...a),
  ...createTestsSlice(...a),
}));

/** Referência estável para seletores: um `?? []` novo a cada render faz o zustand entrar em loop. */
export const EMPTY: never[] = Object.freeze([]) as never[];

/** Abre um diálogo modal e devolve o valor do botão escolhido (null se cancelado com Esc). */
export function askDialog(req: Omit<DialogRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    useStore.setState({
      dialog: {
        ...req,
        resolve: (value) => {
          useStore.setState({ dialog: null });
          resolve(value);
        },
      },
    });
  });
}

export async function confirmDialog(title: string, message: string, confirmLabel = 'Confirmar'): Promise<boolean> {
  const value = await askDialog({
    title,
    message,
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: confirmLabel, value: 'ok', primary: true },
    ],
  });
  return value === 'ok';
}

export const activeTab = (s: AppState): Tab | undefined => s.tabs.find((t) => t.key === s.activeKey);
export const profileOf = (s: AppState, id: string): ShellProfile | undefined => s.profiles.find((p) => p.id === id);

/** Perfil de shell da aba; undefined em abas SSH (que não têm shell local). */
export const shellProfileOf = (s: AppState, tab: Pick<Tab, 'kind' | 'profileId'>): ShellProfile | undefined =>
  tab.kind === 'ssh' ? undefined : profileOf(s, tab.profileId);

/** Host cadastrado da aba SSH (undefined na conexão rápida, em abas locais ou se o host foi excluído). */
export const hostOf = (s: AppState, tab: Pick<Tab, 'sshTarget'>): Host | undefined =>
  tab.sshTarget?.kind === 'host' ? s.config?.hosts.hosts.find((h) => h.id === (tab.sshTarget as { hostId: string }).hostId) : undefined;
