import { describe, expect, it } from 'vitest';
import { compileRules, DEFAULT_HIGHLIGHT_RULES, findMatches } from './log-highlight';

const { compiled } = compileRules(DEFAULT_HIGHLIGHT_RULES);
const words = (line: string): string[] => findMatches(line, compiled).map((m) => line.slice(m.start, m.end));

describe('destaque de logs', () => {
  it('erros, avisos e sucesso nas mensagens comuns', () => {
    expect(words('Program.cs(4,1): error CS1002: ; expected')).toEqual(['error']);
    expect(words('fail: Microsoft.AspNetCore.Server[1]')).toEqual(['fail']);
    expect(words('warn: Microsoft.EntityFrameworkCore')).toEqual(['warn']);
    expect(words('npm WARN deprecated')).toEqual(['WARN']);
    expect(words('Build succeeded.')).toEqual(['succeeded']);
    expect(words('Tests passed: 12, failed: 1')).toEqual(['passed', 'failed']);
  });

  it('resumos com zero não acendem', () => {
    expect(words('    0 Aviso(s)')).toEqual([]);
    expect(words('    0 Error(s)')).toEqual([]);
    expect(words('    1 Error(s)')).toEqual(['Error']);
  });

  it('regra inválida é ignorada com aviso; a primeira regra vence sobreposições', () => {
    const r = compileRules([{ pattern: '([', ignoreCase: true }, { pattern: String.raw`PEDIDO-\d+`, ignoreCase: false, foreground: '#58a6ff' }, { pattern: 'PEDIDO', ignoreCase: false }]);
    expect(r.errors).toHaveLength(1);
    expect(findMatches('PEDIDO-42 criado', r.compiled)).toEqual([{ start: 0, end: 9, foreground: '#58a6ff' }]);
  });
});
