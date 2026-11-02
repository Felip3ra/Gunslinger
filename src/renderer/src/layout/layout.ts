/** Layout de uma aba: árvore de painéis (folhas) e divisões (nós internos). Funções puras. */

export type SplitDirection = 'row' | 'column';

export type LayoutNode =
  | { type: 'pane'; key: string }
  | { type: 'split'; direction: SplitDirection; children: LayoutNode[]; sizes: number[] };

export const MIN_SIZE = 0.1;

export const pane = (key: string): LayoutNode => ({ type: 'pane', key });

/** Chaves dos painéis em ordem de leitura (esquerda→direita, cima→baixo). */
export function panesOf(node: LayoutNode): string[] {
  return node.type === 'pane' ? [node.key] : node.children.flatMap(panesOf);
}

export function containsPane(node: LayoutNode, key: string): boolean {
  return panesOf(node).includes(key);
}

/**
 * Divide o painel `target` colocando `newKey` depois dele. Se o pai já é uma divisão na mesma
 * direção, o painel novo entra como irmão (sem aninhar), e o espaço do alvo é repartido ao meio.
 */
export function splitPane(root: LayoutNode, target: string, newKey: string, direction: SplitDirection): LayoutNode {
  if (root.type === 'pane') {
    return root.key === target ? { type: 'split', direction, children: [root, pane(newKey)], sizes: [0.5, 0.5] } : root;
  }
  const index = root.children.findIndex((c) => c.type === 'pane' && c.key === target);
  if (index >= 0 && root.direction === direction) {
    const children = [...root.children];
    children.splice(index + 1, 0, pane(newKey));
    const sizes = [...root.sizes];
    const half = sizes[index]! / 2;
    sizes.splice(index, 1, half, half);
    return { ...root, children, sizes };
  }
  return { ...root, children: root.children.map((c) => splitPane(c, target, newKey, direction)) };
}

/** Remove o painel; divisões que ficam com um filho só são desfeitas. Devolve null se a árvore esvaziar. */
export function removePane(root: LayoutNode, key: string): LayoutNode | null {
  if (root.type === 'pane') return root.key === key ? null : root;
  const kept: { node: LayoutNode; size: number }[] = [];
  root.children.forEach((child, i) => {
    const next = removePane(child, key);
    if (next) kept.push({ node: next, size: root.sizes[i]! });
  });
  if (kept.length === 0) return null;
  if (kept.length === 1) return kept[0]!.node;
  const total = kept.reduce((sum, k) => sum + k.size, 0);
  return { ...root, children: kept.map((k) => k.node), sizes: kept.map((k) => k.size / total) };
}

/** Próximo (delta 1) ou anterior (-1) painel na ordem de leitura, dando a volta. */
export function nextPane(root: LayoutNode, current: string, delta: 1 | -1): string {
  const keys = panesOf(root);
  const i = keys.indexOf(current);
  return keys[(i + delta + keys.length) % keys.length] ?? current;
}

/**
 * Ajusta os tamanhos da divisão no caminho `path` (índices a partir da raiz), movendo a divisória
 * entre os filhos `index` e `index + 1` em `delta` (fração do total), respeitando o mínimo.
 */
export function resizeSplit(root: LayoutNode, path: number[], index: number, delta: number): LayoutNode {
  if (root.type === 'pane') return root;
  if (path.length > 0) {
    const [head, ...rest] = path;
    return { ...root, children: root.children.map((c, i) => (i === head ? resizeSplit(c, rest, index, delta) : c)) };
  }
  const sizes = [...root.sizes];
  const a = sizes[index]!;
  const b = sizes[index + 1]!;
  const clamped = Math.max(MIN_SIZE - a, Math.min(b - MIN_SIZE, delta));
  sizes[index] = a + clamped;
  sizes[index + 1] = b - clamped;
  return { ...root, sizes };
}

