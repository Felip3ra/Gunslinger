import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function setup(): string {
  const root = mkdtempSync(join(tmpdir(), 'Loja-'));
  mkdirSync(join(root, 'src', 'Loja.Api', 'Properties'), { recursive: true });
  writeFileSync(join(root, 'src', 'Loja.Api', 'Loja.Api.csproj'), '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>');
  writeFileSync(
    join(root, 'src', 'Loja.Api', 'Properties', 'launchSettings.json'),
    JSON.stringify({ profiles: { http: { commandName: 'Project', applicationUrl: 'http://localhost:5270' }, 'IIS Express': { commandName: 'IISExpress' } } }),
  );
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  writeFileSync(
    join(dir, 'projects.json'),
    JSON.stringify({ version: 1, projects: [{ id: 'p1', name: 'Loja', rootPath: root, defaultProfileId: 'builtin.cmd', types: { dotnet: true, node: false }, variables: {}, node: { packageManagerOverrides: {} } }] }),
  );
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

test('perfis do launchSettings.json viram comandos; IIS Express desativado', async () => {
  const { page, close } = await launchApp({ userData: setup() });
  try {
    await page.getByRole('button', { name: 'Projetos' }).click();
    await page.getByTestId('project-item').getByRole('button', { name: 'Abrir' }).click();
    const group = page.getByTestId('group-launch');
    await expect(group).toContainText('Loja.Api: http');
    await expect(group).toContainText('Loja.Api: http (watch)');
    await expect(group.getByTestId('command-row').filter({ hasText: 'IIS Express' })).toHaveClass(/disabled/);

    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.getByRole('button', { name: 'Inserir Loja.Api: http (watch)' }).click();
    // A linha pode quebrar pela largura do terminal.
    await expect.poll(async () => (await bufferText(page)).replace(/\n/g, '')).toContain('dotnet watch run --project "src/Loja.Api/Loja.Api.csproj" --launch-profile "http"');
  } finally {
    await close();
  }
});
