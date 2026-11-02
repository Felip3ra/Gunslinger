import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const webCsproj = '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>';
const infraCsproj = '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.0" /></ItemGroup></Project>';

function makeProjectFolder(): string {
  const root = mkdtempSync(join(tmpdir(), 'Loja-'));
  const write = (rel: string, content: string): void => {
    mkdirSync(join(root, rel, '..'), { recursive: true });
    writeFileSync(join(root, rel), content);
  };
  write('Loja.sln', '');
  write('src/Loja.Api/Loja.Api.csproj', webCsproj);
  write('src/Loja.Infra/Loja.Infra.csproj', infraCsproj);
  write('frontend/package.json', JSON.stringify({ name: 'web', scripts: { dev: 'node -e "console.log(\'DEV_\'+\'OK\')"' } }, null, 2));
  write('frontend/package-lock.json', '{}');
  return root;
}

function userData(root: string, extraCommands: unknown[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  writeFileSync(
    join(dir, 'projects.json'),
    JSON.stringify({
      version: 1,
      projects: [
        {
          id: 'p1',
          name: 'Loja',
          rootPath: root,
          defaultProfileId: 'builtin.cmd',
          types: { dotnet: true, node: true },
          variables: { project: 'src/Loja.Infra/Loja.Infra.csproj', startupProject: 'src/Loja.Api/Loja.Api.csproj' },
          node: { packageManagerOverrides: {} },
        },
      ],
    }),
  );
  writeFileSync(join(dir, 'commands.json'), JSON.stringify({ version: 1, commands: extraCommands }));
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

async function openLoja(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Projetos' }).click();
  await page.getByTestId('project-item').filter({ hasText: 'Loja' }).getByRole('button', { name: 'Abrir' }).click();
  await expect(page.getByTestId('tab')).toHaveCount(2);
  await expect(page.getByTestId('status-project')).toContainText('Loja');
}

test('abrir projeto: aba na raiz, grupos EF Core e Node lado a lado', async () => {
  const root = makeProjectFolder();
  const { page, close } = await launchApp({ userData: userData(root) });
  try {
    await openLoja(page);
    await expect(page.getByTestId('status-cwd')).toHaveText(root);
    await expect(page.getByTestId('group-ef')).toContainText('Nova migration');
    await expect(page.getByTestId('group-node')).toContainText('Node: frontend · npm');
    await expect(page.getByTestId('group-node')).toContainText('dev');

    // Troca de aba troca o projeto ativo.
    await page.getByTestId('tab').first().click();
    await expect(page.getByTestId('project-section')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('script de subpasta roda na pasta do pacote depois de confirmar a troca', async () => {
  const root = makeProjectFolder();
  const { page, close } = await launchApp({ userData: userData(root) });
  try {
    await openLoja(page);
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.getByRole('button', { name: 'Executar dev' }).click();
    await page.getByTestId('dialog').getByRole('button', { name: 'Mudar pasta' }).click();
    await expect.poll(() => bufferText(page), { timeout: 20_000 }).toMatch(/^DEV_OK$/m);
    await expect(page.getByTestId('status-cwd')).toHaveText(`${root}\\frontend`);
  } finally {
    await close();
  }
});

test('EF: nova migration usa as variáveis do projeto na pré-visualização', async () => {
  const root = makeProjectFolder();
  const { page, close } = await launchApp({ userData: userData(root) });
  try {
    await openLoja(page);
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.getByRole('button', { name: 'Inserir Nova migration' }).click();
    const dialog = page.getByTestId('variables-dialog');
    await expect(dialog).toContainText('(do projeto)');
    await dialog.getByLabel('Nome da migration').fill('AddPedidos');
    await expect(page.getByTestId('variables-preview')).toHaveText(
      'dotnet ef migrations add AddPedidos --project "src/Loja.Infra/Loja.Infra.csproj" --startup-project "src/Loja.Api/Loja.Api.csproj"',
    );
    await dialog.getByRole('button', { name: 'Inserir' }).click();
    await expect.poll(() => bufferText(page)).toContain('dotnet ef migrations add AddPedidos --project');

    // Remover pede confirmação com pré-visualização, mesmo sem variáveis próprias.
    await page.keyboard.press('Control+C');
    await page.getByRole('button', { name: 'Executar Remover última migration' }).click();
    await expect(page.getByTestId('variables-preview')).toContainText('dotnet ef migrations remove --project');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('variables-dialog')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('novo script no package.json aparece sem reiniciar', async () => {
  const root = makeProjectFolder();
  const { page, close } = await launchApp({ userData: userData(root) });
  try {
    await openLoja(page);
    await expect(page.getByTestId('group-node')).toContainText('dev');
    const pkgPath = join(root, 'frontend', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.scripts.test = 'vitest';
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    await expect(page.getByTestId('group-node').getByTestId('command-row').filter({ hasText: 'npm run test' })).toBeVisible({ timeout: 3000 });

    writeFileSync(pkgPath, '{ "scripts": { "dev": "x", } }');
    await expect(page.getByTestId('group-node')).toContainText('package.json inválido', { timeout: 3000 });
    await expect(page.getByTestId('group-node')).toContainText('npm run test');
  } finally {
    await close();
  }
});

test('excluir projeto com comando vinculado: tornar global', async () => {
  const root = makeProjectFolder();
  const dir = userData(root, [
    { id: 'c1', name: 'Seed do banco', command: 'echo seed', description: '', category: '', targetProfileId: null, cwd: null, projectId: 'p1', variables: {} },
  ]);
  const { page, close } = await launchApp({ userData: dir });
  try {
    // Comando vinculado não aparece fora do projeto.
    await expect(page.getByTestId('command-row').filter({ hasText: 'Seed do banco' })).toHaveCount(0);
    await openLoja(page);
    await expect(page.getByTestId('group-linked')).toContainText('Seed do banco');

    await page.getByRole('button', { name: 'Projetos' }).click();
    await page.getByTestId('project-item').getByRole('button', { name: 'Excluir' }).click();
    await page.getByTestId('dialog').getByRole('button', { name: 'Tornar globais' }).click();
    await expect(page.getByTestId('project-item')).toHaveCount(0);
    const commands = JSON.parse(readFileSync(join(dir, 'commands.json'), 'utf8'));
    expect(commands.commands[0].projectId).toBeNull();
  } finally {
    await close();
  }
});

test('cadastro: pasta inexistente é recusada', async () => {
  const { page, close } = await launchApp({ userData: userData(makeProjectFolder()) });
  try {
    await page.getByRole('button', { name: 'Projetos' }).click();
    await page.getByRole('button', { name: 'Novo projeto' }).click();
    const form = page.getByTestId('project-form');
    await form.getByLabel('Pasta raiz').fill('C:\\nao\\existe\\gunslinger');
    await form.getByLabel('Nome do projeto').fill('Fantasma');
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(form).toContainText('Pasta raiz inválida');
  } finally {
    await close();
  }
});
