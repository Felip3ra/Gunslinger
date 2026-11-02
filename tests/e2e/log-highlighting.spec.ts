import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function userData(extra: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd', ...extra }));
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());
const decorations = (page: Page) => page.locator('.terminal-group.active .xterm-decoration');

async function type(page: Page, command: string): Promise<void> {
  await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
  await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

test('erro destacado sem alterar o texto; desligar para a saída nova', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await type(page, 'echo Program.cs(4,1): erro CS1002 & echo tudo certo');
    await expect.poll(() => bufferText(page)).toMatch(/^tudo certo$/m);
    // A linha digitada e a linha de saída têm "erro": duas decorations.
    await expect(decorations(page)).toHaveCount(2);
    expect(await bufferText(page)).toMatch(/^Program\.cs\(4,1\): erro CS1002\s*$/m);

    await page.keyboard.press('Control+P');
    await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
    await page.keyboard.type('alternar destaque de logs');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('notice').last()).toContainText('desligado');
    await type(page, 'echo outro erro');
    await expect.poll(() => bufferText(page)).toMatch(/^outro erro$/m);
    await page.waitForTimeout(300);
    await expect(decorations(page)).toHaveCount(2);
  } finally {
    await close();
  }
});

test('regra personalizada no settings.json; regra inválida gera aviso', async () => {
  const rules = [
    { pattern: '([', ignoreCase: true },
    { pattern: 'PEDIDO-\\d+', ignoreCase: false, foreground: '#58a6ff' },
  ];
  const { page, close } = await launchApp({ userData: userData({ logHighlight: { enabled: true, rules } }) });
  try {
    await expect(page.getByTestId('notice').first()).toContainText('Regra de destaque ignorada');
    await type(page, 'echo PEDIDO-42 criado');
    await expect.poll(() => bufferText(page)).toMatch(/^PEDIDO-42 criado$/m);
    await expect(decorations(page)).toHaveCount(2);
  } finally {
    await close();
  }
});
