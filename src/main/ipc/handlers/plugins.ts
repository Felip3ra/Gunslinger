import type { DesktopPort } from '../../ports';
import type { PluginService } from '../../plugins/plugin-service';
import type { IpcRegistry } from '../registry';

/** Plugins declarativos: lista, ativação e pasta. */
export function registerPluginHandlers(ipc: IpcRegistry, deps: { plugins: PluginService; desktop: DesktopPort }): void {
  ipc.handle('plugins:get', () => deps.plugins.snapshot());
  ipc.handle('plugins:reload', () => deps.plugins.reload());
  ipc.handle('plugins:setEnabled', ({ id, enabled }) => deps.plugins.setEnabled(id, enabled));
  ipc.handle('plugins:openFolder', async () => {
    const error = await deps.desktop.openPath(deps.plugins.dir);
    return error ? { ok: false, error } : { ok: true };
  });
}
