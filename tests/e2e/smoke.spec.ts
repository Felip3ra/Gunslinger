import { expect, test } from '@playwright/test';
import { launchApp } from './helpers';

test('abre a janela principal', async () => {
  const { app, page, close } = await launchApp();
  try {
    expect(await page.title()).toBe('Gunslinger');
    const windows = app.windows();
    expect(windows).toHaveLength(1);
  } finally {
    await close();
  }
});

test('renderer isolado: sem require, process ou Buffer', async () => {
  const { page, close } = await launchApp();
  try {
    const exposed = await page.evaluate(() => ({
      require: typeof (globalThis as Record<string, unknown>)['require'],
      process: typeof (globalThis as Record<string, unknown>)['process'],
      buffer: typeof (globalThis as Record<string, unknown>)['Buffer'],
      api: typeof (globalThis as Record<string, unknown>)['gunslinger'],
    }));
    expect(exposed).toEqual({ require: 'undefined', process: 'undefined', buffer: 'undefined', api: 'object' });
  } finally {
    await close();
  }
});

test('bloqueia navegação e window.open', async () => {
  const { app, page, close } = await launchApp();
  try {
    const before = page.url();
    await page.evaluate(() => {
      const w = globalThis as unknown as { open(u: string): void; location: { href: string } };
      w.open('https://example.com');
      w.location.href = 'https://example.com';
    });
    await page.waitForTimeout(500);
    expect(app.windows()).toHaveLength(1);
    expect(page.url()).toBe(before);
  } finally {
    await close();
  }
});

test('CSP aplicada no app carregado por file://: script inline não executa', async () => {
  const { page, close } = await launchApp();
  try {
    const result = await page.evaluate(() => {
      const doc = (globalThis as unknown as { document: { querySelector(s: string): { content: string } | null; createElement(t: string): { textContent: string }; head: { appendChild(n: unknown): void } } }).document;
      const meta = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
      const script = doc.createElement('script');
      script.textContent = 'globalThis.__inlineRan = true';
      doc.head.appendChild(script);
      return { policy: meta?.content ?? null, inlineRan: (globalThis as Record<string, unknown>)['__inlineRan'] === true };
    });
    expect(result.policy).toContain("script-src 'self'");
    expect(result.inlineRan).toBe(false);
  } finally {
    await close();
  }
});
