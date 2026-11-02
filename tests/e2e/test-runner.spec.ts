import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function userData(root: string, types: { dotnet: boolean; node: boolean }): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  writeFileSync(
    join(dir, 'projects.json'),
    JSON.stringify({ version: 1, projects: [{ id: 'p1', name: 'Amostra', rootPath: root, defaultProfileId: 'builtin.cmd', types, variables: {}, node: { packageManagerOverrides: {} } }] }),
  );
  return dir;
}

async function openRunner(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Projetos' }).click();
  await page.getByTestId('project-item').getByRole('button', { name: 'Abrir' }).click();
  await expect(page.getByTestId('status-project')).toContainText('Amostra');
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+P');
  await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
  await page.keyboard.type('executor de testes');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('tests-panel')).toBeVisible();
}

test('xUnit real: falha com mensagem e link no stack; rodar só as falhas', async () => {
  test.setTimeout(240_000);
  const root = mkdtempSync(join(tmpdir(), 'xunit-'));
  execFileSync('dotnet', ['new', 'xunit', '-o', 'Amostra.Tests'], { cwd: root, stdio: 'ignore' });
  writeFileSync(
    join(root, 'Amostra.Tests', 'UnitTest1.cs'),
    'namespace Amostra.Tests;\npublic class UnitTest1\n{\n    [Fact] public void Passa() { Assert.Equal(1, 1); }\n    [Fact] public void Falha() { Assert.Equal(1, 2); }\n}\n',
  );
  const { page, close } = await launchApp({ userData: userData(root, { dotnet: true, node: false }) });
  try {
    await openRunner(page);
    await expect(page.getByLabel('Alvo de teste')).toContainText('.NET: Amostra.Tests/Amostra.Tests.csproj');
    await page.getByTestId('tests-panel').getByRole('button', { name: 'Rodar', exact: true }).click();
    await expect(page.getByTestId('tests-summary')).toHaveText('1 com falha, 1 aprovado(s), 0 ignorado(s)', { timeout: 180_000 });
    await expect(page.getByTestId('test-message')).toContainText('Assert.Equal() Failure');
    await expect(page.getByTestId('test-stack').getByRole('button')).toContainText('UnitTest1.cs:line 5');

    await page.getByRole('button', { name: 'Rodar só as falhas' }).click();
    await expect(page.getByTestId('tests-summary')).toHaveText('1 com falha, 0 aprovado(s), 0 ignorado(s)', { timeout: 120_000 });
    await expect(page.getByTestId('test-row')).toHaveCount(1);
  } finally {
    await close();
  }
});

test('Vitest real pelo script test do pacote', async () => {
  test.setTimeout(120_000);
  const root = resolve('tests/fixtures/vitest-sample');
  const { page, close } = await launchApp({ userData: userData(root, { dotnet: false, node: true }) });
  try {
    await openRunner(page);
    await expect(page.getByLabel('Alvo de teste')).toContainText('Node (vitest): raiz');
    await page.getByTestId('tests-panel').getByRole('button', { name: 'Rodar', exact: true }).click();
    await expect(page.getByTestId('tests-summary')).toHaveText('1 com falha, 1 aprovado(s), 0 ignorado(s)', { timeout: 90_000 });
    await expect(page.getByTestId('test-message')).toContainText('expected 1 to be 2');
  } finally {
    await close();
  }
});
