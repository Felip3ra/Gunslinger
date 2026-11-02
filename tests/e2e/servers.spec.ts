import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const DOTNET_PORT = 51_990;
const NODE_PORT = 51_991;

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

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

async function type(page: Page, command: string): Promise<void> {
  await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

test('fechar o app com npm run dev e dotnet watch rodando libera as portas', async () => {
  test.setTimeout(240_000);
  const root = mkdtempSync(join(tmpdir(), 'servers-'));
  // API ASP.NET mínima (template do SDK, sem pacotes NuGet).
  execFileSync('dotnet', ['new', 'web', '-o', 'api', '--no-restore'], { cwd: root, stdio: 'ignore' });
  execFileSync('dotnet', ['build', '-v', 'q'], { cwd: join(root, 'api'), stdio: 'ignore' });
  // Front-end com script "dev" (npm.cmd → node), como um servidor do Vite.
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ name: 'web', scripts: { dev: `node -e "require('http').createServer().listen(${NODE_PORT}, () => console.log('NODE_'+'PRONTO'))"` } }),
  );

  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  const { page, close } = await launchApp({ userData: dir });
  let closed = false;
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await type(page, `cd /d "${join(root, 'api')}" && set ASPNETCORE_URLS=http://localhost:${DOTNET_PORT}&& dotnet watch run --non-interactive --no-launch-profile`);
    await expect.poll(() => portIsFree(DOTNET_PORT), { timeout: 120_000, intervals: [1000] }).toBe(false);

    await page.keyboard.press('Control+T');
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await type(page, `cd /d "${root}" && npm run dev`);
    await expect.poll(() => bufferText(page), { timeout: 30_000 }).toMatch(/^NODE_PRONTO$/m);
    expect(await portIsFree(NODE_PORT)).toBe(false);

    await close(); // confirma "Fechar mesmo assim" e encerra as árvores
    closed = true;
    await expect.poll(() => portIsFree(DOTNET_PORT), { timeout: 15_000 }).toBe(true);
    await expect.poll(() => portIsFree(NODE_PORT), { timeout: 15_000 }).toBe(true);
  } finally {
    if (!closed) await close();
  }
});
