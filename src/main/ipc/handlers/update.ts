import type { UpdateService } from '../../update/update-service';
import type { IpcRegistry } from '../registry';

/** Atualização automática. `install` passa pela confirmação de saída antes de instalar. */
export function registerUpdateHandlers(ipc: IpcRegistry, deps: { update: UpdateService; install(): void }): void {
  ipc.handle('update:status', () => deps.update.status());
  ipc.handle('update:check', async () => {
    await deps.update.check();
    return deps.update.status();
  });
  ipc.handle('update:install', () => deps.install());
}
