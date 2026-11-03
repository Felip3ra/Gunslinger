import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdaterPort } from '../update/update-service';

/**
 * Atualizador do app instalado: lê as releases do GitHub (configuração `publish` do
 * electron-builder, gravada em app-update.yml). Fora do app instalado devolve null.
 */
export function electronUpdaterPort(): UpdaterPort | null {
  if (!app.isPackaged) return null;
  const { autoUpdater } = electronUpdater;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  let available: string | null = null;
  autoUpdater.on('update-available', (info) => {
    available = info.version;
  });

  return {
    currentVersion: () => app.getVersion(),
    async check() {
      available = null;
      await autoUpdater.checkForUpdates();
      return available;
    },
    async download(onProgress) {
      const listener = (p: { percent: number }): void => onProgress(p.percent);
      autoUpdater.on('download-progress', listener);
      try {
        await autoUpdater.downloadUpdate();
      } finally {
        autoUpdater.off('download-progress', listener);
      }
    },
    // Instalação silenciosa (o instalador é oneClick) e reabre o app em seguida.
    quitAndInstall: () => autoUpdater.quitAndInstall(true, true),
  };
}
