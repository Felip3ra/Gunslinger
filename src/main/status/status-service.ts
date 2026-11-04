import { watch, type FSWatcher } from 'node:fs';
import type { EventMap } from '@shared/ipc-contract';
import type { ProjectsFile, StatusInfo } from '@shared/model';
import type { EnvironmentService } from '../env/environment-service';
import type { PlatformAdapter } from '../platform/types';
import type { SessionInfo } from '../pty/pty-manager';
import { GitStatusProvider, type RepoLocation } from './git-status-provider';
import { ToolVersionProvider } from './tool-version-provider';

const WATCH_DEBOUNCE_MS = 300;
/** Pastas da árvore de trabalho cujas mudanças não interessam (o git dir já é observado à parte). */
const IGNORED_WORKTREE = /(^|\/)(\.git|node_modules|bin|obj)(\/|$)/i;

interface Repo {
  location: RepoLocation;
  sessions: Set<string>;
  watchers: FSWatcher[];
  timer: NodeJS.Timeout | null;
  running: boolean;
  pending: boolean;
}

interface SessionEntry {
  info: SessionInfo;
  repoKey: string | null;
  wasRunning: boolean;
}

export interface StatusDeps {
  platform: PlatformAdapter;
  env: EnvironmentService;
  send: <K extends keyof EventMap>(channel: K, payload: EventMap[K]) => void;
  projects: () => ProjectsFile;
}

/**
 * Coordena a barra de status: decide quando recalcular (pasta, fim de comando, troca de aba,
 * ambiente, mudanças no repositório) e publica o resultado. As consultas ficam nos provedores.
 */
export class StatusService {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly repos = new Map<string, Repo>();
  private readonly git: GitStatusProvider;
  private readonly versions: ToolVersionProvider;

  constructor(private readonly deps: StatusDeps) {
    this.git = new GitStatusProvider(deps.platform, () => deps.env.current().env);
    this.versions = new ToolVersionProvider(deps.platform, () => deps.env.current());
    deps.env.onChange(() => {
      this.versions.invalidate();
      for (const id of this.sessions.keys()) void this.refresh(id, true);
    });
  }

  onSessionEvent(info: SessionInfo, event: 'created' | 'state' | 'exit'): void {
    // Sessões SSH: a pasta é remota; Git e versões locais não se aplicam (a barra mostra usuário@host).
    if (info.kind === 'ssh') return;
    if (event === 'exit') {
      this.drop(info.id);
      return;
    }
    const current = this.sessions.get(info.id);
    const cwdChanged = !current || current.info.cwd !== info.cwd;
    const commandFinished = !!current?.wasRunning && !info.commandRunning;
    const entry = current ?? { info, repoKey: null, wasRunning: false };
    entry.info = info;
    entry.wasRunning = info.commandRunning;
    this.sessions.set(info.id, entry);
    // O fim de um comando pode ter trocado de branch ou de versão (nvm, Volta): recalcula.
    if (cwdChanged || commandFinished) {
      if (commandFinished) this.versions.invalidate();
      void this.refresh(info.id, cwdChanged);
    }
  }

  activate(sessionId: string | null): void {
    if (sessionId && this.sessions.has(sessionId)) void this.refresh(sessionId, false);
  }

  private drop(sessionId: string): void {
    const entry = this.sessions.get(sessionId);
    if (entry?.repoKey) this.detachRepo(entry.repoKey, sessionId);
    this.sessions.delete(sessionId);
  }

  private async refresh(sessionId: string, relocate: boolean): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    const cwd = entry.info.cwd;
    if (relocate || entry.repoKey === null) {
      const location = await this.git.locate(cwd);
      const key = location ? location.gitDir.toLowerCase() : null;
      if (entry.repoKey && entry.repoKey !== key) this.detachRepo(entry.repoKey, sessionId);
      if (key && location && entry.repoKey !== key) this.attachRepo(key, location, sessionId);
      entry.repoKey = key;
    }
    const project = entry.info.projectId ? this.deps.projects().projects.find((p) => p.id === entry.info.projectId) : undefined;
    const [git, versions] = await Promise.all([entry.repoKey ? this.git.status(cwd) : null, this.versions.versions(cwd, project)]);
    if (this.sessions.get(sessionId) !== entry) return; // sessão encerrada no meio
    const status: StatusInfo = { cwd, git, ...versions };
    this.deps.send('status:changed', { sessionId, status });
  }

  // ---------- observação do repositório ----------

  private attachRepo(key: string, location: RepoLocation, sessionId: string): void {
    let repo = this.repos.get(key);
    if (!repo) {
      repo = { location, sessions: new Set(), watchers: [], timer: null, running: false, pending: false };
      this.repos.set(key, repo);
      if (!location.remote) this.watchRepo(repo);
    }
    repo.sessions.add(sessionId);
  }

  private detachRepo(key: string, sessionId: string): void {
    const repo = this.repos.get(key);
    if (!repo) return;
    repo.sessions.delete(sessionId);
    if (repo.sessions.size > 0) return;
    this.closeRepo(repo);
    this.repos.delete(key);
  }

  private watchRepo(repo: Repo): void {
    const trigger = (filename: string): void => {
      // index.lock e arquivos temporários mudam o tempo todo durante operações do git.
      if (/\.lock$/i.test(filename)) return;
      if (repo.timer) clearTimeout(repo.timer);
      repo.timer = setTimeout(() => void this.refreshRepo(repo), WATCH_DEBOUNCE_MS);
    };
    const { gitDir, toplevel } = repo.location;
    try {
      repo.watchers.push(watch(gitDir, (_e, f) => trigger(f?.toString() ?? '')));
      repo.watchers.push(watch(`${gitDir}\\refs`, { recursive: true }, (_e, f) => trigger(f?.toString() ?? '')));
      // Arquivos salvos por outros programas (VS Code) só mudam a árvore de trabalho.
      if (toplevel) {
        repo.watchers.push(
          watch(toplevel, { recursive: true }, (_e, f) => {
            const path = f?.toString().replace(/\\/g, '/') ?? '';
            if (!IGNORED_WORKTREE.test(path)) trigger(path);
          }),
        );
      }
    } catch {
      // sem observação: o status ainda é atualizado por troca de pasta, aba e fim de comando
    }
  }

  /** No máximo uma consulta por repositório em andamento; pedidos que chegam no meio são agrupados. */
  private async refreshRepo(repo: Repo): Promise<void> {
    if (repo.running) {
      repo.pending = true;
      return;
    }
    repo.running = true;
    try {
      await Promise.all([...repo.sessions].map((id) => this.refresh(id, false)));
    } finally {
      repo.running = false;
      if (repo.pending) {
        repo.pending = false;
        void this.refreshRepo(repo);
      }
    }
  }

  private closeRepo(repo: Repo): void {
    for (const w of repo.watchers) w.close();
    if (repo.timer) clearTimeout(repo.timer);
  }

  dispose(): void {
    for (const repo of this.repos.values()) this.closeRepo(repo);
    this.repos.clear();
  }
}
