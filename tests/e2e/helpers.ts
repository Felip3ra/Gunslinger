import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userData: string;
  close: () => Promise<void>;
}

export async function launchApp(
  options: { userData?: string; env?: Record<string, string>; args?: string[] } = {},
): Promise<LaunchedApp> {
  const userData = options.userData ?? mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
  // O VS Code define esta variável, o que faria o Electron rodar como Node puro.
  delete env['ELECTRON_RUN_AS_NODE'];
  env['GUNSLINGER_USER_DATA'] = userData;
  Object.assign(env, options.env);

  const app = await electron.launch({ args: ['out/main/index.js', ...(options.args ?? [])], env });
  const page = await app.firstWindow();
  await page.waitForSelector('[data-testid="app-root"]');
  return {
    app,
    page,
    userData,
    close: async () => {
      // Um diálogo nativo de confirmação (abas ocupadas) travaria o fechamento do teste.
      await app
        .evaluate(({ dialog }) => {
          dialog.showMessageBox = (async () => ({ response: 0, checkboxChecked: false })) as never;
        })
        .catch(() => undefined);
      await app.close();
      if (!options.userData) rmSync(userData, { recursive: true, force: true });
    },
  };
}
