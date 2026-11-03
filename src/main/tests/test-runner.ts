import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PackageManager } from '@shared/model';
import { filterArgs, parseJestJson, parseTrx, type TestRunResult, type TestTarget } from '@shared/test-results';
import type { Env } from '../env/env-utils';
import type { PlatformAdapter } from '../platform/types';

export interface TestRunFinished {
  runId: string;
  result: TestRunResult | null;
  error: string | null;
  cancelled: boolean;
}

export interface TestRunnerDeps {
  platform: PlatformAdapter;
  env(): Env;
  /** Gerenciador de pacotes de um pacote Node (pasta relativa à raiz). */
  packageManager(root: string, dir: string): Promise<PackageManager>;
  onOutput(runId: string, data: string): void;
  onFinished(event: TestRunFinished): void;
}

/** Linha de comando do executor para o alvo, gravando o resultado em `resultFile`. */
export function testCommand(target: TestTarget, pm: PackageManager, resultDir: string, resultFile: string, filter: string[]): { tool: string; args: string[] } {
  if (target.kind === 'dotnet') {
    return {
      tool: 'dotnet',
      args: ['test', target.project, '--logger', `trx;LogFileName=${resultFile}`, '--results-directory', resultDir, ...filterArgs(target, filter)],
    };
  }
  const outputFile = join(resultDir, resultFile);
  const reporter = target.framework === 'vitest' ? ['--run', '--reporter=json', `--outputFile=${outputFile}`] : ['--json', `--outputFile=${outputFile}`];
  // npm precisa de "--" para repassar argumentos ao script; yarn, pnpm e bun repassam direto.
  return { tool: pm, args: pm === 'npm' ? ['run', 'test', '--', ...reporter, ...filterArgs(target, filter)] : ['run', 'test', ...reporter, ...filterArgs(target, filter)] };
}

interface Running {
  pid: number | undefined;
  cancelled: boolean;
}

/** Roda testes fora do terminal e devolve resultados estruturados (TRX no .NET, JSON no Vitest/Jest). */
export class TestRunnerService {
  private readonly runs = new Map<string, Running>();

  constructor(private readonly deps: TestRunnerDeps) {}

  async run(root: string, target: TestTarget, filter: string[] = []): Promise<string> {
    const runId = randomUUID();
    const resultDir = await mkdtemp(join(tmpdir(), 'gunslinger-tests-'));
    const resultFile = target.kind === 'dotnet' ? `${runId}.trx` : `${runId}.json`;
    const cwd = target.kind === 'node' && target.dir ? join(root, target.dir) : root;
    const pm = target.kind === 'node' ? await this.deps.packageManager(root, target.dir) : 'npm';
    const { tool, args } = testCommand(target, pm, resultDir, resultFile, filter);
    const env = this.deps.env();
    const file = await this.deps.platform.resolveExecutable(tool, env);
    if (!file) {
      queueMicrotask(() => this.deps.onFinished({ runId, result: null, error: `${tool} não encontrado no PATH.`, cancelled: false }));
      return runId;
    }
    const spec = this.deps.platform.buildSpawn(file, args);
    const child = spawn(spec.file, spec.args, { cwd, env, windowsHide: true, windowsVerbatimArguments: spec.windowsVerbatimArguments ?? false });
    const running: Running = { pid: child.pid, cancelled: false };
    this.runs.set(runId, running);
    this.deps.onOutput(runId, `> ${tool} ${args.join(' ')}\n`);
    child.stdout.setEncoding('utf8').on('data', (d: string) => this.deps.onOutput(runId, d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => this.deps.onOutput(runId, d));
    child.on('error', (err) => this.finish(runId, resultDir, null, err.message));
    child.on('close', () => void this.collect(runId, target, resultDir, resultFile));
    return runId;
  }

  private async collect(runId: string, target: TestTarget, resultDir: string, resultFile: string): Promise<void> {
    if (this.runs.get(runId)?.cancelled) return this.finish(runId, resultDir, null, null);
    try {
      const content = await readFile(join(resultDir, resultFile), 'utf8');
      await this.finish(runId, resultDir, target.kind === 'dotnet' ? parseTrx(content) : parseJestJson(content), null);
    } catch {
      await this.finish(runId, resultDir, null, 'Resultado não disponível: veja a saída.');
    }
  }

  private async finish(runId: string, resultDir: string, result: TestRunResult | null, error: string | null): Promise<void> {
    const running = this.runs.get(runId);
    if (!running) return;
    this.runs.delete(runId);
    await rm(resultDir, { recursive: true, force: true }).catch(() => undefined);
    this.deps.onFinished({ runId, result: running.cancelled ? null : result, error: running.cancelled ? null : error, cancelled: running.cancelled });
  }

  async cancel(runId: string): Promise<void> {
    const running = this.runs.get(runId);
    if (!running || running.pid === undefined) return;
    running.cancelled = true;
    const descendants = await this.deps.platform.listDescendants(running.pid).catch(() => []);
    await this.deps.platform.killTree(running.pid, descendants);
  }
}
