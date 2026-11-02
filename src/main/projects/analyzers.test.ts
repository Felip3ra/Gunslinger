import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeDotnet, inspectCsproj } from './dotnet';
import { analyzePackage } from './node';
import { scanProject } from './scan';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'gunslinger-proj-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function files(tree: Record<string, string>): Promise<void> {
  for (const [rel, content] of Object.entries(tree)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), content);
  }
}

const webCsproj = '<Project Sdk="Microsoft.NET.Sdk.Web"><ItemGroup /></Project>';
const infraCsproj =
  '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.0" /></ItemGroup></Project>';

describe('scanProject', () => {
  it('encontra .sln, .csproj e package.json até 4 níveis, ignorando bin/obj/node_modules/ocultas', async () => {
    await files({
      'Loja.sln': '',
      'src/Loja.Api/Loja.Api.csproj': webCsproj,
      'src/Loja.Api/bin/Debug/Copia.csproj': '',
      'frontend/package.json': '{}',
      'frontend/node_modules/react/package.json': '{}',
      '.git/x/package.json': '{}',
      'a/b/c/d/package.json': '{}',
      'a/b/c/d/e/package.json': '{}',
    });
    const result = await scanProject(root);
    expect(result).toEqual({
      solutions: ['Loja.sln'],
      csprojs: ['src/Loja.Api/Loja.Api.csproj'],
      packageJsonDirs: ['a/b/c/d', 'frontend'],
    });
  });
});

describe('analisador .NET', () => {
  it('sugere startupProject (Sdk.Web) e project (referencia EF Core)', async () => {
    await files({ 'src/Loja.Api/Loja.Api.csproj': webCsproj, 'src/Loja.Infra/Loja.Infra.csproj': infraCsproj });
    const analysis = await analyzeDotnet(root, ['src/Loja.Api/Loja.Api.csproj', 'src/Loja.Infra/Loja.Infra.csproj'], ['Loja.sln']);
    expect(analysis.suggestedStartupProject).toBe('src/Loja.Api/Loja.Api.csproj');
    expect(analysis.suggestedProject).toBe('src/Loja.Infra/Loja.Infra.csproj');
  });

  it('com dois candidatos a project, não escolhe automaticamente', async () => {
    await files({ 'A/A.csproj': infraCsproj, 'B/B.csproj': infraCsproj });
    const analysis = await analyzeDotnet(root, ['A/A.csproj', 'B/B.csproj'], []);
    expect(analysis.suggestedProject).toBeNull();
    expect(analysis.projectCandidates).toEqual(['A/A.csproj', 'B/B.csproj']);
  });

  it('reconhece projeto executável', () => {
    expect(inspectCsproj('x', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType></PropertyGroup></Project>').isExe).toBe(true);
  });
});

describe('analisador Node', () => {
  it('lê scripts e detecta o gerenciador pelo arquivo de lock', async () => {
    await files({ 'frontend/package.json': JSON.stringify({ name: 'web', scripts: { dev: 'vite', build: 'vite build' } }), 'frontend/yarn.lock': '' });
    const pkg = await analyzePackage(root, 'frontend', undefined);
    expect(pkg).toMatchObject({ name: 'web', scripts: { dev: 'vite', build: 'vite build' }, packageManager: 'yarn', packageManagerSource: 'lockfile', yarnBerry: false });
  });

  it('campo packageManager tem prioridade; yarn 4 é yarn berry', async () => {
    await files({ 'package.json': JSON.stringify({ packageManager: 'yarn@4.1.0' }), 'package-lock.json': '' });
    const pkg = await analyzePackage(root, '', undefined);
    expect(pkg).toMatchObject({ packageManager: 'yarn', packageManagerSource: 'packageManager-field', yarnBerry: true });
  });

  it('monorepo: arquivo de lock na raiz vale para o pacote', async () => {
    await files({ 'pnpm-lock.yaml': '', 'packages/web/package.json': '{}' });
    expect((await analyzePackage(root, 'packages/web', undefined)).packageManager).toBe('pnpm');
  });

  it('vários arquivos de lock: npm com aviso; escolha manual vence', async () => {
    await files({ 'package.json': '{}', 'package-lock.json': '', 'yarn.lock': '' });
    const pkg = await analyzePackage(root, '', undefined);
    expect(pkg.packageManager).toBe('npm');
    expect(pkg.warnings[0]).toMatch(/Vários arquivos de lock/);
    expect((await analyzePackage(root, '', 'yarn')).packageManagerSource).toBe('override');
  });

  it('package.json inválido mantém a última lista marcada como desatualizada', async () => {
    await files({ 'package.json': JSON.stringify({ scripts: { a: '1', b: '2', c: '3' } }) });
    const ok = await analyzePackage(root, '', undefined);
    await writeFile(join(root, 'package.json'), '{ "scripts": { "a": "1", } }');
    const broken = await analyzePackage(root, '', undefined, ok);
    expect(broken.stale).toBe(true);
    expect(Object.keys(broken.scripts)).toEqual(['a', 'b', 'c']);
    expect(broken.error).toMatch(/package\.json inválido/);
  });

  it('sem lock e sem campo: npm', async () => {
    await files({ 'package.json': '{}' });
    expect((await analyzePackage(root, '', undefined)).packageManagerSource).toBe('default');
  });
});
