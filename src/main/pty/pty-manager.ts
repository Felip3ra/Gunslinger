import { randomUUID } from 'node:crypto';
import type { IPty } from 'node-pty';
import type { EventMap } from '@shared/ipc-contract';
import { planInlineElevation, type ElevationMechanism } from '@shared/elevation';
import type { ShellProfile } from '@shared/model';
import type { Env } from '../env/env-utils';
import { NotFoundError } from '../ipc/registry';
import type { LaunchSpec } from '../integration/launch';
import type { PlatformAdapter, ProcessTracker, TrackedProcess } from '../platform/types';
import { ptyBackend, type TerminalBackend } from './terminal-backend';

export const FLUSH_INTERVAL_MS = 5;
export const FLUSH_MAX_BYTES = 64 * 1024;
export const HIGH_WATERMARK = 1024 * 1024;
export const LOW_WATERMARK = 256 * 1024;
const KILL_GRACE_MS = 1500;

export type SpawnFn = (file: string, args: string[], options: { cols: number; rows: number; cwd: string; env: Env }) => IPty;

export interface PtyManagerDeps {
  platform: PlatformAdapter;
  spawn: SpawnFn;
  send: <K extends keyof EventMap>(channel: K, payload: EventMap[K]) => void;
  resolveProfile(id: string): ShellProfile | undefined;
  buildLaunch(profile: ShellProfile, cwd: string, options: { elevated: boolean }): LaunchSpec;
  envGeneration(): number;
  defaultCwd(): string;
  /** Variáveis de um perfil de ambiente (resolvidas no main; o renderer só manda o id). */
  environmentVariables(envProfileId: string): Record<string, string> | undefined;
  /** Acompanha os processos que saem da árvore do shell (null: sem suporte). */
  tracker?: ProcessTracker | null;
  /** O que fazer com eles ao fechar a aba (padrão: manter). */
  detachedMode?: () => 'ask' | 'kill' | 'keep';
}

/** Resultado de encerrar sessões: processos que saíram da árvore, à espera da decisão do usuário. */
export interface KillResult {
  /** Passado a `killDetached` para encerrá-los; null quando não há o que perguntar. */
  token: string | null;
  detached: TrackedProcess[];
}

const NOTHING_DETACHED: KillResult = { token: null, detached: [] };

export interface SessionInfo {
  id: string;
  /** 'local': shell em PTY; 'ssh': shell remoto (sem processo local, pasta nem integração). */
  kind: 'local' | 'ssh';
  /** Perfil de shell (vazio em sessões SSH). */
  profileId: string;
  /** Host da sessão SSH (null na conexão rápida e em sessões locais). */
  hostId: string | null;
  projectId: string | null;
  /** PID do shell local; null em sessões SSH. */
  pid: number | null;
  envGeneration: number;
  initialCwd: string;
  cwd: string;
  commandRunning: boolean;
  /** Shell elevado (sudo inline/gsudo). */
  elevated: boolean;
  envProfileId: string | null;
  /** true depois que o shell enviou a primeira marca da integração (pasta ou comando). */
  integrated: boolean;
  exited: boolean;
}

