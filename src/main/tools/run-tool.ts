import { execFile } from 'node:child_process';
import type { Env } from '../env/env-utils';
import type { PlatformAdapter } from '../platform';

export interface ToolRunResult {
  found: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RunToolOptions {
  cwd: string;
  env: Env;
  timeoutMs?: number;
  extraEnv?: Env;
}

/**
 * Executa uma ferramenta externa (git, node, dotnet...) sem shell, com o ambiente informado e timeout.
 * Nunca lança: ferramenta ausente vira { found: false }.
 */
export async function runTool(
  platform: PlatformAdapter,
  name: string,
  args: string[],
  options: RunToolOptions,
): Promise<ToolRunResult> {
  const env = { ...options.env, ...options.extraEnv };
  const file = await platform.resolveExecutable(name, env);
  if (!file) return { found: false, exitCode: null, stdout: '', stderr: '', timedOut: false };

  let spec;
  try {
    spec = platform.buildSpawn(file, args);
  } catch (err) {
    return { found: true, exitCode: null, stdout: '', stderr: String(err), timedOut: false };
  }

  const timeoutMs = options.timeoutMs ?? 10_000;
  return new Promise((resolve) => {
    let timedOut = false;
    const child = execFile(
      spec.file,
      spec.args,
      {
        cwd: options.cwd,
        env,
        windowsHide: true,
        windowsVerbatimArguments: spec.windowsVerbatimArguments ?? false,
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8',
      },
      (err, stdout, stderr) => {
        clearTimeout(timer);
        const code = err ? (typeof err.code === 'number' ? err.code : null) : 0;
        resolve({ found: true, exitCode: timedOut ? null : code, stdout, stderr, timedOut });
      },
    );
    const timer = setTimeout(() => {
      timedOut = true;
      // Scripts .cmd rodam dentro de um cmd.exe: é preciso encerrar a árvore.
      if (child.pid !== undefined) void platform.killTree(child.pid, []);
      else child.kill();
    }, timeoutMs);
  });
}
