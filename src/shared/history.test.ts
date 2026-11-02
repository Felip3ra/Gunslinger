import { describe, expect, it } from 'vitest';
import { entriesToPrune, historyCounts, historyHash, sortHistory, type HistoryEntry } from './history';

const entry = (id: string, createdAt: number, kind: HistoryEntry['kind'] = 'auto'): HistoryEntry => ({
  id,
  createdAt,
  kind,
  label: null,
  counts: { commands: 0, projects: 0, workspaces: 0 },
  hash: '',
});

describe('histórico de dados', () => {
  it('hash igual para os mesmos textos, independente da ordem das chaves', () => {
    const a = historyHash({ commands: '{"a":1}', settings: '{}' });
    expect(historyHash({ settings: '{}', commands: '{"a":1}' })).toBe(a);
    expect(historyHash({ settings: '{}', commands: '{"a":2}' })).not.toBe(a);
    // O nome do arquivo entra no hash: o mesmo texto em outro arquivo é outro estado.
    expect(historyHash({ projects: '{}' })).not.toBe(historyHash({ workspaces: '{}' }));
  });

  it('conta comandos, projetos e workspaces; texto inválido conta zero', () => {
    expect(historyCounts({ commands: '{"version":1,"commands":[{},{}]}', projects: 'lixo' })).toEqual({ commands: 2, projects: 0, workspaces: 0 });
  });

  it('retenção apaga só os automáticos mais antigos', () => {
    const entries = [entry('1', 1), entry('2', 2, 'manual'), entry('3', 3), entry('4', 4, 'restore'), entry('5', 5)];
    expect(entriesToPrune(entries, 2).map((e) => e.id)).toEqual(['1']);
    expect(entriesToPrune(entries, 5)).toEqual([]);
  });

  it('ordena do mais recente para o mais antigo', () => {
    expect(sortHistory([entry('a', 1), entry('c', 3), entry('b', 3)]).map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });
});
