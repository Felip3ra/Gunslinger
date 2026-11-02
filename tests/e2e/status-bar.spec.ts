import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'repo-'));
  const git = (...args: string[]): void => void execFileSync('git', args, { cwd: dir });
  git('init', '-b', 'main');
  git('config', 'user.email', 'e2e@example.com');
  git('config', 'user.name', 'e2e');
  writeFileSync(join(dir, 'a.txt'), 'um');
  writeFileSync(join(dir, 'package.json'), '{}');
  git('add', '.');
  git('commit', '-m', 'inicial');
  return dir;
}

async function type(page: Page, command: string): Promise<void> {
  await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

test('Git e versões na barra de status, atualizados por pasta, comando e alterações externas', async () => {
  const repo = makeRepo();
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  const { page, close } = await launchApp({ userData: dir });
  try {
    await type(page, `cd /d "${repo}"`);
    await expect(page.getByTestId('status-git')).toHaveText('⎇ main', { timeout: 5000 });
    await expect(page.getByTestId('status-git').locator('.dirty-dot')).toHaveCount(0);
    await expect(page.getByTestId('status-node')).toHaveText(/^Node v\d+\./);

    // Alteração feita por outro programa.
    writeFileSync(join(repo, 'a.txt'), 'dois');
    await expect(page.getByTestId('status-git').locator('.dirty-dot')).toHaveCount(1, { timeout: 3000 });
    await expect(page.getByTestId('tab').first().locator('.tab-dirty')).toHaveCount(1);

    // Troca de branch no terminal.
    await type(page, 'git switch -c develop');
    await expect(page.getByTestId('status-git')).toHaveText(/develop/, { timeout: 3000 });

    // Fora de repositório e sem package.json acima.
    await type(page, 'cd /d C:\\Windows');
    await expect(page.getByTestId('status-git')).toHaveCount(0, { timeout: 3000 });
    await expect(page.getByTestId('status-node')).toHaveCount(0);
  } finally {
    await close();
  }
});
