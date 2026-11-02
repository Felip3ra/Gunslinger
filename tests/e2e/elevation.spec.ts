import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const SYSTEM32 = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32');

function userData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  return dir;
}

/** Pasta com um gsudo.exe falso (cópia de outro executável do sistema), colocada na frente do PATH. */
function fakeGsudo(copyOf: string): Record<string, string> {
  const dir = mkdtempSync(join(tmpdir(), 'fake-gsudo-'));
  copyFileSync(join(SYSTEM32, copyOf), join(dir, 'gsudo.exe'));
  return { PATH: `${dir};${process.env['PATH'] ?? ''}`, Path: `${dir};${process.env['Path'] ?? process.env['PATH'] ?? ''}` };
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

test('sem sudo inline nem gsudo: janela externa e aviso de como habilitar o sudo', async () => {
  const { app, page, close } = await launchApp({ userData: userData() });
  try {
    // Intercepta a janela externa (evita o UAC real no teste).
    await app.evaluate(({ ipcMain }) => {
      const g = globalThis as Record<string, unknown>;
      g['__external'] = [];
      ipcMain.removeHandler('elevation:openExternal');
      ipcMain.handle('elevation:openExternal', (_e, arg) => {
        (g['__external'] as unknown[]).push(arg);
        return { ok: true, value: { ok: true } };
      });
    });
    await page.getByTestId('new-tab-menu-button').click();
    await page.getByRole('menuitem', { name: 'Prompt de Comando como administrador' }).click();
    await expect(page.getByTestId('notice').last()).toContainText('janela separada');
    await expect(page.getByTestId('notice').last()).toContainText('sudo config --enable normal');
    expect(await app.evaluate(() => (globalThis as Record<string, unknown>)['__external'])).toEqual([
      expect.objectContaining({ profileId: 'builtin.cmd' }),
    ]);
    await expect(page.getByTestId('tab')).toHaveCount(1);
  } finally {
    await close();
  }
});

test('com gsudo: aba elevada dentro do app, marcada e com integração', async () => {
  const { page, close } = await launchApp({ userData: userData(), env: fakeGsudo('cmd.exe') });
  try {
    await page.keyboard.press('Control+P');
    await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
    await page.keyboard.type('nova aba como administrador prompt');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect(page.getByTestId('tab').nth(1).getByTestId('tab-shield')).toBeVisible();
    await expect(page.getByTestId('status-admin')).toHaveText(/Administrador/);
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.type('cd /d C:\\Windows');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows');
  } finally {
    await close();
  }
});

test('UAC recusado: a aba mostra "Elevação cancelada"', async () => {
  const { page, close } = await launchApp({ userData: userData(), env: fakeGsudo('whoami.exe') });
  try {
    await page.getByTestId('new-tab-menu-button').click();
    await page.getByRole('menuitem', { name: 'Prompt de Comando como administrador' }).click();
    await expect(page.getByTestId('tab-error')).toContainText('Elevação cancelada');
  } finally {
    await close();
  }
});
