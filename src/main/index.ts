import { app, BrowserWindow } from 'electron';
import { compose } from './composition';
import { installQuitFlow } from './quit-flow';
import { createMainWindow, installContentSecurityPolicy } from './window';

let mainWindow: BrowserWindow | null = null;

// Usado pelos testes e2e para isolar configuração e a trava de instância única.
if (process.env['GUNSLINGER_USER_DATA']) {
  app.setPath('userData', process.env['GUNSLINGER_USER_DATA']);
}

// Instância única: a segunda execução só traz a janela existente para a frente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setAppUserModelId('com.gunslinger.app');

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    installContentSecurityPolicy();
    // Os handlers de IPC precisam existir antes de o renderer carregar.
    const services = await compose(() => mainWindow);
    mainWindow = createMainWindow();
    installQuitFlow(mainWindow, services);
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });

  app.on('window-all-closed', () => app.quit());
}
