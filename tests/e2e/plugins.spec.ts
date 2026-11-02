import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function userData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  const plugin = (folder: string, manifest: unknown): void => {
    mkdirSync(join(dir, 'plugins', folder), { recursive: true });
    writeFileSync(join(dir, 'plugins', folder, 'plugin.json'), JSON.stringify(manifest));
  };
  plugin('kit-loja', {
    id: 'kit-loja',
    name: 'Kit Loja',
    version: '1.2.0',
    description: 'Atalhos do time',
    contributes: {
      commands: [{ id: 'eco', name: 'Eco do kit', command: 'echo KIT_LOJA_OK' }],
      workspaces: [{ id: 'dupla', name: 'Dupla', tabs: [{ type: 'pane', pane: {} }, { type: 'pane', pane: {} }] }],
    },
  });
  plugin('mal', { id: 'mal', name: 'Mal', version: '1', contributes: { scripts: ['index.js'] } });
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

async function palette(page: Page, query: string): Promise<void> {
  await page.keyboard.press('Control+P');
  await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
  await page.keyboard.type(query);
}

test('plugin declarativo: comando e workspace aparecem, manifesto inválido mostra o erro e desativar remove', async () => {
  test.setTimeout(60_000);
  const dir = userData();
  const { page, close } = await launchApp({ userData: dir });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);

    // Comando do plugin no painel lateral, sem editar/excluir; executar é ação explícita.
    const row = page.getByTestId('command-row').filter({ hasText: 'Eco do kit' });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Editar Eco do kit' })).toHaveCount(0);
    await row.getByRole('button', { name: 'Executar Eco do kit' }).click();
    await expect.poll(() => bufferText(page)).toMatch(/^KIT_LOJA_OK$/m);
    expect(JSON.parse(readFileSync(join(dir, 'commands.json'), 'utf8')).commands).toEqual([]);

    // Workspace do plugin pela paleta.
    await palette(page, 'abrir workspace dupla');
    await expect(page.getByTestId('palette-item').first()).toContainText('Dupla (Kit Loja)');
    await page.keyboard.press('Escape');

    await palette(page, 'plugins');
    await page.keyboard.press('Enter');
    const items = page.getByTestId('plugin-item');
    await expect(items).toHaveCount(2);
    await expect(items.filter({ hasText: 'Kit Loja' })).toContainText('1 comando(s), 1 workspace(s)');
    await expect(items.filter({ hasText: 'Mal' })).toContainText('chave não suportada: scripts');

    // Controlado: só desmarca quando o main confirma (evento plugins:changed).
    await page.getByLabel('Ativar Kit Loja').click();
    await expect(page.getByLabel('Ativar Kit Loja')).not.toBeChecked();
    await expect(row).toHaveCount(0);
    expect(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).plugins.disabled).toEqual(['kit-loja']);
  } finally {
    await close();
  }
});
