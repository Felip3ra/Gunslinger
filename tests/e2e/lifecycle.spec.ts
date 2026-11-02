import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function userDataWith(settings: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, ...settings }));
  return dir;
}

type Debug = { bufferText(): string };
const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: Debug }).__gunslingerDebug.bufferText());

async function typeCommand(page: Page, command: string): Promise<void> {
  await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

/** A porta está livre quando nenhuma conexão é aceita nela. */
function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: 'localhost' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => resolve(true));
  });
}

function countProcesses(image: string): number {
  const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/NH'], { encoding: 'utf8' });
  return out.split('\n').filter((l) => l.toLowerCase().startsWith(image.toLowerCase())).length;
}

test('Ctrl+C interrompe o programa sem fechar a aba', async () => {
  const { page, close } = await launchApp({ userData: userDataWith({ defaultProfile: 'builtin.cmd' }) });
  try {
    await expect.poll(() => bufferText(page)).toContain('>');
    await typeCommand(page, 'ping -t 127.0.0.1');
    await expect.poll(() => bufferText(page)).toMatch(/127\.0\.0\.1.*(tempo|time)/i);
    await page.keyboard.press('Control+C');
    await expect.poll(() => bufferText(page)).toMatch(/(Control-C|Ctrl\+C|\^C)[\s\S]*>\s*$/);
    await expect(page.getByTestId('tab')).toHaveCount(1);
  } finally {
    await close();
  }
});

test('exit 0 fecha a aba; outro código mostra Reiniciar/Fechar', async () => {
  const { page, close } = await launchApp({ userData: userDataWith({ defaultProfile: 'builtin.cmd' }) });
  try {
    await page.keyboard.press('Control+T');
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect.poll(() => bufferText(page)).toContain('>');
    await typeCommand(page, 'exit 3');
    await expect(page.getByTestId('tab-exited')).toContainText('código 3');
    await page.getByTestId('tab-exited').getByRole('button', { name: 'Reiniciar' }).click();
    await expect(page.getByTestId('tab-exited')).toHaveCount(0);
    await expect.poll(() => bufferText(page)).toContain('>');
    await typeCommand(page, 'exit');
    await expect(page.getByTestId('tab')).toHaveCount(1);
  } finally {
    await close();
  }
});

test('redimensionar a janela repassa colunas ao shell', async () => {
  const { app, page, close } = await launchApp({ userData: userDataWith({ defaultProfile: 'builtin.cmd' }) });
  try {
    await expect.poll(() => bufferText(page)).toContain('>');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(800, 600));
    await page.waitForTimeout(400);
    await typeCommand(page, 'mode con');
    const narrow = Number(/(Colunas|Columns):\s*(\d+)/i.exec(await bufferText(page).then((t) => t))?.[2] ?? 0);
    await expect.poll(async () => /(Colunas|Columns):\s*(\d+)/i.exec(await bufferText(page))?.[2]).toBeTruthy();
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setSize(1400, 700));
    await page.waitForTimeout(400);
    await typeCommand(page, 'cls & mode con');
    await expect
      .poll(async () => Number(/(Colunas|Columns):\s*(\d+)/i.exec(await bufferText(page))?.[2] ?? 0))
      .toBeGreaterThan(narrow || 100);
  } finally {
    await close();
  }
});

test('programas interativos: tela alternativa e redesenho com \\r (Git Bash)', async () => {
  const { page, close } = await launchApp({ userData: userDataWith({ defaultProfile: 'builtin.gitbash' }) });
  try {
    await expect.poll(() => bufferText(page), { timeout: 20_000 }).toContain('$');
    await typeCommand(page, 'echo MARCA_ANTES');
    await typeCommand(page, 'seq 1 500 | less');
    await expect.poll(() => bufferText(page)).toContain('\n10\n');
    expect(await bufferText(page)).not.toContain('MARCA_ANTES');
    await page.keyboard.press('q');
    await expect.poll(() => bufferText(page)).toContain('MARCA_ANTES');

    await typeCommand(page, 'for i in 1 2 3; do printf "\\rprogresso %s/3" $i; sleep 0.2; done; echo');
    await expect.poll(() => bufferText(page)).toContain('progresso 3/3');
    const text = await bufferText(page);
    expect(text).not.toContain('progresso 1/3');
  } finally {
    await close();
  }
});

test('fechar o app com servidor rodando encerra a árvore e libera a porta', async () => {
  const port = 51_873;
  const { app, page, close } = await launchApp({ userData: userDataWith({ defaultProfile: 'builtin.cmd' }) });
  await expect.poll(() => bufferText(page)).toContain('>');
  const nodesBefore = countProcesses('node.exe');
  // Servidor iniciado por um .cmd (como npm run dev): cmd → cmd /c → node.
  await typeCommand(page, `cmd /c node -e "require('http').createServer().listen(${port}, () => console.log('ESCU' + 'TANDO'))"`);
  await expect.poll(() => bufferText(page), { timeout: 15_000 }).toContain('ESCUTANDO');
  expect(await portIsFree(port)).toBe(false);

  // Responde "Fechar mesmo assim" no diálogo nativo de confirmação.
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
  });
  await close();
  await expect.poll(() => portIsFree(port), { timeout: 10_000 }).toBe(true);
  expect(countProcesses('node.exe')).toBeLessThanOrEqual(nodesBefore);
});
