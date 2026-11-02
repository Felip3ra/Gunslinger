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
