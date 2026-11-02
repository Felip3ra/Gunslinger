import { clipboard, dialog, Notification, shell, type BrowserWindow } from 'electron';
import type { ClipboardPort, DesktopPort, DialogPort, NotifierPort, WindowPort } from '../ports';
import { openExternalSafe } from '../window';

/** Adaptadores Electron das portas. Único lugar (com window.ts/index.ts/composition.ts) que importa o Electron. */
export function electronDialogs(getWindow: () => BrowserWindow | null): DialogPort {
  const parent = (): BrowserWindow | undefined => getWindow() ?? undefined;
  return {
    async saveFile(options) {
      const win = parent();
      const r = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      return r.canceled || !r.filePath ? null : r.filePath;
    },
    async openFile(options) {
      const opts = { ...options, properties: ['openFile' as const] };
      const win = parent();
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    async openFolder() {
      const r = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    async ask(options) {
      const opts = { type: 'warning' as const, ...options };
      const win = parent();
      const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
      return r.response;
    },
  };
}

export const electronNotifier: NotifierPort = {
  isSupported: () => Notification.isSupported(),
  show(options) {
    const n = new Notification(options);
    n.show();
    return { onClick: (listener) => void n.on('click', listener) };
  },
};

export const electronClipboard: ClipboardPort = {
  readText: () => clipboard.readText(),
  writeText: (text) => clipboard.writeText(text),
};

export const electronDesktop: DesktopPort = {
  openPath: (path) => shell.openPath(path),
  openExternal: (url) => openExternalSafe(url),
};

export function electronWindow(getWindow: () => BrowserWindow | null): WindowPort {
  return {
    isFocused: () => getWindow()?.isFocused() ?? false,
    reveal: () => {
      const win = getWindow();
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
  };
}
