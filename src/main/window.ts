import { join } from 'node:path';
import { BrowserWindow, session, shell } from 'electron';
import icon from '../../resources/icon.png?asset';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

const PROD_CSP = [
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
  "frame-ancestors 'none'",
].join('; ');

// O Vite em modo dev injeta scripts inline (preamble do React) e usa WebSocket para o HMR.
const DEV_CSP = PROD_CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace(
  "connect-src 'self'",
  "connect-src 'self' ws://localhost:* http://localhost:*",
);

export function installContentSecurityPolicy(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [isDev ? DEV_CSP : PROD_CSP],
      },
    });
  });
  // Nenhuma permissão do navegador é necessária: a área de transferência passa pelo main.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 480,
    minHeight: 320,
    show: false,
    backgroundColor: '#0d1117',
    title: 'Gunslinger',
    // Ícone da janela e da barra de tarefas (no instalado o .exe também o tem; em dev é o único).
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Bloqueia toda navegação e novas janelas; links externos passam por shell:openExternal.
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());

  if (isDev) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']!);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

/** Abre somente URLs http(s) no navegador padrão. */
export async function openExternalSafe(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`URL inválida: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Esquema não permitido: ${parsed.protocol}`);
  }
  await shell.openExternal(parsed.toString());
}
