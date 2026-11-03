import type { ElevationService } from '../../elevation/elevation-service';
import type { LaunchSpec } from '../../integration/launch';
import type { DialogPort } from '../../ports';
import { NotFoundError } from '../registry';
import type { PtyManager } from '../../pty/pty-manager';
import type { ShellService } from '../../shells/shell-service';
import type { StatusService } from '../../status/status-service';
import type { IpcRegistry } from '../registry';

/** Perfis de shell, sessões de PTY e estado das sessões. */
export function registerTerminalHandlers(
  ipc: IpcRegistry,
  deps: {
    shells: ShellService;
    pty: PtyManager;
    status: StatusService;
    elevation: ElevationService;
    dialogs: DialogPort;
    /** Linha de comando sem integração, para a janela elevada externa. */
    plainLaunch(profileId: string, cwd?: string): LaunchSpec | null;
  },
): void {
  const { shells, pty, status, elevation } = deps;
  ipc.handle('profiles:list', () => shells.list());
  ipc.handle('profiles:save', (p) => shells.saveCustom(p));
  ipc.handle('profiles:delete', ({ id }) => shells.deleteCustom(id));
  ipc.handle('profiles:setOverride', ({ id, override }) => shells.setOverride(id, override));
  ipc.handle('profiles:pickIcon', () =>
    deps.dialogs.openFile({ title: 'Ícone do perfil', filters: [{ name: 'Imagens', extensions: ['png', 'ico', 'svg', 'jpg', 'jpeg', 'gif', 'webp'] }] }),
  );

  ipc.handle('pty:create', async ({ elevated, ...req }) => {
    let mechanism;
    if (elevated) {
      mechanism = await elevation.mechanism();
      if (mechanism.kind === 'external') throw new Error('Elevação dentro do app indisponível: use a janela separada.');
    }
    const info = pty.create(req, mechanism);
    return { sessionId: info.id, profileId: info.profileId, envGeneration: info.envGeneration, cwd: info.cwd, elevated: info.elevated };
  });
  ipc.handle('elevation:info', () => elevation.info());
  ipc.handle('elevation:openExternal', ({ profileId, cwd }) => {
    const spec = deps.plainLaunch(profileId, cwd);
    if (!spec) throw new NotFoundError(`Perfil não encontrado: ${profileId}`);
    return elevation.openExternal(spec, spec.cwd);
  });
  ipc.handle('pty:restart', async ({ sessionId, cols, rows }) => {
    const info = await pty.restart(sessionId, cols, rows);
    return { sessionId: info.id, envGeneration: info.envGeneration };
  });
  ipc.handle('pty:isBusy', ({ sessionId }) => pty.isBusy(sessionId));
  ipc.handle('pty:kill', ({ sessionId }) => pty.kill(sessionId));
  ipc.handle('pty:killDetached', ({ token }) => pty.killDetached(token));
  ipc.on('pty:write', ({ sessionId, data }) => pty.write(sessionId, data));
  ipc.on('pty:resize', ({ sessionId, cols, rows }) => pty.resize(sessionId, cols, rows));
  ipc.on('pty:ack', ({ sessionId, bytes }) => pty.ack(sessionId, bytes));
  ipc.on('session:state', ({ sessionId, cwd, commandRunning }) =>
    pty.updateState(sessionId, { ...(cwd !== undefined ? { cwd } : {}), ...(commandRunning !== undefined ? { commandRunning } : {}) }),
  );
  ipc.on('session:activate', ({ sessionId }) => status.activate(sessionId));
}
