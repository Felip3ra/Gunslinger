import { app, BrowserWindow, dialog } from 'electron';
import { compose } from './composition';
import { installQuitFlow } from './quit-flow';
import { createMainWindow, installContentSecurityPolicy } from './window';

let mainWindow: BrowserWindow | null = null;

// Um erro fora de qualquer try (watcher, callback de processo) não pode derrubar os terminais abertos.
process.on('uncaughtException', (err) => console.error('Erro não tratado no processo principal:', err));
process.on('unhandledRejection', (reason) => console.error('Promise rejeitada sem tratamento no processo principal:', reason));

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
    let services;
    try {
      services = await compose(() => mainWindow);
    } catch (err) {
      // Sem isso o processo ficaria vivo, sem janela e segurando a trava de instância única.
      dialog.showErrorBox('Gunslinger não pôde iniciar', `${err instanceof Error ? err.message : String(err)}\n\nPasta de dados: ${app.getPath('userData')}`);
      app.exit(1);
      return;
    }
    mainWindow = createMainWindow();
    services.attachWindow(mainWindow, installQuitFlow(mainWindow, services));
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });

  app.on('window-all-closed', () => app.quit());
}