interface Session extends SessionInfo {
  backend: TerminalBackend;
  elevation: Exclude<ElevationMechanism, { kind: 'external' }> | undefined;
  pending: string[];
  pendingBytes: number;
  flushTimer: NodeJS.Timeout | null;
  unacked: number;
  paused: boolean;
  /** Encerrada pelo Gunslinger: quem encerrou libera o grupo de processos. */
  killing: boolean;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class PtyManager {
  private readonly sessions = new Map<string, Session>();
  private readonly listeners = new Set<(info: SessionInfo, event: 'created' | 'state' | 'exit') => void>();
  /** Processos fora da árvore aguardando a resposta do usuário, por token. */
  private readonly held = new Map<string, TrackedProcess[]>();

  constructor(private readonly deps: PtyManagerDeps) {}

  /** `elevation`: mecanismo inline já resolvido quando a aba deve abrir como administrador. */
  create(
    req: { profileId: string; cwd?: string; projectId?: string; cols: number; rows: number; envProfileId?: string },
    elevation?: Exclude<ElevationMechanism, { kind: 'external' }>,
  ): SessionInfo {
    const profile = this.deps.resolveProfile(req.profileId);
    if (!profile) throw new NotFoundError(`Perfil não encontrado: ${req.profileId}`);
    if (!profile.available) throw new Error(`O executável do perfil "${profile.name}" não está disponível.`);

    const cwd = req.cwd ?? profile.cwd ?? this.deps.defaultCwd();
    const launch = this.deps.buildLaunch(profile, cwd, { elevated: !!elevation });
    const spec = elevation ? { ...launch, ...planInlineElevation(elevation, launch) } : launch;
    if (req.envProfileId) {
      const vars = this.deps.environmentVariables(req.envProfileId);
      if (!vars) throw new NotFoundError(`Perfil de ambiente não encontrado: ${req.envProfileId}`);
      spec.env = { ...spec.env, ...vars };
    }
    let pty: IPty;
    try {
      pty = this.deps.spawn(spec.file, spec.args, { cols: req.cols, rows: req.rows, cwd: spec.cwd, env: spec.env });
    } catch (err) {
      throw new Error(`Falha ao iniciar "${profile.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
    return this.register(
      {
        kind: 'local',
        profileId: profile.id,
        hostId: null,
        projectId: req.projectId ?? null,
        initialCwd: cwd,
        elevated: !!elevation,
        elevation,
        envProfileId: req.envProfileId ?? null,
      },
      ptyBackend(pty),
    );
  }

  /**
   * Sessão remota (SSH): o backend já existe e conecta sozinho; até lá, escritas são descartadas.
   * Não há processo local, pasta atual nem rastreamento de processos.
   */
  createRemote(req: { hostId: string | null }, backend: TerminalBackend): SessionInfo {
    return this.register(
      { kind: 'ssh', profileId: '', hostId: req.hostId, projectId: null, initialCwd: '', elevated: false, elevation: undefined, envProfileId: null },
      backend,
    );
  }

  private register(
    fields: Pick<Session, 'kind' | 'profileId' | 'hostId' | 'projectId' | 'initialCwd' | 'elevated' | 'elevation' | 'envProfileId'>,
    backend: TerminalBackend,
  ): SessionInfo {
    const session: Session = {
      ...fields,
      id: randomUUID(),
      pid: backend.pid,
      envGeneration: this.deps.envGeneration(),
      cwd: fields.initialCwd,
      commandRunning: false,
      integrated: false,
      exited: false,
      backend,
      pending: [],
      pendingBytes: 0,
      flushTimer: null,
      unacked: 0,
      paused: false,
      killing: false,
    };
    this.sessions.set(session.id, session);
    if (session.pid !== null) this.deps.tracker?.track(session.id, session.pid);

    backend.onData((data) => this.enqueue(session, data));
    backend.onExit((exitCode) => {
      this.flush(session);
      session.exited = true;
      this.sessions.delete(session.id);
      // Saída pelo próprio shell (exit): os processos que ele deixou continuam rodando.
      if (!session.killing && session.pid !== null) void this.deps.tracker?.release(session.id);
      this.deps.send('pty:exit', { sessionId: session.id, exitCode });
      this.notify(session, 'exit');
    });
    this.notify(session, 'created');
    return this.info(session);
  }

  private enqueue(session: Session, data: string): void {
    session.pending.push(data);
    session.pendingBytes += data.length;
    if (session.pendingBytes >= FLUSH_MAX_BYTES) {
      this.flush(session);
    } else if (!session.flushTimer) {
      session.flushTimer = setTimeout(() => this.flush(session), FLUSH_INTERVAL_MS);
    }
  }

  private flush(session: Session): void {
    if (session.flushTimer) {
      clearTimeout(session.flushTimer);
      session.flushTimer = null;
    }
    if (session.pending.length === 0) return;
    const data = session.pending.join('');
    session.pending = [];
    session.pendingBytes = 0;
    this.deps.send('pty:data', { sessionId: session.id, data });
    session.unacked += data.length;
    if (!session.paused && session.unacked > HIGH_WATERMARK) {
      session.paused = true;
      session.backend.pause();
    }
  }

  ack(sessionId: string, bytes: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.unacked = Math.max(0, session.unacked - bytes);
    if (session.paused && session.unacked < LOW_WATERMARK) {
      session.paused = false;
      session.backend.resume();
    }
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.backend.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.exited) return;
    try {
      session.backend.resize(cols, rows);
    } catch {
      // o processo pode ter acabado de sair
    }
  }

  updateState(sessionId: string, state: { cwd?: string; commandRunning?: boolean }): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.integrated = true;
    if (state.cwd !== undefined) session.cwd = state.cwd;
    if (state.commandRunning !== undefined) session.commandRunning = state.commandRunning;
    this.notify(session, 'state');
  }

  async isBusy(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundError('Sessão não encontrada');
    // SSH: não há como saber se há comando rodando no servidor (não conta como ocupada).
    if (session.pid === null) return false;
    // Com integração, as marcas de comando são a fonte confiável (o bash do Git, por exemplo,
    // é um lançador que sempre tem um processo filho).
    if (session.integrated) return session.commandRunning;
    // Sem integração: há algum processo filho além do próprio shell?
    const descendants = await this.deps.platform.listDescendants(session.pid).catch(() => []);
    return descendants.length > 0;
  }

  /**
   * Encerra o shell e todos os descendentes (capturados antes, para alcançar os que perderem o pai).
   * Os que já tinham saído da árvore seguem `detachedMode`.
   */
  async kill(sessionId: string): Promise<KillResult> {
    return this.decide(await this.killSession(sessionId));
  }

  async killAll(): Promise<KillResult> {
    const found = await Promise.all([...this.sessions.keys()].map((id) => this.killSession(id)));
    return this.decide(found.flat());
  }

  /** Encerra os processos guardados sob o token (o usuário escolheu encerrar). */
  async killDetached(token: string): Promise<void> {
    const list = this.held.get(token);
    this.held.delete(token);
    if (list) await this.killProcesses(list);
  }

  private async decide(found: TrackedProcess[]): Promise<KillResult> {
    const mode = this.deps.detachedMode?.() ?? 'keep';
    if (found.length === 0 || mode === 'keep') return NOTHING_DETACHED;
    if (mode === 'kill') {
      await this.killProcesses(found);
      return NOTHING_DETACHED;
    }
    const token = randomUUID();
    this.held.set(token, found);
    return { token, detached: found };
  }

  private async killProcesses(list: TrackedProcess[]): Promise<void> {
    await Promise.all(list.map((p) => this.deps.platform.killTree(p.pid, [])));
  }

  /** Devolve os processos do grupo da sessão que continuam vivos fora da árvore. */
  private async killSession(sessionId: string): Promise<TrackedProcess[]> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    session.killing = true;
    const pid = session.pid;
    if (pid === null) {
      // Remota: fechar o canal basta (o pool encerra a conexão quando ninguém mais a usa).
      try {
        session.backend.kill();
      } catch {
        // já encerrado
      }
      this.sessions.delete(sessionId);
      return [];
    }
    const descendants = await this.deps.platform.listDescendants(pid).catch(() => []);
    try {
      session.backend.kill();
    } catch {
      // já encerrado
    }
    await new Promise((r) => setTimeout(r, KILL_GRACE_MS));
    const survivors = descendants.filter(isAlive);
    if (isAlive(pid) || survivors.length > 0) {
      await this.deps.platform.killTree(pid, survivors);
    }
    this.sessions.delete(sessionId);
    const known = new Set([pid, ...descendants]);
    const left = (await this.deps.tracker?.release(sessionId)) ?? [];
    return left.filter((p) => !known.has(p.pid));
  }

  async restart(sessionId: string, cols: number, rows: number): Promise<SessionInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundError('Sessão não encontrada');
    if (session.kind === 'ssh') throw new Error('Sessões SSH reconectam por ssh:reconnect.');
    const { profileId, cwd, projectId, elevation, envProfileId } = session;
    // Reiniciar não pergunta: o que saiu da árvore continua rodando.
    await this.killSession(sessionId);
    return this.create({ profileId, cwd, cols, rows, ...(projectId ? { projectId } : {}), ...(envProfileId ? { envProfileId } : {}) }, elevation);
  }

  get(sessionId: string): SessionInfo | undefined {
    const s = this.sessions.get(sessionId);
    return s ? this.info(s) : undefined;
  }

  list(): SessionInfo[] {
    return [...this.sessions.values()].map((s) => this.info(s));
  }

  async busyCount(): Promise<number> {
    const flags = await Promise.all([...this.sessions.keys()].map((id) => this.isBusy(id).catch(() => false)));
    return flags.filter(Boolean).length;
  }

  onSessionEvent(listener: (info: SessionInfo, event: 'created' | 'state' | 'exit') => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(session: Session, event: 'created' | 'state' | 'exit'): void {
    const info = this.info(session);
    for (const l of this.listeners) l(info, event);
  }

  private info(s: Session): SessionInfo {
    return {
      id: s.id,
      kind: s.kind,
      profileId: s.profileId,
      hostId: s.hostId,
      projectId: s.projectId,
      pid: s.pid,
      envGeneration: s.envGeneration,
      initialCwd: s.initialCwd,
      cwd: s.cwd,
      commandRunning: s.commandRunning,
      elevated: s.elevated,
      envProfileId: s.envProfileId,
      integrated: s.integrated,
      exited: s.exited,
    };
  }
}
