import { spawn } from 'node:child_process';
import { expect, test } from '@playwright/test';
import electronPath from 'electron';
import { launchApp } from './helpers';

test('segunda execução encerra e restaura a janela existente', async () => {
  const first = await launchApp();
  try {
    await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.minimize());

    const env: NodeJS.ProcessEnv = { ...process.env, GUNSLINGER_USER_DATA: first.userData };
    delete env['ELECTRON_RUN_AS_NODE'];
    const second = spawn(electronPath as unknown as string, ['out/main/index.js'], { env, stdio: 'ignore' });
    const exitCode = await new Promise<number | null>((resolve) => second.on('exit', resolve));
    expect(exitCode).toBe(0);

    await expect
      .poll(() => first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isMinimized()))
      .toBe(false);
    expect(first.app.windows()).toHaveLength(1);
  } finally {
    await first.close();
  }
});
