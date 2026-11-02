import { describe, expect, it } from 'vitest';
import { extractVariables, renderTemplate } from './variables';

describe('variáveis de comando', () => {
  it('encontra variáveis na ordem, sem repetir', () => {
    expect(extractVariables('git checkout -b {branch} && git push -u origin {branch} {_x1}')).toEqual(['branch', '_x1']);
  });

  it('chaves de script do PowerShell são texto literal', () => {
    const cmd = 'Get-ChildItem | ForEach-Object { $_.Name }';
    expect(extractVariables(cmd)).toEqual([]);
    expect(renderTemplate(cmd, {})).toBe(cmd);
  });

  it('{{ e }} viram chaves literais', () => {
    expect(extractVariables('echo {{literal}} {valor}')).toEqual(['valor']);
    expect(renderTemplate('echo {{literal}} {valor}', { valor: 'abc' })).toBe('echo {literal} abc');
  });

  it('nomes inválidos não são variáveis', () => {
    expect(extractVariables('{1abc} {a-b} {ok}')).toEqual(['ok']);
  });

  it('variáveis sem valor permanecem', () => {
    expect(renderTemplate('dotnet ef migrations add {nome}', {})).toBe('dotnet ef migrations add {nome}');
  });

  it('o valor é inserido sem reinterpretar chaves', () => {
    expect(renderTemplate('echo {a}', { a: '{b}' })).toBe('echo {b}');
  });
});
