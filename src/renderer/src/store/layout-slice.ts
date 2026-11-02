import type { StateCreator } from 'zustand';
import { containsPane, pane, removePane, splitPane, type LayoutNode, type SplitDirection } from '../layout/layout';

/** Uma aba da barra de abas: um ou mais painéis organizados em árvore. */
export interface TabGroup {
  id: string;
  root: LayoutNode;
  /** Último painel ativo do grupo (volta a ter o foco quando o grupo é ativado). */
  lastActive: string;
}

export interface LayoutSlice {
  groups: TabGroup[];
  addGroup(paneKey: string): void;
  /** Cria uma aba com um layout já montado (usado ao abrir workspaces). */
  addGroupWithRoot(root: LayoutNode, lastActive: string): void;
  addPaneToGroup(targetKey: string, newKey: string, direction: SplitDirection): void;
  /** Tira o painel do seu grupo (o grupo some se ficar vazio). */
  removePaneFromGroups(key: string): void;
  setGroupRoot(groupId: string, root: LayoutNode): void;
  markLastActive(key: string): void;
}

let groupCounter = 0;

export const createLayoutSlice: StateCreator<LayoutSlice, [], [], LayoutSlice> = (set) => ({
  groups: [],
  addGroup: (paneKey) => set((s) => ({ groups: [...s.groups, { id: `group-${++groupCounter}`, root: pane(paneKey), lastActive: paneKey }] })),
  addGroupWithRoot: (root, lastActive) => set((s) => ({ groups: [...s.groups, { id: `group-${++groupCounter}`, root, lastActive }] })),
  addPaneToGroup: (targetKey, newKey, direction) =>
    set((s) => ({
      groups: s.groups.map((g) => (containsPane(g.root, targetKey) ? { ...g, root: splitPane(g.root, targetKey, newKey, direction), lastActive: newKey } : g)),
    })),
  removePaneFromGroups: (key) =>
    set((s) => ({
      groups: s.groups.flatMap((g) => {
        if (!containsPane(g.root, key)) return [g];
        const root = removePane(g.root, key);
        return root ? [{ ...g, root, lastActive: g.lastActive === key ? '' : g.lastActive }] : [];
      }),
    })),
  setGroupRoot: (groupId, root) => set((s) => ({ groups: s.groups.map((g) => (g.id === groupId ? { ...g, root } : g)) })),
  markLastActive: (key) => set((s) => ({ groups: s.groups.map((g) => (containsPane(g.root, key) ? { ...g, lastActive: key } : g)) })),
});

/** Grupo que contém o painel. */
export function groupOf(groups: TabGroup[], key: string | null): TabGroup | undefined {
  return key ? groups.find((g) => containsPane(g.root, key)) : undefined;
}
