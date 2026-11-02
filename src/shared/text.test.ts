import { describe, expect, it } from 'vitest';
import { matchesFilter, normalizeText } from './text';

describe('normalizeText', () => {
  it('remove acentos e caixa', () => {
    expect(normalizeText('Atualizar banco de PRODUÇÃO')).toBe('atualizar banco de producao');
  });

  it('filtro casa todas as palavras em qualquer campo', () => {
    expect(matchesFilter('producao banco', ['Atualizar banco de produção', 'EF'])).toBe(true);
    expect(matchesFilter('docker', ['Atualizar banco', 'EF'])).toBe(false);
    expect(matchesFilter('  ', ['x'])).toBe(true);
  });
});
