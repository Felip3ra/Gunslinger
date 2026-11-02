import type { Workspace, WorkspaceLayout, WorkspacePane } from './model';

/** Árvore de painéis com chaves (mesma forma do layout do renderer). */
export type KeyTree = { type: 'pane'; key: string } | { type: 'split'; direction: 'row' | 'column'; sizes: number[]; children: KeyTree[] };

/** Converte o layout aberto (chaves de painel) em layout de workspace. */
export function captureLayout(root: KeyTree, paneInfo: (key: string) => WorkspacePane): WorkspaceLayout {
  if (root.type === 'pane') return { type: 'pane', pane: paneInfo(root.key) };
  return { type: 'split', direction: root.direction, sizes: [...root.sizes], children: root.children.map((c) => captureLayout(c, paneInfo)) };
}

/** Cria os painéis (em ordem de leitura) e devolve a árvore com as chaves criadas. */
export async function buildKeyTree(layout: WorkspaceLayout, create: (pane: WorkspacePane) => Promise<string | null>): Promise<KeyTree | null> {
  if (layout.type === 'pane') {
    const key = await create(layout.pane);
    return key ? { type: 'pane', key } : null;
  }
  const built: { node: KeyTree; size: number }[] = [];
  for (let i = 0; i < layout.children.length; i++) {
    const node = await buildKeyTree(layout.children[i]!, create);
    if (node) built.push({ node, size: layout.sizes[i] ?? 1 });
  }
  if (built.length === 0) return null;
  if (built.length === 1) return built[0]!.node;
  const total = built.reduce((s, b) => s + b.size, 0);
  return { type: 'split', direction: layout.direction, sizes: built.map((b) => b.size / total), children: built.map((b) => b.node) };
}

export function panesOfLayout(layout: WorkspaceLayout): WorkspacePane[] {
  return layout.type === 'pane' ? [layout.pane] : layout.children.flatMap(panesOfLayout);
}

/** Comandos iniciais do workspace, na ordem em que serão executados. */
export function commandsOf(workspace: Workspace): string[] {
  return workspace.tabs.flatMap(panesOfLayout).map((p) => p.command?.trim() ?? '').filter(Boolean);
}
