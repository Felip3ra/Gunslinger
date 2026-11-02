import { defineConfig } from '@playwright/test';

// Gera as imagens do site (prints reais do app). Rode com `npm run site:capture` (faz o build antes).
export default defineConfig({
  testDir: '.',
  testMatch: 'capture.spec.ts',
  timeout: 240_000,
  workers: 1,
  reporter: 'list',
});
