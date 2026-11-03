import { deleteCommand, renameCategory, upsertCommand } from '@shared/commands';
import type { ConfigStore } from '../../config/config-store';
import type { EnvironmentService } from '../../env/environment-service';
import type { LastSession } from '../../session/last-session';
import type { IpcRegistry } from '../registry';

/** Configuração, estado da UI, ambiente e comandos salvos. */
export function registerConfigHandlers(ipc: IpcRegistry, deps: { config: ConfigStore; env: EnvironmentService; lastSession: LastSession }): void {
  const { config, env } = deps;
  ipc.handle('config:get', () => config.snapshot());
  ipc.handle('settings:update', ({ path, value }) => config.updateSettings(path, value));
  ipc.handle('state:get', () => config.getState());
  ipc.handle('state:patch', (patch) => config.patchState(patch));
  ipc.handle('env:reload', () => env.reload());
  ipc.handle('session:save', ({ tabs }) => deps.lastSession.save(tabs));

  ipc.handle('commands:save', (command) => config.mutateCommands((f) => upsertCommand(f, command)));
  ipc.handle('commands:delete', ({ id }) => config.mutateCommands((f) => deleteCommand(f, id)));
  ipc.handle('workspaces:save', (ws) =>
    config.mutateWorkspaces((f) => ({
      ...f,
      workspaces: f.workspaces.some((w) => w.id === ws.id) ? f.workspaces.map((w) => (w.id === ws.id ? ws : w)) : [...f.workspaces, ws],
    })),
  );
  ipc.handle('workspaces:delete', ({ id }) => config.mutateWorkspaces((f) => ({ ...f, workspaces: f.workspaces.filter((w) => w.id !== id) })));
  ipc.handle('commands:renameCategory', ({ from, to }) => config.mutateCommands((f) => renameCategory(f, from, to)));
}
