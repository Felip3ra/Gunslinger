import type { DockerAction, DockerContainer } from '@shared/docker';
import type { ListeningPort } from '@shared/ports';
import { api } from './api';
import { confirmDialog, useStore } from './store';
import { openTab } from './tabs';
import { terminals } from './terminal/terminal-registry';

export async function killPort(port: ListeningPort): Promise<boolean> {
  const name = port.processName ?? `PID ${port.pid}`;
  const ok = await confirmDialog('Encerrar processo', `Encerrar ${name} (PID ${port.pid}), que escuta na porta ${port.port}?`, 'Encerrar processo');
  if (!ok) return false;
  const result = await api.invoke('ports:kill', { pid: port.pid });
  if (!result.ok) useStore.getState().pushNotice('error', result.error);
  return result.ok;
}

const confirmations: Partial<Record<DockerAction, string>> = {
  stop: 'Parar',
  rm: 'Remover',
};

export async function dockerAction(container: DockerContainer, action: DockerAction): Promise<boolean> {
  const label = confirmations[action];
  if (label && !(await confirmDialog(`${label} container`, `${label} o container ${container.name} (${container.image})?`, label))) return false;
  const result = await api.invoke('docker:action', { id: container.id, action });
  if (!result.ok) useStore.getState().pushNotice('error', result.error);
  return result.ok;
}

/** Abre uma aba nova e executa o comando nela (o clique no painel é a ação explícita). */
async function runInNewTab(command: string): Promise<void> {
  useStore.setState({ overlay: null });
  const key = await openTab();
  if (!key) return;
  const tab = useStore.getState().tabs.find((t) => t.key === key);
  const profile = useStore.getState().profiles.find((p) => p.id === tab?.profileId);
  await terminals.waitForPrompt(key, profile?.shellIntegration ?? true);
  terminals.paste(key, command);
  terminals.input(key, '\r');
}

export const containerLogs = (c: DockerContainer): Promise<void> => runInNewTab(`docker logs -f --tail 200 ${c.name || c.id}`);
export const containerShell = (c: DockerContainer): Promise<void> => runInNewTab(`docker exec -it ${c.name || c.id} sh`);
