import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function userData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

async function type(page: Page, command: string): Promise<void> {
  await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

test('dividir à direita: uma aba, dois painéis independentes, foco e barra de status', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await type(page, 'cd /d C:\\Windows');
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows');

    await page.keyboard.press('Alt+Shift+=');
    await expect(page.getByTestId('tab')).toHaveCount(1);
    await expect(page.getByTestId('tab-panes')).toHaveText('▦2');
    await expect(page.locator('.terminal-group.active [data-testid="terminal-pane"], .terminal-group.active [data-testid="active-terminal"]')).toHaveCount(2);
    // O painel novo herda a pasta e recebe o foco.
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows');
    await expect.poll(() => bufferText(page)).toMatch(/C:\\Windows>\s*$/);
    await type(page, 'cd /d C:\\Users');
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Users');

    // Foco no outro painel (atalho e clique): a barra de status segue o painel ativo.
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows');
    await page.locator('[data-testid="terminal-pane"]').click();
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Users');
  } finally {
    await close();
  }
});

test('fechar painel: o vizinho ocupa a aba; abaixo + redimensionar pela divisória', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.keyboard.press('Alt+Shift+-');
    await expect(page.getByTestId('divider')).toHaveCount(1);
    const panes = page.locator('.terminal-group.active .terminal-pane');
    const before = (await panes.first().boundingBox())!.height;
    const divider = (await page.getByTestId('divider').boundingBox())!;
    await page.mouse.move(divider.x + divider.width / 2, divider.y + 2);
    await page.mouse.down();
    await page.mouse.move(divider.x + divider.width / 2, divider.y + 120, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => (await panes.first().boundingBox())!.height).toBeGreaterThan(before + 60);

    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.keyboard.press('Control+W');
    await expect(page.getByTestId('divider')).toHaveCount(0);
    await expect(page.getByTestId('tab')).toHaveCount(1);
    await expect(page.getByTestId('tab-panes')).toHaveCount(0);

    // Ctrl+Tab navega entre abas (grupos), não entre painéis.
    await page.keyboard.press('Alt+Shift+=');
    await page.keyboard.press('Control+T');
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await page.keyboard.press('Control+Tab');
    await expect(page.getByTestId('tab').first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('tab-panes')).toHaveText('▦2');
  } finally {
    await close();
  }
});
