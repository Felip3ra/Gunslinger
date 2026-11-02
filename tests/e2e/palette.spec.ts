import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function userData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  const cmd = (id: string, name: string, command: string, category = '') => ({
    id, name, command, description: '', category, targetProfileId: null, cwd: null, projectId: null, variables: {},
  });
  writeFileSync(
    join(dir, 'commands.json'),
    JSON.stringify({
      version: 1,
      commands: [cmd('c1', 'Atualizar banco de produção', 'echo PROD_OK', 'EF'), cmd('c2', 'Trocar branch', 'git checkout {branch}', 'Git')],
    }),
  );
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

test('Ctrl+P abre com foco na busca; Esc fecha e devolve o foco ao terminal', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.keyboard.press('Control+P');
    await expect(page.getByTestId('palette')).toBeVisible();
    await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('palette')).toHaveCount(0);
    await expect(page.locator('[data-testid="active-terminal"] .xterm-helper-textarea')).toBeFocused();
    expect(await bufferText(page)).not.toContain('\x10');
  } finally {
    await close();
  }
});

test('busca sem acentos, Enter executa; sem resultado não faz nada', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.keyboard.press('Control+P');
    await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
    await page.keyboard.type('producao');
    await expect(page.getByTestId('palette-item').first()).toContainText('Atualizar banco de produção');
    await expect(page.getByTestId('palette-item').first().locator('mark').first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect.poll(() => bufferText(page)).toMatch(/^PROD_OK$/m);

    await page.keyboard.press('Control+P');
    await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
    await page.keyboard.type('xyzxyzxyz');
    await expect(page.getByTestId('palette')).toContainText('Nenhum resultado');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('palette')).toBeVisible();
  } finally {
    await close();
  }
});

test('comando com variável abre o diálogo sem enviar; EF sem projeto aparece desativado', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.keyboard.press('Control+P');
    await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
    await page.keyboard.type('trocar branch');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('palette')).toHaveCount(0);
    await expect(page.getByTestId('variables-dialog')).toBeVisible();
    expect(await bufferText(page)).not.toContain('git checkout');
    await page.keyboard.press('Escape');

    await page.keyboard.press('Control+P');
    await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
    await page.keyboard.type('migration');
    await expect(page.getByTestId('palette-item').filter({ hasText: 'Nova migration' })).toContainText('Abra um projeto .NET para usar');
  } finally {
    await close();
  }
});

test('ações do app: abrir aba de um perfil pela paleta', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.keyboard.press('Control+P');
    await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
    await page.keyboard.type('nova aba git bash');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect(page.getByTestId('tab').nth(1)).toContainText(/Git Bash|bash/i);
  } finally {
    await close();
  }
});
