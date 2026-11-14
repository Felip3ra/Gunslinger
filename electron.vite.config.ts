import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { META_CSP } from './src/shared/csp';

const shared = resolve(__dirname, 'src/shared');

/**
 * Grava a CSP numa meta tag do index.html, só no build: em dev o Vite precisa de scripts inline,
 * e duas políticas se somam (a meta bloquearia o que o cabeçalho de dev libera).
 */
const cspMeta: Plugin = {
  name: 'gunslinger-csp-meta',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: META_CSP }, injectTo: 'head-prepend' }],
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
  },
  preload: {
    // Roda em sandbox: só 'electron' pode ficar externo; @shared entra no bundle.
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias: { '@shared': shared, '@renderer': resolve(__dirname, 'src/renderer/src') } },
    plugins: [react(), cspMeta],
  },
});
