/**
 * Content Security Policy do renderer. Vai em dois lugares: no cabeçalho de resposta (window.ts) e,
 * no build, numa meta tag do index.html (electron.vite.config.ts). O app instalado carrega por
 * `file://`, onde não há cabeçalho HTTP de verdade; a meta tag garante a política mesmo assim.
 */
const DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  // React e xterm.js usam estilos inline.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
];

/** Política do cabeçalho de resposta. */
export const PROD_CSP = [...DIRECTIVES, "frame-ancestors 'none'"].join('; ');

/** Política da meta tag: `frame-ancestors` só vale em cabeçalho (numa meta, o navegador ignora e avisa). */
export const META_CSP = DIRECTIVES.join('; ');

/** O Vite em modo dev injeta scripts inline (preamble do React) e usa WebSocket para o HMR. */
export const DEV_CSP = PROD_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace(
  "connect-src 'self'",
  "connect-src 'self' ws://localhost:* http://localhost:*",
);
