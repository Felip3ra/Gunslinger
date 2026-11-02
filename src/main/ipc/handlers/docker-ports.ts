import type { DockerService } from '../../services/docker-service';
import type { PortService } from '../../services/port-service';
import type { IpcRegistry } from '../registry';

/** Gerenciador de portas e painel do Docker. */
export function registerDockerPortsHandlers(ipc: IpcRegistry, deps: { ports: PortService; docker: DockerService }): void {
  ipc.handle('ports:list', () => deps.ports.list());
  ipc.handle('ports:kill', ({ pid }) => deps.ports.kill(pid));
  ipc.handle('docker:list', () => deps.docker.list());
  ipc.handle('docker:action', ({ id, action }) => deps.docker.act(id, action));
}
