import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  // Cada teste inicia o app; em paralelo, as janelas disputariam foco e recursos.
  workers: 1,
  // No CI, cada falha vira uma anotação do GitHub (visível sem abrir o log).
  reporter: process.env['CI'] ? [['list'], ['github']] : 'list',
});
