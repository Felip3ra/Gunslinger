import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: {
    globals: true,
    environment: 'node',
    // Lógica pura do renderer (sem DOM) também é testada aqui.
    include: ['src/**/*.test.ts'],
  },
});
