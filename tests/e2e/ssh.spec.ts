import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { utils } from 'ssh2';
import { expect, test, type Page } from '@playwright/test';
import { hostKeyBlob, startTestServer, type TestServer } from '../../src/main/ssh/testing/ssh-test-server';
import { launchApp } from './helpers';

const PASSWORD = 'segredo';

function userData(port: number, extra: { knownHosts?: unknown[]; workspaces?: unknown[] } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-ssh-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd', ssh: { agent: 'off', keepaliveSec: 0, connectTimeoutSec: 10 } }));
  writeFileSync(
    join(dir, 'hosts.json'),
    JSON.stringify({ version: 1, groups: [], hosts: [{ id: 'vm', name: 'VM teste', address: '127.0.0.1', port, username: 'deploy', groupId: null, color: null, tags: ['e2e'] }] }),
  );
  if (extra.knownHosts) writeFileSync(join(dir, 'known_hosts.json'), JSON.stringify({ version: 1, entries: extra.knownHosts }));
  if (extra.workspaces) writeFileSync(join(dir, 'workspaces.json'), JSON.stringify({ version: 1, workspaces: extra.workspaces }));
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

const prompt = (page: Page) => page.getByTestId('ssh-prompt');

/** Enter na linha do host (o duplo clique no centro acertaria os botões de ação da linha). */
async function connectFromSidebar(page: Page): Promise<void> {
  const row = page.getByTestId('host-row').filter({ hasText: 'VM teste' });
  await row.focus();
  await row.press('Enter');
}

async function answerPassword(page: Page, save = false): Promise<void> {
  await expect(prompt(page)).toHaveAttribute('data-kind', 'password');
  await page.getByTestId('ssh-prompt-input').fill(PASSWORD);
  if (save) await page.getByTestId('ssh-save-secret').check();
  await prompt(page).getByRole('button', { name: 'Continuar' }).click();
}

async function trustHost(page: Page): Promise<void> {
  await expect(prompt(page)).toHaveAttribute('data-kind', 'hostKey-new');
  await expect(page.getByTestId('ssh-fingerprint')).toContainText('SHA256:');
  await prompt(page).getByRole('button', { name: 'Confiar e conectar' }).click();
}

let server: TestServer;
test.beforeEach(async () => {
  server = await startTestServer({ password: PASSWORD });
});
test.afterEach(async () => {
  await server.close();
});

test('host novo pede o fingerprint, a senha salva vale na próxima conexão e o shell remoto funciona', async () => {
  const { page, close } = await launchApp({ userData: userData(server.port) });
  try {
    await connectFromSidebar(page);
    await trustHost(page);
    await answerPassword(page, true);
    await expect.poll(() => bufferText(page)).toContain('bem-vindo');
    await expect(page.getByTestId('status-ssh')).toContainText(`deploy@127.0.0.1:${server.port}`);

    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.type('oi');
    await page.keyboard.press('Enter');
    await expect.poll(() => bufferText(page)).toContain('você disse: oi');

    // Fecha a aba SSH (a conexão cai com o último uso) e conecta de novo: nada é perguntado.
    await page.keyboard.press('Control+W');
    await expect(page.getByTestId('tab')).toHaveCount(1);
    const attempts = server.authAttempts.length;
    await connectFromSidebar(page);
    await expect.poll(() => bufferText(page)).toContain('bem-vindo');
    await expect(prompt(page)).toHaveCount(0);
    expect(server.authAttempts.length).toBeGreaterThan(attempts);
  } finally {
    await close();
  }
});

test('chave do servidor alterada bloqueia a conexão sem enviar credencial', async () => {
  const other = hostKeyBlob(utils.generateKeyPairSync('ed25519').private);
  const known = [{ host: '127.0.0.1', port: server.port, ...other, addedAt: 1, revoked: false, source: 'app' }];
  const { page, close } = await launchApp({ userData: userData(server.port, { knownHosts: known }) });
  try {
    await connectFromSidebar(page);
    await expect(prompt(page)).toHaveAttribute('data-kind', 'hostKey-changed');
    await prompt(page).getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByTestId('ssh-error')).toContainText('A chave do servidor mudou');
    expect(server.authAttempts).toEqual([]);
  } finally {
    await close();
  }
});

test('workspace com dois painéis SSH: uma pergunta só e o comando inicial depois de conectar', async () => {
  const pane = { profileId: null, cwd: null, projectId: null, command: 'echo oi', hostId: 'vm' };
  const workspaces = [{ id: 'w1', name: 'Homolog', tabs: [{ type: 'split', direction: 'row', sizes: [0.5, 0.5], children: [{ type: 'pane', pane }, { type: 'pane', pane }] }] }];
  const { page, close } = await launchApp({ userData: userData(server.port, { workspaces }) });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.keyboard.press('Control+P');
    await page.keyboard.type('Abrir workspace: Homolog');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Abrir e executar' }).click();
    await trustHost(page);
    await answerPassword(page);
    await expect.poll(() => server.received.filter((l) => l === 'echo oi').length).toBe(2);
    await expect(prompt(page)).toHaveCount(0);
    expect(server.authAttempts.filter((m) => m === 'password')).toHaveLength(1);
  } finally {
    await close();
  }
});

test('queda da conexão mostra "Reconectar", que abre uma sessão nova no mesmo painel', async () => {
  const { page, close } = await launchApp({ userData: userData(server.port) });
  try {
    await connectFromSidebar(page);
    await trustHost(page);
    await answerPassword(page);
    await expect.poll(() => bufferText(page)).toContain('bem-vindo');
    server.dropAll();
    await expect(page.getByTestId('ssh-closed')).toBeVisible();
    await page.getByTestId('ssh-closed').getByRole('button', { name: 'Reconectar' }).click();
    await answerPassword(page);
    await expect.poll(async () => (await bufferText(page)).split('bem-vindo').length - 1).toBe(2);
    await expect(page.getByTestId('tab')).toHaveCount(2);
  } finally {
    await close();
  }
});

test('reabrir o app deixa a aba SSH desconectada, sem conectar sozinho', async () => {
  const dir = userData(server.port);
  try {
    const first = await launchApp({ userData: dir });
    await connectFromSidebar(first.page);
    await trustHost(first.page);
    await answerPassword(first.page);
    await expect.poll(() => bufferText(first.page)).toContain('bem-vindo');
    await expect
      .poll(() => {
        try {
          return JSON.stringify(JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')).lastSession);
        } catch {
          return '';
        }
      })
      .toContain('"hostId":"vm"');
    await first.close();

    const attempts = server.authAttempts.length;
    const second = await launchApp({ userData: dir });
    try {
      await second.page.getByTestId('tab').filter({ hasText: 'VM teste' }).click();
      await expect(second.page.getByTestId('ssh-disconnected')).toBeVisible();
      await second.page.waitForTimeout(1000);
      expect(server.authAttempts.length).toBe(attempts);
    } finally {
      await second.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
