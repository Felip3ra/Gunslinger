import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const environments = [
  { id: 'dev', name: 'Dev', color: '#3fb950', confirm: false, variables: { ASPNETCORE_ENVIRONMENT: 'Development' } },
  { id: 'prod', name: 'Produção', color: '#f85149', confirm: true, variables: { ASPNETCORE_ENVIRONMENT: 'Production' } },
];

function userData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd', environments }));
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

async function ready(page: Page): Promise<void> {
  await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
}

async function palette(page: Page, query: string): Promise<void> {
  await ready(page);
  await page.keyboard.press('Control+P');
  await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
  await page.keyboard.type(query);
  await page.keyboard.press('Enter');
}

async function type(page: Page, command: string): Promise<void> {
  await ready(page);
  await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

test('nova aba com ambiente: variável no processo e marca na aba', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await palette(page, 'nova aba com ambiente dev');
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect(page.getByTestId('status-env')).toHaveText('● Dev');
    await expect(page.getByTestId('tab').nth(1).getByTestId('tab-env')).toBeVisible();
    await type(page, 'echo VAL=%ASPNETCORE_ENVIRONMENT%');
    await expect.poll(() => bufferText(page)).toMatch(/^VAL=Development$/m);
  } finally {
    await close();
  }
});

test('aplicar ambiente: pré-visualização; sensível pede confirmação e cancelar não envia', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await palette(page, 'aplicar ambiente produção');
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('Ambiente sensível: Produção');
    await expect(dialog).toContainText('set "ASPNETCORE_ENVIRONMENT=Production"');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('status-env')).toHaveCount(0);
    expect(await bufferText(page)).not.toContain('Production');

    await palette(page, 'aplicar ambiente dev');
    await page.getByTestId('dialog').getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByTestId('status-env')).toHaveText('● Dev');
    await type(page, 'echo VAL=%ASPNETCORE_ENVIRONMENT%');
    await expect.poll(() => bufferText(page)).toMatch(/^VAL=Development$/m);
  } finally {
    await close();
  }
});

test('configurações: criar ambiente grava no settings.json', async () => {
  const dir = userData();
  const { page, close } = await launchApp({ userData: dir });
  try {
    await page.keyboard.press('Control+,');
    await page.getByRole('tab', { name: 'Ambientes' }).click();
    await page.getByRole('button', { name: '+ Ambiente' }).click();
    const editor = page.getByTestId('environment-editor');
    await editor.getByLabel('Nome do ambiente').fill('Homologação');
    await editor.getByLabel('Variáveis do ambiente').fill('ASPNETCORE_ENVIRONMENT=Staging\nlinha errada');
    await editor.getByRole('button', { name: 'Salvar ambiente' }).click();
    await expect(editor).toContainText('Linha 2: use NOME=valor');
    await editor.getByLabel('Variáveis do ambiente').fill('ASPNETCORE_ENVIRONMENT=Staging');
    await editor.getByRole('button', { name: 'Salvar ambiente' }).click();
    await expect(page.getByTestId('environment-list')).toContainText('Homologação');
    const saved = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
    expect(saved.environments.at(-1)).toMatchObject({ name: 'Homologação', variables: { ASPNETCORE_ENVIRONMENT: 'Staging' } });
  } finally {
    await close();
  }
});
