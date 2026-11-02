import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const EXE = resolve('dist/win-unpacked/Gunslinger.exe');

// Roda só depois de `npm run dist` (app empacotado, scripts de integração em resources/).
test.skip(!existsSync(EXE), 'app empacotado não encontrado (rode npm run dist)');

test('app empacotado abre um terminal com integração ativa', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.powershell' }));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== 'ELECTRON_RUN_AS_NODE') env[k] = v;
  env['GUNSLINGER_USER_DATA'] = dir;
  const app = await electron.launch({ executablePath: EXE, env });
  try {
    const page = await app.firstWindow();
    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus({ timeout: 15_000 });
    await page.waitForTimeout(3000);
    await page.keyboard.type('Set-Location C:\\Windows');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows', { timeout: 15_000 });
  } finally {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
    });
    await app.close();
  }
});
