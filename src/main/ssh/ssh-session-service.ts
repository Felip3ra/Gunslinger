import type { HostsFile } from '@shared/model';
import { formatTarget } from '@shared/ssh-hosts';
import type { SshSessionState, SshStage, SshTarget } from '@shared/ssh';
import type { PtyManager } from '../pty/pty-manager';
import { NotFoundError } from '../ipc/registry';
import type { SshConnectionPool } from './connection-pool';
import { SshShellBackend } from './ssh-shell-backend';

export interface SshSessionDeps {
  pool: Pick<SshConnectionPool, 'acquire'>;
  pty: Pick<PtyManager, 'createRemote' | 'kill'>;
  send(state: SshSessionState): void;
  hostsFile(): HostsFile;
  /** Descarta as perguntas pendentes da conexão ao destino (aba fechada durante a conexão). */
  cancelPrompts?(target: SshTarget): void;
}

/** Abas SSH: cria a sessão no PtyManager com o backend remoto e informa as etapas da conexão. */
export class SshSessionService {
  private readonly targets = new Map<string, SshTarget>();
  private readonly states = new Map<string, SshSessionState>();

  constructor(private readonly deps: SshSessionDeps) {}

  /** Nome mostrado na aba: o nome do host ou `usuário@endereço:porta`. */
  labelOf(target: SshTarget): string {
    if (target.kind === 'quick') return formatTarget(target.username, target.address, target.port);
    const host = this.deps.hostsFile().hosts.find((h) => h.id === target.hostId);
    if (!host) throw new NotFoundError('Host não encontrado.');
    return host.name;
  }

  connect(target: SshTarget, cols: number, rows: number): { sessionId: string; label: string } {
    const label = this.labelOf(target);
    let sessionId = '';
    const backend = new SshShellBackend(
      this.deps.pool,
      target,
      cols,
      rows,
      (stage, message) => this.setState(sessionId, stage, message),
      () => this.deps.cancelPrompts?.(target),
    );
    sessionId = this.deps.pty.createRemote({ hostId: target.kind === 'host' ? target.hostId : null }, backend).id;
    this.targets.set(sessionId, target);
    this.setState(sessionId, 'connecting', null);
    void backend.start();
    return { sessionId, label };
  }

  /** "Reconectar": encerra a sessão antiga (se ainda existir) e abre outra para o mesmo destino. */
  async reconnect(sessionId: string, cols: number, rows: number): Promise<{ sessionId: string; label: string }> {
    const target = this.targets.get(sessionId);
    if (!target) throw new NotFoundError('Sessão não encontrada');
    await this.deps.pty.kill(sessionId);
    this.targets.delete(sessionId);
    this.states.delete(sessionId);
    return this.connect(target, cols, rows);
  }

  stateOf(sessionId: string): SshSessionState | null {
    return this.states.get(sessionId) ?? null;
  }

  private setState(sessionId: string, stage: SshStage, message: string | null): void {
    if (!sessionId) return;
    const state = { sessionId, stage, message };
    this.states.set(sessionId, state);
    this.deps.send(state);
  }
}
