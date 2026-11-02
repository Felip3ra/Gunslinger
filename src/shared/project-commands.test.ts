import { describe, expect, it } from 'vitest';
import { buildEfCommand } from './ef-commands';
import { buildNodeCommand, buildRunScript } from './node-commands';
import { renderTemplate } from './variables';

describe('buildEfCommand', () => {
  const vars = { project: 'src/Loja.Infra/Loja.Infra.csproj', startupProject: 'src/Loja.Api/Loja.Api.csproj' };

  it('nova migration com as duas flags do projeto', () => {
    const text = buildEfCommand('add', vars);
    expect(renderTemplate(text, { ...vars, nome: 'AddPedidos' })).toBe(
      'dotnet ef migrations add AddPedidos --project "src/Loja.Infra/Loja.Infra.csproj" --startup-project "src/Loja.Api/Loja.Api.csproj"',
    );
  });

  it('todos os comandos recebem as flags definidas', () => {
    expect(buildEfCommand('update', vars)).toBe('dotnet ef database update --project "{project}" --startup-project "{startupProject}"');
    expect(buildEfCommand('script', { project: 'a.csproj' })).toBe('dotnet ef migrations script --project "{project}"');
  });

  it('sem variáveis de EF, sem flags', () => {
    expect(buildEfCommand('list', {})).toBe('dotnet ef migrations list');
    expect(buildEfCommand('list', { project: '  ' })).toBe('dotnet ef migrations list');
  });
});

describe('buildNodeCommand', () => {
  it('segue a tabela da spec', () => {
    expect(buildNodeCommand('install', 'yarn')).toBe('yarn install');
    expect(buildNodeCommand('add', 'npm')).toBe('npm install {pacote}');
    expect(buildNodeCommand('add', 'pnpm')).toBe('pnpm add {pacote}');
    expect(buildNodeCommand('addDev', 'npm')).toBe('npm install -D {pacote}');
    expect(buildNodeCommand('addDev', 'yarn')).toBe('yarn add -D {pacote}');
    expect(buildNodeCommand('npx', 'npm')).toBe('npx {comando}');
    expect(buildNodeCommand('npx', 'yarn')).toBe('npx {comando}');
    expect(buildNodeCommand('npx', 'yarn', true)).toBe('yarn dlx {comando}');
    expect(buildNodeCommand('npx', 'pnpm')).toBe('pnpm dlx {comando}');
  });

  it('executa scripts com o gerenciador do pacote', () => {
    expect(buildRunScript('pnpm', 'build')).toBe('pnpm run build');
    expect(buildRunScript('npm', 'test:unit')).toBe('npm run test:unit');
    expect(buildRunScript('npm', 'meu script')).toBe('npm run "meu script"');
  });
});
