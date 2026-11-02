import { mkdtempSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const PORT = 51_992;

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(true));
  });
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

async function openPanel(page: Page): Promise<void> {
  await page.keyboard.press('Control+P');
  await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
  await page.keyboard.type('docker e portas');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('docker-ports-panel')).toBeVisible();
}

test('porta aberta por uma aba aparece com a aba dona e é liberada ao encerrar o processo', async () => {
  test.setTimeout(90_000);
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  const { page, close } = await launchApp({ userData: dir });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.type(`node -e "require('http').createServer().listen(${PORT}, '127.0.0.1', () => console.log('PORTA_'+'ABERTA'))"`);
    await page.keyboard.press('Enter');
    await expect.poll(() => bufferText(page), { timeout: 20_000 }).toMatch(/^PORTA_ABERTA$/m);

    await openPanel(page);
    await page.getByLabel('Filtrar portas').fill(String(PORT));
    const row = page.getByTestId('port-row');
    await expect(row).toHaveCount(1, { timeout: 15_000 });
    await expect(row).toContainText('node.exe');
    await expect(row.getByRole('button', { name: 'Aba 1' })).toBeVisible();

    await row.getByRole('button', { name: 'Encerrar processo' }).click();
    await page.getByRole('dialog', { name: 'Encerrar processo' }).getByRole('button', { name: 'Encerrar processo' }).click();
    await expect.poll(() => portIsFree(PORT), { timeout: 15_000 }).toBe(true);
    await expect(row).toHaveCount(0, { timeout: 10_000 });
  } finally {
    await close();
  }
});

test('containers: lista ou mensagem clara quando o Docker não está disponível', async () => {
  const { page, close } = await launchApp();
  try {
    await openPanel(page);
    const unavailable = page.getByTestId('docker-unavailable');
    const rows = page.getByTestId('container-row');
    const empty = page.getByText('Nenhum container.');
    await expect(unavailable.or(rows.first()).or(empty)).toBeVisible({ timeout: 40_000 });
    if (await unavailable.isVisible()) await expect(unavailable).toHaveText(/Docker/);
  } finally {
    await close();
  }
});
