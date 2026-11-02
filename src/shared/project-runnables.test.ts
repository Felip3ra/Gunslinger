import { describe, expect, it } from 'vitest';
import type { NodePackage, Project, ProjectAnalysis } from './model';
import { joinWindows, projectRunnables } from './project-runnables';
import { renderTemplate } from './variables';

const project: Project = {
  id: 'p1',
  name: 'Loja',
  rootPath: 'C:\\src\\Loja',
  defaultProfileId: 'builtin.pwsh',
  types: { dotnet: true, node: true },
  variables: { project: 'src/Loja.Infra/Loja.Infra.csproj', startupProject: 'src/Loja.Api/Loja.Api.csproj' },
  node: { packageManagerOverrides: {} },
};

const pkg: NodePackage = {
  dir: 'frontend',
  name: 'web',
  scripts: { dev: 'vite', build: 'vite build' },
  packageManager: 'pnpm',
  packageManagerSource: 'lockfile',
  yarnBerry: false,
  testFramework: null,
  warnings: [],
  stale: false,
  error: null,
};

const analysis = { nodePackages: [pkg], dotnet: { launchProfiles: [] } } as unknown as ProjectAnalysis;

describe('projectRunnables', () => {
  const result = projectRunnables(project, analysis, []);

  it('EF roda na raiz e usa as variáveis do projeto', () => {
    const add = result.ef.find((c) => c.id === 'ef:p1:add')!;
    expect(add.cwd).toBe('C:\\src\\Loja');
    expect(renderTemplate(add.text, { ...project.variables, nome: 'AddPedidos' })).toContain('--startup-project "src/Loja.Api/Loja.Api.csproj"');
    expect(result.ef.find((c) => c.id === 'ef:p1:remove')!.confirm).toBe(true);
  });

  it('scripts e comandos de Node rodam na pasta do pacote com o gerenciador certo', () => {
    const group = result.node[0]!;
    expect(group.label).toBe('frontend');
    expect(group.scripts.map((s) => [s.title, s.text, s.cwd])).toEqual([
      ['dev', 'pnpm run dev', 'C:\\src\\Loja\\frontend'],
      ['build', 'pnpm run build', 'C:\\src\\Loja\\frontend'],
    ]);
    expect(group.commands.find((c) => c.title === 'Rodar npx')!.text).toBe('pnpm dlx {comando}');
    expect(group.scripts[0]!.preflight).toEqual(['node', 'pnpm']);
  });

  it('tipos desligados não geram grupos', () => {
    const onlyDotnet = projectRunnables({ ...project, types: { dotnet: true, node: false } }, analysis, []);
    expect(onlyDotnet.node).toEqual([]);
  });

  it('joinWindows', () => {
    expect(joinWindows('C:\\src\\', 'a/b')).toBe('C:\\src\\a\\b');
    expect(joinWindows('C:\\src', '')).toBe('C:\\src');
  });
});
