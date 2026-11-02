import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function userData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }, null, 2));
  return dir;
}

const fontSizes = (page: Page): Promise<number[]> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { fontSizes(): number[] } }).__gunslingerDebug.fontSizes());

test('fonte muda em todas as abas sem reiniciar (pela tela e pelo arquivo)', async () => {
  const dir = userData();
  const { page, close } = await launchApp({ userData: dir });
  try {
    await page.keyboard.press('Control+T');
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await page.keyboard.press('Control+,');
    await page.getByLabel('Tamanho da fonte').fill('16');
    await page.getByLabel('Tamanho da fonte').press('Enter');
    await expect.poll(() => fontSizes(page)).toEqual([16, 16]);
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).appearance.fontSize).toBe(16);

    // Edição externa do settings.json.
    const file = join(dir, 'settings.json');
    writeFileSync(file, readFileSync(file, 'utf8').replace('"fontSize": 16', '"fontSize": 18'));
    await expect.poll(() => fontSizes(page), { timeout: 3000 }).toEqual([18, 18]);
  } finally {
    await close();
  }
});

test('mudar atalho: a combinação nova abre aba e a antiga volta para o shell; aviso de readline', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await page.keyboard.press('Control+,');
    await page.getByRole('tab', { name: 'Atalhos' }).click();
    await page.getByRole('button', { name: 'Alterar atalho de Nova aba' }).click();
    await page.keyboard.press('Control+R');
    await expect(page.getByTestId('pending-shortcut')).toContainText('readline');
    await page.getByTestId('pending-shortcut').getByRole('button', { name: 'Cancelar' }).click();

    await page.getByRole('button', { name: 'Alterar atalho de Nova aba' }).click();
    await page.keyboard.press('Control+Shift+T');
    await page.getByTestId('pending-shortcut').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByTestId('shortcuts')).toContainText('Ctrl+Shift+T');
    await page.getByRole('button', { name: 'Fechar configurações' }).click();

    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.press('Control+T');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('tab')).toHaveCount(1);
    await page.keyboard.press('Control+Shift+T');
    await expect(page.getByTestId('tab')).toHaveCount(2);
  } finally {
    await close();
  }
});

test('perfis: customizado valida o executável; detectado pode ser ocultado', async () => {
  const dir = userData();
  const { page, close } = await launchApp({ userData: dir });
  try {
    await page.keyboard.press('Control+,');
    await page.getByRole('tab', { name: 'Perfis de shell' }).click();
    await page.getByRole('button', { name: '+ Perfil customizado' }).click();
    const editor = page.getByTestId('profile-editor');
    await editor.getByLabel('Nome do perfil').fill('Node REPL');
    await editor.getByLabel('Executável').fill('C:\\nao\\existe.exe');
    await editor.getByRole('button', { name: 'Salvar perfil' }).click();
    await expect(editor).toContainText('Executável não encontrado');
    await editor.getByLabel('Executável').fill('node.exe');
    await editor.getByRole('button', { name: 'Salvar perfil' }).click();
    await expect(page.getByTestId('profile-list')).toContainText('Node REPL');

    await page.getByLabel('Ocultar Windows PowerShell').click();
    await expect(page.getByLabel('Ocultar Windows PowerShell')).toBeChecked();
    await page.getByRole('button', { name: 'Fechar configurações' }).click();
    await page.getByTestId('new-tab-menu-button').click();
    const menu = page.getByTestId('new-tab-menu');
    await expect(menu).toContainText('Node REPL');
    await expect(menu).not.toContainText('Windows PowerShell');
    const saved = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
    expect(saved.profiles.overrides['builtin.powershell']).toEqual({ hidden: true });
  } finally {
    await close();
  }
});
