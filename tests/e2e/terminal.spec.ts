import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function userDataWith(settings: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, ...settings }));
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

async function typeCommand(page: Page, command: string): Promise<void> {
  await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

function countProcesses(image: string): number {
  const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/NH'], { encoding: 'utf8' });
  return out.split('\n').filter((l) => l.toLowerCase().startsWith(image.toLowerCase())).length;
}

test.describe('terminal', () => {
  test('CMD: executa comando e rastreia a pasta atual pela integração', async () => {
    const { page, close } = await launchApp({ userData: userDataWith({ defaultProfile: 'builtin.cmd' }) });
    try {
      await expect.poll(() => bufferText(page)).toContain('>');
      await typeCommand(page, 'echo GS_OK_%COMPUTERNAME%');
      await expect.poll(() => bufferText(page)).toMatch(/GS_OK_\w+/);
      await typeCommand(page, 'cd /d C:\\Windows');
      await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows');
    } finally {
      await close();
    }
  });

  test('atalhos de abas: Ctrl+T, Ctrl+Tab circular e Ctrl+W', async () => {
    const { page, close } = await launchApp({ userData: userDataWith({ defaultProfile: 'builtin.cmd' }) });
    try {
      await expect(page.getByTestId('tab')).toHaveCount(1);
      await page.keyboard.press('Control+T');
      await page.keyboard.press('Control+T');
      await expect(page.getByTestId('tab')).toHaveCount(3);
      await expect(page.getByTestId('tab').nth(2)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Control+Tab');
      await expect(page.getByTestId('tab').nth(0)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Control+Shift+Tab');
      await expect(page.getByTestId('tab').nth(2)).toHaveAttribute('aria-selected', 'true');
      await page.keyboard.press('Control+W');
      await expect(page.getByTestId('tab')).toHaveCount(2);
    } finally {
      await close();
    }
  });

  test('PowerShell 5.1: integração funciona com a política de execução padrão', async () => {
    const { page, close } = await launchApp({ userData: userDataWith({ defaultProfile: 'builtin.powershell' }) });
    try {
      await expect.poll(() => bufferText(page), { timeout: 20_000 }).toContain('PS ');
      await typeCommand(page, 'Set-Location C:\\Windows\\System32');
      await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows\\System32', { timeout: 10_000 });
      expect(await bufferText(page)).not.toMatch(/cannot be loaded|não pode ser carregado/i);
    } finally {
      await close();
    }
  });

  test('Git Bash: rcfile emula o login e informa a pasta em formato Windows', async () => {
    const { page, close } = await launchApp({ userData: userDataWith({ defaultProfile: 'builtin.gitbash' }) });
    try {
      await expect.poll(() => bufferText(page), { timeout: 20_000 }).toContain('$');
      await typeCommand(page, 'cd /c/Windows && echo "MSYS=$MSYSTEM"');
      await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows', { timeout: 10_000 });
      await expect.poll(() => bufferText(page)).toContain('MSYS=MINGW64');
    } finally {
      await close();
    }
  });

  test('fechar aba ocupada pede confirmação e encerra a árvore de processos', async () => {
    const { page, close } = await launchApp({ userData: userDataWith({ defaultProfile: 'builtin.cmd' }) });
    try {
      await expect.poll(() => bufferText(page)).toContain('>');
      const before = countProcesses('PING.EXE');
      await typeCommand(page, 'ping -t 127.0.0.1');
      await expect.poll(() => countProcesses('PING.EXE')).toBe(before + 1);
      await page.keyboard.press('Control+T');
      await expect(page.getByTestId('tab')).toHaveCount(2);
      await page.getByTestId('tab').first().click();
      await page.keyboard.press('Control+W');
      await expect(page.getByTestId('dialog')).toBeVisible();
      await page.getByTestId('dialog').getByRole('button', { name: 'Fechar aba' }).click();
      await expect(page.getByTestId('tab')).toHaveCount(1);
      await expect.poll(() => countProcesses('PING.EXE'), { timeout: 10_000 }).toBe(before);
    } finally {
      await close();
    }
  });

  test('banner de configuração inválida não impede a abertura', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
    writeFileSync(join(dir, 'settings.json'), '{ "version": 1, "defaultProfile": "builtin.cmd", }');
    const { page, close } = await launchApp({ userData: dir });
    try {
      await expect(page.getByTestId('config-banner')).toContainText('settings.json (linha 1)');
      await expect(page.getByTestId('tab')).toHaveCount(1);
    } finally {
      await close();
    }
  });
});
