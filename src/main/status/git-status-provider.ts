import type { GitStatus } from '@shared/model';
import type { Env } from '../env/env-utils';
import type { PlatformAdapter } from '../platform/types';
import { runTool } from '../tools/run-tool';
import { parseGitStatusV2 } from './git-parse';

const GIT_TIMEOUT_MS = 5000;
export const WSL_UNC = /^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(\\.*)?$/i;

export interface RepoLocation {
  gitDir: string;
  /** Raiz da árvore de trabalho; null quando não é observável pelo Windows (WSL). */
  toplevel: string | null;
  /** true quando o git dir fica dentro do WSL (não dá para observar com fs.watch). */
  remote: boolean;
}

/** Consultas ao Git (Windows ou, para pastas do WSL, o git da distribuição), com timeout. */
export class GitStatusProvider {
  constructor(
    private readonly platform: PlatformAdapter,
    private readonly env: () => Env,
  ) {}

  private spec(cwd: string, args: string[]): { tool: string; args: string[]; cwd: string } {
    const wsl = WSL_UNC.exec(cwd);
    if (wsl) {
      // Git do Windows sobre \\wsl.localhost é lento e esbarra em safe.directory: usa o git da distribuição.
      return { tool: 'wsl.exe', args: ['-d', wsl[1]!, '--', 'git', '-C', (wsl[2] ?? '/').replace(/\\/g, '/'), ...args], cwd: 'C:\\' };
    }
    return { tool: 'git', args: ['-C', cwd, ...args], cwd };
  }

  private run(cwd: string, args: string[]) {
    const s = this.spec(cwd, args);
    return runTool(this.platform, s.tool, s.args, { cwd: s.cwd, env: this.env(), extraEnv: { GIT_OPTIONAL_LOCKS: '0' }, timeoutMs: GIT_TIMEOUT_MS });
  }

  async locate(cwd: string): Promise<RepoLocation | null> {
    const r = await this.run(cwd, ['rev-parse', '--absolute-git-dir', '--show-toplevel']);
    if (r.exitCode !== 0) return null;
    const [dir = '', top] = r.stdout.trim().split(/\r?\n/);
    if (dir.startsWith('/')) return { gitDir: `${cwd}|wsl:${dir}`, toplevel: null, remote: true };
    const toWin = (p: string): string => p.replace(/\//g, '\\');
    return { gitDir: toWin(dir), toplevel: top ? toWin(top) : null, remote: false };
  }

  /** Status completo; com timeout (repositório grande), devolve só a branch. */
  async status(cwd: string): Promise<GitStatus | null> {
    const r = await this.run(cwd, ['status', '--porcelain=v2', '--branch', '--untracked-files=normal']);
    if (r.exitCode === 0) return parseGitStatusV2(r.stdout);
    if (!r.timedOut) return null;
    const h = await this.run(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']);
    return h.exitCode === 0 ? { branch: h.stdout.trim(), detachedSha: null, dirty: false, partial: true } : null;
  }
}
