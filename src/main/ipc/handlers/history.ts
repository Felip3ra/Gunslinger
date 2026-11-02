import type { HistoryService } from '../../history/history-service';
import type { IpcRegistry } from '../registry';

/** Histórico de dados (snapshots e restauração). */
export function registerHistoryHandlers(ipc: IpcRegistry, deps: { history: HistoryService }): void {
  ipc.handle('history:list', () => deps.history.list());
  ipc.handle('history:create', ({ label }) => deps.history.capture('manual', label));
  ipc.handle('history:restore', ({ id }) => deps.history.restore(id));
  ipc.handle('history:delete', ({ id }) => deps.history.remove(id));
}
