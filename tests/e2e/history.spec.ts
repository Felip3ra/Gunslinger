import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test('comando excluído volta ao restaurar o snapshot; o estado anterior fica como "Antes de restaurar"', async () => {
  test.setTimeout(60_000);
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  writeFileSync(join(dir, 'commands.json'), JSON.stringify({ version: 1, commands: [{ id: 'c1', name: 'Build', command: 'dotnet build' }] }));
  const { page, close } = await launchApp({ userData: dir });
  try {
    await page.keyboard.press('Control+P');
    await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
    await page.keyboard.type('historico de dados');
    await page.keyboard.press('Enter');
    const items = page.getByTestId('history-item');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('1 comando(s)');

    // Exclusão por edição externa: o watcher recarrega e o histórico captura depois do debounce.
    writeFileSync(join(dir, 'commands.json'), JSON.stringify({ version: 1, commands: [] }));
    await expect(items).toHaveCount(2, { timeout: 15_000 });
    await expect(items.first()).toContainText('0 comando(s)');

    await items.filter({ hasText: '1 comando(s)' }).getByRole('button', { name: 'Restaurar' }).click();
    await page.getByTestId('dialog').getByRole('button', { name: 'Restaurar' }).click();
    await expect.poll(() => JSON.parse(readFileSync(join(dir, 'commands.json'), 'utf8')).commands.map((c: { name: string }) => c.name)).toEqual(['Build']);
    await expect(items.first()).toContainText('Antes de restaurar');
    await expect(items.first()).toContainText('0 comando(s)');
  } finally {
    await close();
  }
});
