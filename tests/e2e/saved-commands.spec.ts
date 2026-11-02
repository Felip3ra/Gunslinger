import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

interface Seed {
  id: string;
  name: string;
  command: string;
  category?: string;
  targetProfileId?: string | null;
  cwd?: string | null;
  variables?: Record<string, { label?: string; default?: string; options?: string[] }>;
}

function userData(commands: Seed[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd' }));
  writeFileSync(
    join(dir, 'commands.json'),
    JSON.stringify({
      version: 1,
      commands: commands.map((c) => ({ description: '', category: '', targetProfileId: null, cwd: null, projectId: null, variables: {}, ...c })),
    }),
  );
  return dir;
}

const bufferText = (page: Page): Promise<string> =>
  page.evaluate(() => (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug.bufferText());

const row = (page: Page, name: string) => page.getByTestId('command-row').filter({ hasText: name });

async function ready(page: Page): Promise<void> {
  await expect.poll(() => bufferText(page)).toMatch(/>\s*$/m);
}

test('criar comando pelo formulário: aparece na categoria e é gravado', async () => {
  const dir = userData([]);
  const { page, close } = await launchApp({ userData: dir });
  try {
    await page.getByRole('button', { name: 'Novo comando' }).click();
    const form = page.getByTestId('command-form');
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(form.getByText('Obrigatório').first()).toBeVisible();
    await form.getByLabel('Nome *').fill('Status curto');
    await form.locator('textarea').first().fill('git status -sb');
    await form.getByLabel('Categoria').fill('Git');
    await form.getByRole('button', { name: 'Salvar' }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByTestId('category').filter({ hasText: 'Git' })).toContainText('Status curto');
    const saved = JSON.parse(readFileSync(join(dir, 'commands.json'), 'utf8'));
    expect(saved.commands[0]).toMatchObject({ name: 'Status curto', command: 'git status -sb', category: 'Git' });
  } finally {
    await close();
  }
});

test('selecionar não executa; Executar e Inserir enviam por ação explícita', async () => {
  const { page, close } = await launchApp({ userData: userData([{ id: 'c1', name: 'Eco', command: 'echo SAIDA_%COMPUTERNAME%' }]) });
  try {
    await ready(page);
    await row(page, 'Eco').click();
    await page.waitForTimeout(500);
    expect(await bufferText(page)).not.toContain('SAIDA_');

    await row(page, 'Eco').getByRole('button', { name: 'Inserir Eco' }).click();
    await expect.poll(() => bufferText(page)).toContain('echo SAIDA_%COMPUTERNAME%');
    expect(await bufferText(page)).not.toMatch(/SAIDA_[A-Z0-9-]+\s*$/m);
    await page.keyboard.press('Control+C');

    await row(page, 'Eco').getByRole('button', { name: 'Executar Eco' }).click();
    await expect.poll(() => bufferText(page)).toMatch(/^SAIDA_[A-Za-z0-9-]+$/m);
  } finally {
    await close();
  }
});

test('variáveis: seletor de opções, pré-visualização e Esc sem envio', async () => {
  const { page, close } = await launchApp({
    userData: userData([
      { id: 'c1', name: 'Ação', command: 'echo ACAO={acao} {{literal}}', variables: { acao: { options: ['subir', 'descer'] } } },
    ]),
  });
  try {
    await ready(page);
    await row(page, 'Ação').getByRole('button', { name: 'Executar Ação' }).click();
    const dialog = page.getByTestId('variables-dialog');
    await expect(dialog.getByRole('button', { name: 'Executar' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(await bufferText(page)).not.toContain('ACAO=');

    await row(page, 'Ação').getByRole('button', { name: 'Executar Ação' }).click();
    await dialog.locator('select').selectOption('descer');
    await expect(page.getByTestId('variables-preview')).toHaveText('echo ACAO=descer {literal}');
    await dialog.getByRole('button', { name: 'Executar' }).click();
    await expect.poll(() => bufferText(page)).toMatch(/^ACAO=descer \{literal\}$/m);
  } finally {
    await close();
  }
});

test('pasta de execução: pergunta e troca de pasta com o comando do shell', async () => {
  const { page, close } = await launchApp({ userData: userData([{ id: 'c1', name: 'Onde', command: 'cd', cwd: 'C:\\Windows' }]) });
  try {
    await ready(page);
    await row(page, 'Onde').getByRole('button', { name: 'Executar Onde' }).click();
    await page.getByTestId('dialog').getByRole('button', { name: 'Mudar pasta' }).click();
    await expect(page.getByTestId('status-cwd')).toHaveText('C:\\Windows');
    await expect.poll(() => bufferText(page)).toContain('cd /d "C:\\Windows"');
  } finally {
    await close();
  }
});

test('shell de destino diferente abre aba nova; destino ausente pede confirmação', async () => {
  const { page, close } = await launchApp({
    userData: userData([
      { id: 'c1', name: 'No Bash', command: 'echo "BASH=$BASH_VERSION"', targetProfileId: 'builtin.gitbash' },
      { id: 'c2', name: 'Perdido', command: 'echo PERDIDO_OK', targetProfileId: 'nao-existe' },
    ]),
  });
  try {
    await ready(page);
    await expect(row(page, 'Perdido').locator('.warn-icon')).toBeVisible();
    await row(page, 'No Bash').getByRole('button', { name: 'Executar No Bash' }).click();
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect.poll(() => bufferText(page), { timeout: 20_000 }).toMatch(/^BASH=\d/m);

    await page.getByTestId('tab').first().click();
    await row(page, 'Perdido').getByRole('button', { name: 'Executar Perdido' }).click();
    await expect(page.getByTestId('dialog')).toContainText('Shell de destino não encontrado');
    await page.getByTestId('dialog').getByRole('button', { name: /^Usar / }).click();
    await expect.poll(() => bufferText(page)).toMatch(/^PERDIDO_OK$/m);
  } finally {
    await close();
  }
});

test('aba ocupada: oferece abrir nova aba', async () => {
  const { page, close } = await launchApp({ userData: userData([{ id: 'c1', name: 'Eco', command: 'echo LIVRE_OK' }]) });
  try {
    await ready(page);
    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.type('ping -t 127.0.0.1');
    await page.keyboard.press('Enter');
    await expect.poll(() => bufferText(page)).toMatch(/127\.0\.0\.1.*(tempo|time)/i);
    await row(page, 'Eco').getByRole('button', { name: 'Executar Eco' }).click();
    await expect(page.getByTestId('dialog')).toContainText('Terminal ocupado');
    await page.getByTestId('dialog').getByRole('button', { name: 'Abrir nova aba' }).click();
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect.poll(() => bufferText(page)).toMatch(/^LIVRE_OK$/m);
    await page.getByTestId('tab').first().click();
    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.press('Control+C');
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
  } finally {
    await close();
  }
});

test('excluir e renomear categoria', async () => {
  const dir = userData([
    { id: 'c1', name: 'A', command: 'echo a', category: 'EF' },
    { id: 'c2', name: 'B', command: 'echo b', category: 'EF' },
  ]);
  const { page, close } = await launchApp({ userData: dir });
  try {
    await page.getByRole('button', { name: 'Renomear EF' }).click();
    await page.locator('.modal input').fill('Entity Framework');
    await page.getByRole('button', { name: 'Renomear', exact: true }).click();
    await expect(page.getByTestId('category').filter({ hasText: 'Entity Framework' }).getByTestId('command-row')).toHaveCount(2);

    await row(page, 'A').hover();
    await row(page, 'A').getByRole('button', { name: 'Excluir A' }).click();
    await page.getByTestId('dialog').getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByTestId('command-row')).toHaveCount(1);
    const saved = JSON.parse(readFileSync(join(dir, 'commands.json'), 'utf8'));
    expect(saved.commands.map((c: { id: string; category: string }) => [c.id, c.category])).toEqual([['c2', 'Entity Framework']]);
  } finally {
    await close();
  }
});
