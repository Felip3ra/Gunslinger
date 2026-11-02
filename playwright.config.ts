import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // Cada teste inicia o app; em paralelo, as janelas disputariam foco e recursos.
  workers: 1,
  reporter: 'list',
});
