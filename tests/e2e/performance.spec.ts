import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { launchApp } from './helpers';

const dbg = <T>(page: Page, call: string, arg?: string): Promise<T> =>
  page.evaluate(
    ([c, a]) => {
      const d = (globalThis as unknown as { __gunslingerDebug: Record<string, (x?: string) => unknown> }).__gunslingerDebug;
      return d[c!]!(a) as T;
    },
    [call, arg] as const,
  );
const bufferText = (page: Page): Promise<string> => dbg<string>(page, 'bufferText');

function userData(profile: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'gunslinger-e2e-'));
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ version: 1, defaultProfile: profile }));
  return dir;
}

test('abertura: janela com a primeira aba pronta para digitação em menos de 2 s', async () => {
  const dir = userData('builtin.cmd');
  // Primeira execução cria a configuração e o cache de detecção; mede a segunda (uso normal).
  await (await launchApp({ userData: dir })).close();
  const started = performance.now();
  const { page, close } = await launchApp({ userData: dir });
  try {
    await expect.poll(() => bufferText(page), { intervals: [20] }).toMatch(/>\s*$/);
    const elapsed = performance.now() - started;
    console.log(`Abertura até o primeiro prompt (CMD): ${Math.round(elapsed)} ms`);
    expect(elapsed).toBeLessThan(2000);
  } finally {
    await close();
  }
});

test('latência de eco abaixo de 50 ms', async () => {
  const { page, close } = await launchApp({ userData: userData('builtin.cmd') });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    // Mede dentro do renderer: tecla → caractere no buffer do xterm.
    const samples = await page.evaluate(async () => {
      const d = (globalThis as unknown as { __gunslingerDebug: { bufferText(): string } }).__gunslingerDebug;
      const textarea = document.querySelector('[data-testid="active-terminal"] .xterm-helper-textarea') as HTMLTextAreaElement;
      const results: number[] = [];
      for (const ch of 'abcdefghijklmnopqrst') {
        const before = d.bufferText().split(ch).length;
        const t0 = performance.now();
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));
        textarea.value = ch;
        textarea.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true }));
        while (d.bufferText().split(ch).length === before && performance.now() - t0 < 1000) await new Promise((r) => setTimeout(r, 1));
        results.push(performance.now() - t0);
      }
      return results;
    });
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)]!;
    console.log(`Eco: mediana ${median.toFixed(1)} ms, máx ${samples.at(-1)!.toFixed(1)} ms`);
    expect(median).toBeLessThan(50);
  } finally {
    await close();
  }
});

test('cores 16/256/24 bits e Unicode', async () => {
  const { page, close } = await launchApp({ userData: userData('builtin.gitbash') });
  try {
    await expect.poll(() => bufferText(page), { timeout: 20_000 }).toContain('$');
    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    // insertText envia o texto inteiro (inclusive pares substitutos, como emoji) de uma vez.
    await page.keyboard.insertText(String.raw`printf '\e[31mCOR16\e[0m \e[38;5;208mCOR256\e[0m \e[38;2;255;100;0mCOR24\e[0m\n'; echo "ação çÇ ñ 日本"`);
    await page.keyboard.press('Enter');
    await expect.poll(() => bufferText(page)).toMatch(/^COR16 COR256 COR24$/m);
    expect(await dbg(page, 'cellColor', 'COR16')).toMatchObject({ palette: true, color: 1 });
    expect(await dbg(page, 'cellColor', 'COR256')).toMatchObject({ palette: true, color: 208 });
    expect(await dbg(page, 'cellColor', 'COR24')).toMatchObject({ rgb: true, color: (255 << 16) | (100 << 8) | 0 });
    await expect.poll(() => bufferText(page)).toMatch(/^ação çÇ ñ 日本$/m);
  } finally {
    await close();
  }
});

test('emoji (fora do plano básico) no CMD', async () => {
  // O Git Bash (MSYS) não repassa caracteres fora do BMP pelo console; CMD e PowerShell sim.
  const { page, close } = await launchApp({ userData: userData('builtin.cmd') });
  try {
    await expect.poll(() => bufferText(page)).toMatch(/>\s*$/);
    await page.locator('[data-testid="active-terminal"] .xterm-helper-textarea').focus();
    await page.keyboard.insertText('echo X🚀Y');
    await page.keyboard.press('Enter');
    await expect.poll(() => bufferText(page)).toMatch(/^X🚀Y$/mu);
  } finally {
    await close();
  }
});
