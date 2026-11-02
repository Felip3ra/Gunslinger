import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

type Debug = { bufferText(): string; dims(): { cols: number; rows: number; viewportY: number } };
const debug = <T,>(page: Page, fn: (d: Debug) => T): Promise<T> =>
  page.evaluate((src) => {
    const d = (globalThis as unknown as { __gunslingerDebug: Debug }).__gunslingerDebug;
    return (new Function('d', `return (${src})(d)`) as (d: Debug) => T)(d);
  }, fn.toString());
const bufferText = (page: Page): Promise<string> => debug(page, (d) => d.bufferText());

function userData(settings: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd', ...settings }));
  return dir;
}

async function type(page: Page, command: string): Promise<void> {
  await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

/** Ctrl+clique no texto `needle` da última linha da saída que o contém. */
async function ctrlClickText(page: Page, needle: string, lineFilter: (l: string) => boolean): Promise<void> {
  const lines = (await bufferText(page)).split('\n');
  const index = lines.map((l, i) => [l, i] as const).filter(([l]) => lineFilter(l)).pop()![1];
  const col = lines[index]!.indexOf(needle);
  const dims = await debug(page, (d) => d.dims());
  const box = (await page.locator('[data-testid="active-terminal"] .xterm-screen').boundingBox())!;
  const x = box.x + ((col + 1.5) * box.width) / dims.cols;
  const y = box.y + ((index - dims.viewportY + 0.5) * box.height) / dims.rows;
  await page.mouse.move(x, y);
  await page.waitForTimeout(300);
  await page.keyboard.down('Control');
  await page.mouse.click(x, y);
  await page.keyboard.up('Control');
}

test('URLs: Ctrl+clique abre localhost; esquemas não-http são recusados', async () => {
  const { app, page, close } = await launchApp({ userData: userData() });
  try {
    await app.evaluate(({ shell }) => {
      (globalThis as Record<string, unknown>)['__opened'] = [];
      shell.openExternal = (async (url: string) => void ((globalThis as Record<string, unknown>)['__opened'] as string[]).push(url)) as never;
    });
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await type(page, 'echo Local: http://localhost:5173/');
    await expect.poll(() => bufferText(page)).toMatch(/^Local: http/m);
    await ctrlClickText(page, 'http://localhost', (l) => l.startsWith('Local: http'));
    await expect.poll(() => app.evaluate(() => (globalThis as Record<string, unknown>)['__opened'])).toEqual(['http://localhost:5173/']);

    const refused = await page.evaluate(() =>
      (globalThis as unknown as { gunslinger: { invoke(c: string, a: unknown): Promise<unknown> } }).gunslinger.invoke('shell:openExternal', {
        url: 'javascript:alert(1)',
      }),
    );
    expect(refused).toMatchObject({ ok: false });
  } finally {
    await close();
  }
});

test('caminho com (linha,coluna) abre no editor configurado, relativo à pasta da aba', async () => {
  const project = mkdtempSync(join(tmpdir(), 'src-'));
  writeFileSync(join(project, 'Program.cs'), 'class P {}\n');
  const capture = join(project, 'editor-args.txt');
  const fakeEditor = join(project, 'fake-editor.js');
  writeFileSync(fakeEditor, `require('fs').writeFileSync(${JSON.stringify(capture)}, process.argv.slice(2).join('|'))`);
  const { page, close } = await launchApp({ userData: userData({ editor: { command: 'node', args: [fakeEditor, '{file}:{line}:{column}'] } }) });
  try {
    await type(page, `cd /d "${project}"`);
    await expect(page.getByTestId('status-cwd')).toHaveText(project);
    await type(page, 'echo Program.cs(42,13): error CS0103');
    await expect.poll(() => bufferText(page)).toMatch(/^Program\.cs\(42,13\): error/m);
    await ctrlClickText(page, 'Program.cs', (l) => l.startsWith('Program.cs(42,13)'));
    await expect.poll(() => existsSync(capture), { timeout: 5000 }).toBe(true);
    expect(readFileSync(capture, 'utf8')).toBe(`${project}\\Program.cs:42:13`);
  } finally {
    await close();
  }
});

test('busca: Ctrl+F conta ocorrências e trata regex inválida', async () => {
  const { page, close } = await launchApp({ userData: userData() });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await type(page, 'echo ZQXW & echo ZQXW & echo ZQXW');
    await expect.poll(() => bufferText(page)).toMatch(/^ZQXW\s*$/m);
    await page.keyboard.press('Control+F');
    await expect(page.getByLabel('Buscar no terminal')).toBeFocused();
    await page.keyboard.type('ZQXW');
    await expect(page.getByTestId('search-count')).toHaveText(/^\d+ de 6$/);
    await page.getByRole('button', { name: '.*' }).click();
    await page.getByLabel('Buscar no terminal').fill('[abc');
    await expect(page.getByTestId('search-count')).toHaveText('Expressão inválida');
    await page.getByLabel('Buscar no terminal').press('Escape');
    await expect(page.getByTestId('searchbar')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('notificação de comando demorado com a janela fora de foco; clique ativa a aba', async () => {
  const { app, page, close } = await launchApp({ userData: userData({ notifications: { longCommand: { enabled: true, thresholdSeconds: 1 } } }) });
  try {
    await app.evaluate(({ BrowserWindow, Notification }) => {
      const g = globalThis as Record<string, unknown>;
      g['__notes'] = [];
      Notification.prototype.show = function (this: unknown) {
        (g['__notes'] as unknown[]).push(this);
      };
      BrowserWindow.getAllWindows()[0]!.isFocused = () => false;
    });
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await type(page, 'ping -n 3 127.0.0.1 >nul');
    await page.keyboard.press('Control+T');
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect
      .poll(() => app.evaluate(() => ((globalThis as Record<string, unknown>)['__notes'] as { title: string }[]).map((n) => n.title)), { timeout: 10_000 })
      .toEqual([expect.stringMatching(/^ping -n 3 127\.0\.0\.1 >nul concluído em \d+ s$/)]);

    await app.evaluate(() => ((globalThis as Record<string, unknown>)['__notes'] as { emit(e: string): void }[])[0]!.emit('click'));
    await expect(page.getByTestId('tab').first()).toHaveAttribute('aria-selected', 'true');

    // Comando curto não notifica.
    await type(page, 'echo rapido');
    await page.waitForTimeout(1500);
    expect(await app.evaluate(() => ((globalThis as Record<string, unknown>)['__notes'] as unknown[]).length)).toBe(1);
  } finally {
    await close();
  }
});
