import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

// Shells nativos do macOS e do Linux. No Windows, os equivalentes estão em terminal.spec.ts.
test.skip(process.platform === 'win32', 'somente macOS e Linux');

function has(command: string): boolean {
  try {
    execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function userData(settings: Record<string, unknown> = {}): string {
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

/** Pasta pessoal isolada: os arquivos de perfil do teste não se misturam com os da máquina. */
function home(files: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-home-'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

test('detecta os shells instalados e usa o shell de login como padrão', async () => {
  test.skip(!has('bash'), 'bash não instalado');
  const bash = execFileSync('sh', ['-c', 'command -v bash'], { encoding: 'utf8' }).trim();
  const { page, close } = await launchApp({ userData: userData(), env: { SHELL: bash, HOME: home() } });
  try {
    await page.getByTestId('new-tab-menu-button').click();
    await expect(page.getByTestId('new-tab-menu')).toContainText('bash');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('statusbar')).toContainText('bash');
  } finally {
    await close();
  }
});

test('bash: carrega o perfil do usuário, executa comando e rastreia a pasta atual', async () => {
  test.skip(!has('bash'), 'bash não instalado');
  const env = { SHELL: '/bin/bash', HOME: home({ '.bashrc': 'export GS_RC=bashrc_ok\nPS1="gs$ "\n' }) };
  const { page, close } = await launchApp({ userData: userData({ defaultProfile: 'builtin.bash' }), env });
  try {
    await expect.poll(() => bufferText(page)).toContain('gs$');
    await typeCommand(page, 'echo "RC=$GS_RC"');
    await expect.poll(() => bufferText(page)).toContain('RC=bashrc_ok');
    await typeCommand(page, 'cd /usr');
    await expect(page.getByTestId('status-cwd')).toHaveText('/usr');
  } finally {
    await close();
  }
});

test('zsh: carrega o .zshrc do usuário, devolve o ZDOTDIR e rastreia a pasta atual', async () => {
  test.skip(!has('zsh'), 'zsh não instalado');
  const dir = home({ '.zshrc': 'export GS_RC=zshrc_ok\nPS1="gs%% "\n', '.zshenv': 'export GS_ENV=zshenv_ok\n' });
  const { page, close } = await launchApp({ userData: userData({ defaultProfile: 'builtin.zsh' }), env: { SHELL: '/bin/bash', HOME: dir } });
  try {
    await expect.poll(() => bufferText(page)).toContain('gs%');
    await typeCommand(page, 'echo "RC=$GS_RC ENV=$GS_ENV ZDOT=[${ZDOTDIR:-vazio}]"');
    await expect.poll(() => bufferText(page)).toContain('RC=zshrc_ok ENV=zshenv_ok ZDOT=[vazio]');
    await typeCommand(page, 'cd /usr');
    await expect(page.getByTestId('status-cwd')).toHaveText('/usr');
  } finally {
    await close();
  }
});

test('fish abre sem integração e executa comandos', async () => {
  test.skip(!has('fish'), 'fish não instalado');
  const { page, close } = await launchApp({ userData: userData({ defaultProfile: 'builtin.fish' }), env: { SHELL: '/bin/bash', HOME: home() } });
  try {
    await typeCommand(page, 'echo FISH_(math 20 + 22)');
    await expect.poll(() => bufferText(page)).toContain('FISH_42');
  } finally {
    await close();
  }
});

test('portas em escuta: o servidor iniciado numa aba aparece com a aba dona', async () => {
  test.skip(!has('bash') || !(has('lsof') || has('ss')), 'bash e lsof (ou ss) são necessários');
  const env = { SHELL: '/bin/bash', HOME: home({ '.bashrc': 'PS1="gs$ "\n' }) };
  const { page, close } = await launchApp({ userData: userData({ defaultProfile: 'builtin.bash' }), env });
  try {
    await expect.poll(() => bufferText(page)).toContain('gs$');
    await typeCommand(page, `node -e "require('http').createServer().listen(5299, '127.0.0.1', () => console.log('OUVINDO'))"`);
    await expect.poll(() => bufferText(page), { timeout: 20_000 }).toMatch(/^OUVINDO$/m);
    await page.keyboard.press('Control+P');
    await page.keyboard.type('docker e portas');
    await page.keyboard.press('Enter');
    await page.getByLabel('Filtrar portas').fill('5299');
    const row = page.getByTestId('port-row').first();
    await expect(row).toContainText('5299', { timeout: 15_000 });
    await expect(row).toContainText('Aba 1');
  } finally {
    await close();
  }
});

test('fechar uma aba ocupada encerra o processo que ela iniciou', async () => {
  test.skip(!has('bash'), 'bash não instalado');
  const env = { SHELL: '/bin/bash', HOME: home({ '.bashrc': 'PS1="gs$ "\n' }) };
  const { page, close } = await launchApp({ userData: userData({ defaultProfile: 'builtin.bash' }), env });
  const running = (): number => {
    try {
      return execFileSync('pgrep', ['-f', 'sleep 4242'], { encoding: 'utf8' }).split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  };
  try {
    await expect.poll(() => bufferText(page)).toContain('gs$');
    await typeCommand(page, 'sleep 4242');
    await expect.poll(running).toBeGreaterThan(0);
    await page.keyboard.press('Control+T');
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await page.getByTestId('tab').first().click();
    await page.keyboard.press('Control+W');
    await expect(page.getByTestId('dialog')).toBeVisible();
    await page.getByTestId('dialog').getByRole('button', { name: 'Fechar aba' }).click();
    await expect(page.getByTestId('tab')).toHaveCount(1);
    await expect.poll(running, { timeout: 15_000 }).toBe(0);
  } finally {
    await close();
  }
});
