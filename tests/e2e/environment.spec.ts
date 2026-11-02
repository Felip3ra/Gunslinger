import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

test('Recarregar ambiente: abas abertas ficam desatualizadas e reiniciam na mesma pasta', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  const { page, close } = await launchApp({ userData: dir });
  try {
    await expect.poll(() => bufferText(page)).toContain('>');
    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.type('cd /d C:\\Windows');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows');
    await expect(page.getByTestId('env-outdated')).toHaveCount(0);

    // Leitura real do registro (sem alterar nada no sistema).
    const result = await page.evaluate(() =>
      (globalThis as unknown as { gunslinger: { invoke(c: string): Promise<unknown> } }).gunslinger.invoke('env:reload'),
    );
    expect(result).toEqual({ envGeneration: 1 });
    await expect(page.getByTestId('env-outdated')).toBeVisible();

    await page.getByTestId('env-outdated').click();
    await expect(page.getByTestId('env-outdated')).toHaveCount(0);
    await expect.poll(() => bufferText(page)).toContain('C:\\Windows>');
  } finally {
    await close();
  }
});
