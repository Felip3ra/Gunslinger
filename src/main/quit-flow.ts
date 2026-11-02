import type { BrowserWindow } from 'electron';
import type { AppServices } from './composition';

const QUIT_KILL_TIMEOUT_MS = 3000;

/**
 * Ao fechar a janela: confirma se há abas ocupadas e encerra todas as árvores de processos
 * (espera no máximo 3 s) antes de deixar o app sair.
 */
export function installQuitFlow(win: BrowserWindow, services: AppServices): void {
  let closing = false;
  win.on('close', (event) => {
    if (closing) return;
    event.preventDefault();
    void (async () => {
      const busy = await services.pty.busyCount();
      if (busy > 0) {
        const response = await services.dialogs.ask({
          title: 'Gunslinger',
          message: busy === 1 ? '1 aba tem um processo em execução.' : `${busy} abas têm processos em execução.`,
          detail: 'Os processos serão encerrados.',
          buttons: ['Fechar mesmo assim', 'Cancelar'],
          defaultId: 1,
          cancelId: 1,
        });
        if (response !== 0) return;
      }
      closing = true;
      services.dispose();
      await Promise.race([services.pty.killAll(), new Promise((r) => setTimeout(r, QUIT_KILL_TIMEOUT_MS))]);
      win.destroy();
    })();
  });
}
