import { describe, expect, it } from 'vitest';
import { nextPane, pane, panesOf, removePane, resizeSplit, splitPane, type LayoutNode } from './layout';

describe('layout', () => {
  it('divide um painel em dois', () => {
    expect(splitPane(pane('a'), 'a', 'b', 'row')).toEqual({ type: 'split', direction: 'row', children: [pane('a'), pane('b')], sizes: [0.5, 0.5] });
  });

  it('mesma direção: o novo painel vira irmão, repartindo o espaço do alvo', () => {
    const two = splitPane(pane('a'), 'a', 'b', 'row');
    const three = splitPane(two, 'a', 'c', 'row');
    expect(panesOf(three)).toEqual(['a', 'c', 'b']);
    expect(three.type === 'split' && three.sizes).toEqual([0.25, 0.25, 0.5]);
  });

  it('direção diferente: aninha', () => {
    const tree = splitPane(splitPane(pane('a'), 'a', 'b', 'row'), 'b', 'c', 'column');
    expect(tree).toMatchObject({ type: 'split', direction: 'row', children: [pane('a'), { type: 'split', direction: 'column' }] });
    expect(panesOf(tree)).toEqual(['a', 'b', 'c']);
  });

  it('remover desfaz divisões com um filho e renormaliza tamanhos', () => {
    const tree = splitPane(splitPane(pane('a'), 'a', 'b', 'row'), 'b', 'c', 'column');
    expect(removePane(tree, 'c')).toEqual({ type: 'split', direction: 'row', children: [pane('a'), pane('b')], sizes: [0.5, 0.5] });
    expect(removePane(pane('a'), 'a')).toBeNull();
    const three: LayoutNode = { type: 'split', direction: 'row', children: [pane('a'), pane('b'), pane('c')], sizes: [0.2, 0.3, 0.5] };
    const after = removePane(three, 'c');
    expect(after?.type === 'split' && after.sizes).toEqual([0.4, 0.6]);
  });

  it('próximo painel dá a volta', () => {
    const tree = splitPane(splitPane(pane('a'), 'a', 'b', 'row'), 'b', 'c', 'row');
    expect(nextPane(tree, 'c', 1)).toBe('a');
    expect(nextPane(tree, 'a', -1)).toBe('c');
  });

  it('arrastar a divisória respeita o tamanho mínimo', () => {
    const tree = splitPane(pane('a'), 'a', 'b', 'row');
    const wider = resizeSplit(tree, [], 0, 0.2);
    expect(wider.type === 'split' && wider.sizes.map((s) => +s.toFixed(2))).toEqual([0.7, 0.3]);
    const clamped = resizeSplit(tree, [], 0, 0.9);
    expect(clamped.type === 'split' && clamped.sizes.map((s) => +s.toFixed(2))).toEqual([0.9, 0.1]);
  });
});
