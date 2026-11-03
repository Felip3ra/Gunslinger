import type { BrowserWindow } from 'electron';
import type { AppServices } from './composition';
import type { KillResult } from './pty/pty-manager';

const QUIT_KILL_TIMEOUT_MS = 3000;

/** Fecha o app; `afterCleanup` substitui o fechamento da janela (ex.: instalar a atualização). */
export type QuitFn = (afterCleanup?: () => void) => Promise<void>;

/**
 * Ao fechar a janela: confirma se há abas ocupadas e encerra todas as árvores de processos
 * (espera no máximo 3 s) antes de deixar o app sair. Processos que saíram da árvore das abas
 * seguem a configuração (perguntar, encerrar ou manter).
 */
export function installQuitFlow(win: BrowserWindow, services: AppServices): QuitFn {
  let closing = false;
  let inProgress = false;

  const quit: QuitFn = async (afterCleanup) => {
    if (closing || inProgress) return;
    inProgress = true;
    try {
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
      const killed = await Promise.race([
        services.pty.killAll(),
        new Promise<KillResult>((r) => setTimeout(() => r({ token: null, detached: [] }), QUIT_KILL_TIMEOUT_MS)),
      ]);
      if (killed.token) {
        const response = await services.dialogs.ask({
          title: 'Gunslinger',
          message: 'Processos iniciados pelas abas continuam rodando fora delas.',
          detail: describeProcesses(killed.detached),
          buttons: ['Encerrar também', 'Manter rodando'],
          defaultId: 1,
          cancelId: 1,
        });
        if (response === 0) await services.pty.killDetached(killed.token);
      }
      if (afterCleanup) afterCleanup();
      else win.destroy();
    } finally {
      inProgress = false;
    }
  };

  win.on('close', (event) => {
    if (closing) return;
    event.preventDefault();
    void quit();
  });
  return quit;
}

/** "PING (4242), node (5120)", limitado para caber na caixa de diálogo. */
export function describeProcesses(list: { pid: number; name: string }[]): string {
  const shown = list.slice(0, 12).map((p) => `${p.name || '?'} (${p.pid})`);
  return shown.join('\n') + (list.length > shown.length ? `\n… e mais ${list.length - shown.length}` : '');
}
