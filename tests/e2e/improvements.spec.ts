import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

function userDataWith(settings: Record<string, unknown>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd', ...settings }));
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

function readState(dir: string): { lastSession: unknown[]; commandHistory: { command: string }[] } {
  try {
    return JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
  } catch {
    return { lastSession: [], commandHistory: [] };
  }
}

function pids(image: string): number[] {
  const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  return out
    .split('\n')
    .map((l) => /^"[^"]+","(\d+)"/.exec(l.trim())?.[1])
    .filter((p): p is string => !!p)
    .map(Number);
}

test('o botão de engrenagem abre as configurações; "Sobre" mostra a versão e que o dev não se atualiza', async () => {
  const { page, close } = await launchApp({ userData: userDataWith({}) });
  try {
    await page.getByTestId('open-settings').click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await page.getByRole('tab', { name: 'Sobre e atualizações' }).click();
    await expect(page.getByTestId('update-status')).toContainText('só no app instalado');
    await expect(page.getByTestId('update-check')).toBeDisabled();
  } finally {
    await close();
  }
});

test('reabre as abas da última sessão; com a opção desligada abre só uma', async () => {
  test.setTimeout(90_000);
  const dir = userDataWith({});
  let app = await launchApp({ userData: dir });
  try {
    await app.page.keyboard.press('Control+T');
    await expect(app.page.getByTestId('tab')).toHaveCount(2);
    await expect.poll(() => readState(dir).lastSession.length, { timeout: 10_000 }).toBe(2);
  } finally {
    await app.close();
  }
  // Fechar o app encerra as abas uma a uma: a sessão gravada continua com as duas.
  expect(readState(dir).lastSession.length).toBe(2);

  app = await launchApp({ userData: dir });
  try {
    await expect(app.page.getByTestId('tab')).toHaveCount(2);
  } finally {
    await app.close();
  }

  const settings = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ ...settings, session: { restore: false } }));
  app = await launchApp({ userData: dir });
  try {
    await expect(app.page.getByTestId('tab')).toHaveCount(1);
  } finally {
    await app.close();
  }
});

test('busca no histórico de comandos escreve o comando no terminal sem executar', async () => {
  test.setTimeout(60_000);
  const dir = userDataWith({});
  const { page, close } = await launchApp({ userData: dir });
  try {
    await expect.poll(() => bufferText(page)).toContain('>');
    await typeCommand(page, 'echo historico-gunslinger');
    await expect.poll(() => readState(dir).commandHistory.map((c) => c.command), { timeout: 10_000 }).toContain('echo historico-gunslinger');

    await page.keyboard.press('Control+Shift+H');
    await expect(page.getByLabel('Buscar no histórico de comandos')).toBeFocused();
    await page.keyboard.type('histgun');
    await expect(page.getByTestId('command-history-item').first()).toContainText('echo historico-gunslinger');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('command-history')).toHaveCount(0);
    // Escrito no prompt, sem Enter: a saída ainda aparece uma vez só.
    await expect.poll(async () => (await bufferText(page)).trimEnd()).toMatch(/>echo historico-gunslinger$/);
    expect((await bufferText(page)).match(/^historico-gunslinger$/gm)?.length).toBe(1);
  } finally {
    await close();
  }
});

test('fechar a aba pergunta sobre processos que saíram dela e os encerra', async () => {
  test.setTimeout(90_000);
  const { page, close } = await launchApp({ userData: userDataWith({}) });
  const before = new Set(pids('PING.EXE'));
  try {
    await page.keyboard.press('Control+T');
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect.poll(() => bufferText(page)).toContain('>');
    // O PowerShell intermediário sai logo; o ping fica órfão, fora da árvore da aba.
    await typeCommand(page, `powershell -NoProfile -Command "Start-Process ping -ArgumentList '-n','120','127.0.0.1' -WindowStyle Hidden"`);
    await expect.poll(() => pids('PING.EXE').filter((p) => !before.has(p)).length, { timeout: 20_000 }).toBe(1);
    const started = pids('PING.EXE').filter((p) => !before.has(p));

    await page.keyboard.press('Control+W');
    const dialog = page.getByTestId('dialog');
    await expect(dialog).toContainText('continuam rodando', { timeout: 20_000 });
    await expect(dialog).toContainText('PING');
    await dialog.getByRole('button', { name: 'Encerrar' }).click();
    await expect.poll(() => pids('PING.EXE').filter((p) => started.includes(p)).length, { timeout: 10_000 }).toBe(0);
    await expect(page.getByTestId('tab')).toHaveCount(1);
  } finally {
    for (const pid of pids('PING.EXE').filter((p) => !before.has(p))) {
      try {
        process.kill(pid);
      } catch {
        // já encerrado
      }
    }
    await close();
  }
});

test('variável criada no sistema (setx) recarrega o ambiente sozinho e marca a aba como desatualizada', async () => {
  test.setTimeout(60_000);
  const name = `GUNSLINGER_E2E_${process.pid}`;
  const { page, close } = await launchApp({ userData: userDataWith({}) });
  try {
    await expect.poll(() => bufferText(page)).toContain('>');
    await expect(page.getByTestId('env-outdated')).toHaveCount(0);
    // setx grava em HKCU\Environment e avisa as janelas (WM_SETTINGCHANGE).
    execFileSync('setx', [name, '1'], { stdio: 'ignore' });
    await expect(page.getByTestId('env-outdated')).toBeVisible({ timeout: 20_000 });
  } finally {
    // reg delete não avisa as janelas: a variável some sem novo recarregamento.
    try {
      execFileSync('reg', ['delete', 'HKCU\\Environment', '/v', name, '/f'], { stdio: 'ignore' });
    } catch {
      // não chegou a ser criada
    }
    await close();
  }
});

test('a versão do Node informada pelo shell (fnm) aparece na barra de status', async () => {
  const { page, close } = await launchApp({ userData: userDataWith({}) });
  try {
    await expect.poll(() => bufferText(page)).toContain('>');
    await typeCommand(page, `powershell -NoProfile -Command "[Console]::Write([char]27 + ']633;P;NodeVersion=v99.1.2' + [char]7)"`);
    await expect(page.getByTestId('status-node')).toHaveText('Node v99.1.2', { timeout: 15_000 });
  } finally {
    await close();
  }
});
