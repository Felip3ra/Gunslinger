import type { HostService } from '../../ssh/host-service';
import type { PromptBroker } from '../../ssh/prompt-broker';
import type { SshSessionService } from '../../ssh/ssh-session-service';
import type { TransferService } from '../../transfer/transfer-service';
import type { IpcRegistry } from '../registry';

/** Cadastro de hosts e grupos, abas SSH e perguntas da conexão. */
export function registerSshHandlers(
  ipc: IpcRegistry,
  deps: { hosts: HostService; sessions: SshSessionService; prompts: PromptBroker; transfer: TransferService },
): void {
  const { hosts, sessions, prompts } = deps;
  ipc.handle('hosts:save', (host) => hosts.saveHost(host));
  ipc.handle('hosts:duplicate', ({ hostId }) => hosts.duplicateHost(hostId));
  ipc.handle('hosts:delete', ({ hostId }) => hosts.deleteHost(hostId));
  ipc.handle('hosts:jumpUsers', ({ hostId }) => hosts.jumpUsers(hostId));
  ipc.handle('hosts:saveGroup', (group) => hosts.saveGroup(group));
  ipc.handle('hosts:groupContents', ({ groupId }) => hosts.groupContents(groupId));
  ipc.handle('hosts:deleteGroup', ({ groupId, contents }) => hosts.deleteGroup(groupId, contents));
  ipc.handle('transfer:previewOpenSsh', () => deps.transfer.previewOpenSsh());

  ipc.handle('ssh:connect', ({ target, cols, rows }) => sessions.connect(target, cols, rows));
  ipc.handle('ssh:reconnect', ({ sessionId, cols, rows }) => sessions.reconnect(sessionId, cols, rows));
  ipc.handle('ssh:answer', ({ promptId, answer }) => prompts.answer(promptId, answer));
  ipc.handle('ssh:state', ({ sessionId }) => sessions.stateOf(sessionId));
}
