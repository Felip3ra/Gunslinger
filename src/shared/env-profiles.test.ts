import { describe, expect, it } from 'vitest';
import { envCommands, parseVariablesText, variablesToText } from './env-profiles';

const vars = { ASPNETCORE_ENVIRONMENT: 'Development', MSG: "it's a test" };

describe('perfis de ambiente', () => {
  it('gera comandos por shell com as aspas certas', () => {
    expect(envCommands('cmd', vars)).toEqual(['set "ASPNETCORE_ENVIRONMENT=Development"', `set "MSG=it's a test"`]);
    expect(envCommands('pwsh', vars)).toEqual(["$env:ASPNETCORE_ENVIRONMENT = 'Development'", "$env:MSG = 'it''s a test'"]);
    expect(envCommands('gitbash', vars)).toEqual(["export ASPNETCORE_ENVIRONMENT='Development'", String.raw`export MSG='it'\''s a test'`]);
    expect(envCommands('custom', vars)).toBeNull();
  });

  it('lê e escreve o texto NOME=valor', () => {
    const { variables, errors } = parseVariablesText('A=1\n# comentário\n\n B = x=y\n1X=2');
    expect(variables).toEqual({ A: '1', B: ' x=y' });
    expect(errors).toEqual(['Linha 5: use NOME=valor']);
    expect(variablesToText({ A: '1', B: '2' })).toBe('A=1\nB=2');
  });
});
