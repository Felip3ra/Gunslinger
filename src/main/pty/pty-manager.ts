import { randomUUID } from 'node:crypto';
import type { IPty } from 'node-pty';
import type { EventMap } from '@shared/ipc-contract';
import { planInlineElevation, type ElevationMechanism } from '@shared/elevation';
import type { ShellProfile } from '@shared/model';
import type { Env } from '../env/env-utils';
import { NotFoundError } from '../ipc/registry';
import type { LaunchSpec } from '../integration/launch';
import type { PlatformAdapter } from '../platform/types';

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
}

export interface SessionInfo {
  id: string;
  profileId: string;
  projectId: string | null;
  pid: number;
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
  pty: IPty;
  elevation: Exclude<ElevationMechanism, { kind: 'external' }> | undefined;
  pending: string[];
  pendingBytes: number;
  flushTimer: NodeJS.Timeout | null;
  unacked: number;
  paused: boolean;
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

    const session: Session = {
      id: randomUUID(),
      profileId: profile.id,
      projectId: req.projectId ?? null,
      pid: pty.pid,
      envGeneration: this.deps.envGeneration(),
      initialCwd: cwd,
      cwd,
      commandRunning: false,
      elevated: !!elevation,
      elevation,
      envProfileId: req.envProfileId ?? null,
      integrated: false,
      exited: false,
      pty,
      pending: [],
      pendingBytes: 0,
      flushTimer: null,
      unacked: 0,
      paused: false,
    };
    this.sessions.set(session.id, session);

    pty.onData((data) => this.enqueue(session, data));
    pty.onExit(({ exitCode }) => {
      this.flush(session);
      session.exited = true;
      this.sessions.delete(session.id);
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
      session.pty.pause();
    }
  }

  ack(sessionId: string, bytes: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.unacked = Math.max(0, session.unacked - bytes);
    if (session.paused && session.unacked < LOW_WATERMARK) {
      session.paused = false;
      session.pty.resume();
    }
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.exited) return;
    try {
      session.pty.resize(cols, rows);
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
    // Com integração, as marcas de comando são a fonte confiável (o bash do Git, por exemplo,
    // é um lançador que sempre tem um processo filho).
    if (session.integrated) return session.commandRunning;
    // Sem integração: há algum processo filho além do próprio shell?
    const descendants = await this.deps.platform.listDescendants(session.pid).catch(() => []);
    return descendants.length > 0;
  }

  /** Encerra o shell e todos os descendentes (capturados antes, para alcançar os que perderem o pai). */
  async kill(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const descendants = await this.deps.platform.listDescendants(session.pid).catch(() => []);
    try {
      session.pty.kill();
    } catch {
      // já encerrado
    }
    await new Promise((r) => setTimeout(r, KILL_GRACE_MS));
    const survivors = descendants.filter(isAlive);
    if (isAlive(session.pid) || survivors.length > 0) {
      await this.deps.platform.killTree(session.pid, survivors);
    }
    this.sessions.delete(sessionId);
  }

  async killAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.kill(id)));
  }

  async restart(sessionId: string, cols: number, rows: number): Promise<SessionInfo> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundError('Sessão não encontrada');
    const { profileId, cwd, projectId, elevation, envProfileId } = session;
    await this.kill(sessionId);
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
      profileId: s.profileId,
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
