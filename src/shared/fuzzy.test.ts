import { describe, expect, it } from 'vitest';
import { normalizeAligned, prepareItems, rankItems, type SearchItem } from './fuzzy';

const item = (id: string, title: string, secondary = '', detail = ''): SearchItem => ({ id, title, secondary, detail });

describe('rankItems', () => {
  const items = prepareItems([
    item('1', 'Nova migration', 'EF', 'dotnet ef migrations add {nome}'),
    item('2', 'Atualizar banco de produção', 'EF', 'dotnet ef database update'),
    item('3', 'Status curto', 'Git', 'git status -sb'),
    item('4', 'Listar', 'Nova categoria', 'echo'),
  ]);

  it('aceita subsequência e destaca as letras do nome', () => {
    const [first] = rankItems('nvmig', items);
    expect(first?.item.id).toBe('1');
    expect(first?.titleIndexes.length).toBe(5);
  });

  it('ignora acentos', () => {
    expect(rankItems('producao', items)[0]?.item.id).toBe('2');
  });

  it('nome pesa mais que categoria', () => {
    const ids = rankItems('nova', items).map((r) => r.item.id);
    expect(ids.indexOf('1')).toBeLessThan(ids.indexOf('4'));
  });

  it('casamento compacto vence: ação normal antes da de administrador', () => {
    const profiles = prepareItems([item('admin', 'Nova aba como administrador: Git Bash'), item('normal', 'Nova aba: Git Bash')]);
    expect(rankItems('nova aba git bash', profiles)[0]?.item.id).toBe('normal');
  });

  it('procura também no texto do comando', () => {
    expect(rankItems('database', items)[0]?.item.id).toBe('2');
  });

  it('sem correspondência devolve lista vazia', () => {
    expect(rankItems('xyzxyz', items)).toEqual([]);
  });

  it('mantém o alinhamento dos índices com acentos', () => {
    expect(normalizeAligned('Ação')).toBe('acao');
  });

  it('1.000 itens em menos de 50 ms por busca', () => {
    const many = prepareItems(Array.from({ length: 1000 }, (_, i) => item(String(i), `Comando ${i} de teste`, `Categoria ${i % 20}`, `echo valor ${i}`)));
    rankItems('aquecimento', many);
    const start = performance.now();
    for (const q of ['c', 'co', 'com', 'coma', 'coman', 'comand']) rankItems(q, many);
    expect((performance.now() - start) / 6).toBeLessThan(50);
  });
});
