import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const cmd = (id: string, name: string, category: string) => ({
  id, name, command: `echo ${name.replace(/\s/g, '_')}_IMPORTADO`, description: '', category, targetProfileId: null, cwd: null, projectId: null, variables: {},
});

function userData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  writeFileSync(join(dir, 'commands.json'), JSON.stringify({ version: 1, commands: [cmd('g1', 'Status', 'Git'), cmd('e1', 'Nova migration', 'EF')] }));
  return dir;
}

async function stubDialogs(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as never;
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as never;
  }, path);
}

async function runAction(page: Page, query: string): Promise<void> {
  // A primeira aba abre de forma assíncrona e pega o foco: espera o prompt antes.
  await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
  await page.keyboard.press('Control+P');
  await expect(page.getByLabel('Buscar na paleta')).toBeFocused();
  await page.keyboard.type(query);
  await page.keyboard.press('Enter');
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

test('exportar só a categoria escolhida', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'export-')), 'saida.json');
  const { app, page, close } = await launchApp({ userData: userData() });
  try {
    await stubDialogs(app, out);
    await runAction(page, 'exportar');
    const dialog = page.getByTestId('export-dialog');
    await dialog.getByLabel(/^Git/).uncheck();
    await dialog.getByRole('button', { name: 'Exportar…' }).click();
    await expect(dialog).toHaveCount(0);
    const file = JSON.parse(readFileSync(out, 'utf8'));
    expect(file).toMatchObject({ format: 'gunslinger-export', version: 1 });
    expect(file.commands.map((c: { id: string }) => c.id)).toEqual(['e1']);
  } finally {
    await close();
  }
});

test('arquivo inválido é recusado sem alterar nada', async () => {
  const dir = userData();
  const bad = join(mkdtempSync(join(tmpdir(), 'import-')), 'ruim.json');
  writeFileSync(bad, JSON.stringify({ qualquer: 'coisa' }));
  const before = readFileSync(join(dir, 'commands.json'), 'utf8');
  const { app, page, close } = await launchApp({ userData: dir });
  try {
    await stubDialogs(app, bad);
    await runAction(page, 'importar');
    await expect(page.getByTestId('notice')).toContainText('Arquivo de importação inválido');
    await expect(page.getByTestId('import-dialog')).toHaveCount(0);
    expect(readFileSync(join(dir, 'commands.json'), 'utf8')).toBe(before);
  } finally {
    await close();
  }
});

test('prévia com conflito: cancelar não grava; manter ambos renomeia; nada é executado', async () => {
  const dir = userData();
  const source = join(mkdtempSync(join(tmpdir(), 'import-')), 'equipe.json');
  writeFileSync(
    source,
    JSON.stringify({ format: 'gunslinger-export', version: 1, exportedAt: 'x', commands: [cmd('x1', 'Nova migration', 'EF'), cmd('x2', 'Docker up', 'Docker')] }),
  );
  const { app, page, close } = await launchApp({ userData: dir });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await stubDialogs(app, source);
    await runAction(page, 'importar');
    const dialog = page.getByTestId('import-dialog');
    await expect(dialog.getByTestId('import-item')).toHaveCount(2);
    await expect(dialog).toContainText('echo Nova_migration_IMPORTADO');
    await expect(dialog).toContainText('Conflita com "Nova migration"');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    expect(JSON.parse(readFileSync(join(dir, 'commands.json'), 'utf8')).commands).toHaveLength(2);

    await runAction(page, 'importar');
    await page.getByTestId('import-dialog').getByRole('button', { name: 'Importar' }).click();
    await expect(page.getByTestId('notice').last()).toContainText('2 adicionado(s)');
    const names = JSON.parse(readFileSync(join(dir, 'commands.json'), 'utf8')).commands.map((c: { name: string }) => c.name);
    expect(names).toEqual(['Status', 'Nova migration', 'Nova migration (2)', 'Docker up']);
    expect(await bufferText(page)).not.toContain('IMPORTADO');
  } finally {
    await close();
  }
});
