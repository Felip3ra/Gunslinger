import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const pane = (cwd: string, command: string | null) => ({ type: 'pane', pane: { profileId: 'builtin.cmd', cwd, projectId: null, command } });

function userData(withWorkspace = false): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  if (withWorkspace) {
    writeFileSync(
      join(dir, 'workspaces.json'),
      JSON.stringify({
        version: 1,
        workspaces: [
          {
            id: 'w1',
            name: 'Loja',
            tabs: [
              pane('C:\\Windows', 'echo WS_' + 'UM'),
              { type: 'split', direction: 'row', sizes: [0.5, 0.5], children: [pane('C:\\Users', 'echo WS_' + 'DOIS'), pane('C:\\', null)] },
            ],
          },
        ],
      }),
    );
  }
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

async function palette(page: Page, query: string): Promise<void> {
  await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
  await page.keyboard.press('Control+P');
  await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
  await page.keyboard.type(query);
  await page.keyboard.press('Enter');
}

test('salvar abas como workspace captura painéis, pastas e tamanhos', async () => {
  const dir = userData();
  const { page, close } = await launchApp({ userData: dir });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.type('cd /d C:\\Windows');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows');
    await page.keyboard.press('Alt+Shift+=');
    await expect(page.getByTestId('tab-panes')).toHaveText('▦2');
    await expect.poll(() => bufferText(page)).toMatch(/C:\\Windows>\s*$/);
    await page.keyboard.press('Control+T');
    await expect(page.getByTestId('tab')).toHaveCount(2);

    await palette(page, 'salvar abas como workspace');
    await page.getByLabel('Nome do workspace').fill('Diário');
    await page.getByTestId('workspace-save').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByTestId('workspace-save')).toHaveCount(0);
    const read = (): { name: string; tabs: { type: string; children: { pane: { cwd: string } }[] }[] } | undefined => {
      try {
        return JSON.parse(readFileSync(join(dir, 'workspaces.json'), 'utf8')).workspaces[0];
      } catch {
        return undefined;
      }
    };
    await expect.poll(() => read()?.name).toBe('Diário');
    const saved = read()!;
    expect(saved.name).toBe('Diário');
    expect(saved.tabs).toHaveLength(2);
    expect(saved.tabs[0]).toMatchObject({ type: 'split', direction: 'row', sizes: [0.5, 0.5] });
    expect(saved.tabs[0]!.children.map((c) => c.pane.cwd)).toEqual(['C:\\Windows', 'C:\\Windows']);
  } finally {
    await close();
  }
});

test('abrir workspace: confirma comandos, abre abas e painéis e executa cada comando no seu painel', async () => {
  const { page, close } = await launchApp({ userData: userData(true) });
  try {
    await palette(page, 'abrir workspace loja');
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('echo WS_UM');
    await expect(dialog).toContainText('echo WS_DOIS');
    await dialog.getByRole('button', { name: 'Abrir e executar' }).click();
    await expect(page.getByTestId('tab')).toHaveCount(3);
    await expect(page.getByTestId('tab').nth(2).getByTestId('tab-panes')).toHaveText('▦2');
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows');
    await expect.poll(() => bufferText(page)).toMatch(/^WS_UM$/m);
    await page.getByTestId('tab').nth(2).click();
    await expect.poll(() => bufferText(page)).toMatch(/^WS_DOIS$/m);
  } finally {
    await close();
  }
});

test('abrir sem executar não envia comandos; editar muda o comando salvo', async () => {
  const dir = userData(true);
  const { page, close } = await launchApp({ userData: dir });
  try {
    await palette(page, 'abrir workspace loja');
    await page.getByTestId('dialog').getByRole('button', { name: 'Abrir sem executar' }).click();
    await expect(page.getByTestId('tab')).toHaveCount(3);
    await expect.poll(() => bufferText(page)).toMatch(/C:\\Windows>\s*$/);
    expect(await bufferText(page)).not.toContain('WS_UM');

    await palette(page, 'gerenciar workspaces');
    await page.getByTestId('workspace-item').getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Comando do painel 1.1').fill('echo ALTERADO');
    await page.getByTestId('workspace-editor').getByRole('button', { name: 'Salvar' }).click();
    await expect(page.getByTestId('workspaces-list')).toBeVisible();
    const ws = JSON.parse(readFileSync(join(dir, 'workspaces.json'), 'utf8')).workspaces[0];
    expect(ws.tabs[0].pane.command).toBe('echo ALTERADO');
  } finally {
    await close();
  }
});
