import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const settings = (dir: string): { appearance: { ui?: Record<string, string>; palette?: string[] } } =>
  JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));

const cssVar = (page: Page, name: string): Promise<string> =>
  page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

test('seletor de cor: hexadecimal muda a interface, RGB grava o hexadecimal e a paleta guarda a cor', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  const { page, close } = await launchApp({ userData: dir });
  try {
    await page.keyboard.press('Control+,');
    await expect(page.getByTestId('settings')).toBeVisible();

    // Hexadecimal curto + Enter aplica e a variável CSS muda na hora.
    await page.getByRole('button', { name: 'Interface: Destaque' }).click();
    const picker = page.getByTestId('color-picker');
    await expect(picker).toBeVisible();
    await picker.getByLabel('Hexadecimal ou RGB').fill('#F80');
    await picker.getByLabel('Hexadecimal ou RGB').press('Enter');
    await expect(picker).toHaveCount(0);
    await expect.poll(() => cssVar(page, '--accent')).toBe('#ff8800');
    expect(settings(dir).appearance.ui?.['accent']).toBe('#ff8800');

    // Valor inválido não aplica.
    await page.getByRole('button', { name: 'Interface: Fundo' }).click();
    await picker.getByLabel('Hexadecimal ou RGB').fill('azul');
    await expect(picker.getByRole('button', { name: 'Aplicar' })).toBeDisabled();
    // Esc descarta sem fechar as configurações.
    await page.keyboard.press('Escape');
    await expect(picker).toHaveCount(0);
    await expect(page.getByTestId('settings')).toBeVisible();

    // RGB: grava o hexadecimal equivalente; salvar na paleta.
    await page.getByRole('button', { name: 'Terminal: Cursor' }).click();
    await picker.getByLabel('R', { exact: true }).fill('18');
    await picker.getByLabel('G', { exact: true }).fill('52');
    await picker.getByLabel('B', { exact: true }).fill('86');
    await expect(picker.getByLabel('Hexadecimal ou RGB')).toHaveValue('#123456');
    await picker.getByRole('button', { name: '+ Salvar cor' }).click();
    await expect(picker.getByTestId('color-palette').getByRole('button').first()).toHaveAttribute('title', '#123456');
    await picker.getByRole('button', { name: 'Aplicar' }).click();
    await expect.poll(() => readFileSync(join(dir, 'settings.json'), 'utf8')).toContain('"cursor": "#123456"');
    expect(settings(dir).appearance.palette?.[0]).toBe('#123456');
  } finally {
    await close();
  }
});
