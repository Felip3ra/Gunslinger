import type { Project, VersionInfo } from '@shared/model';
import type { Env } from '../env/env-utils';
import type { PlatformAdapter } from '../platform/types';
import { runTool } from '../tools/run-tool';
import { WSL_UNC } from './git-status-provider';
import { findRelevance } from './relevance';

const TIMEOUT_MS = 5000;

/** Versões de Node e .NET relevantes para uma pasta, com cache por pasta-marcador e geração do ambiente. */
export class ToolVersionProvider {
  private readonly cache = new Map<string, string | null>();

  constructor(
    private readonly platform: PlatformAdapter,
    private readonly env: () => { env: Env; generation: number },
  ) {}

  invalidate(): void {
    this.cache.clear();
  }

  async versions(cwd: string, project: Project | undefined): Promise<{ node: VersionInfo; dotnet: VersionInfo }> {
    if (WSL_UNC.test(cwd)) return { node: null, dotnet: null }; // ferramentas do Linux não são consultadas no MVP
    const rel = await findRelevance(cwd);
    const nodeRelevant = !!project?.types.node || rel.nodeDir !== null;
    const dotnetRelevant = !!project?.types.dotnet || rel.dotnetDir !== null;
    const [node, dotnet] = await Promise.all([
      nodeRelevant ? this.version('node', ['-v'], cwd, rel.nodeDir ?? cwd) : null,
      dotnetRelevant ? this.version('dotnet', ['--version'], cwd, rel.dotnetDir ?? cwd) : null,
    ]);
    return { node: nodeRelevant ? { version: node } : null, dotnet: dotnetRelevant ? { version: dotnet } : null };
  }

  /** Executa na pasta da aba (respeita global.json e os shims do Volta). */
  private async version(tool: string, args: string[], cwd: string, cacheDir: string): Promise<string | null> {
    const { env, generation } = this.env();
    const key = `${generation}|${tool}|${cacheDir.toLowerCase()}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const r = await runTool(this.platform, tool, args, { cwd, env, timeoutMs: TIMEOUT_MS });
    const version = r.exitCode === 0 ? (r.stdout.trim().split(/\r?\n/)[0] ?? null) : null;
    this.cache.set(key, version);
    return version;
  }
}
