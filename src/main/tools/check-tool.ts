import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ToolName } from '@shared/ipc-contract';
import type { ToolStatus } from '@shared/model';
import type { Env } from '../env/env-utils';
import type { PlatformAdapter } from '../platform/types';
import { runTool } from './run-tool';

/** Procura .config/dotnet-tools.json da pasta para cima e diz se ele declara o dotnet-ef. */
async function localManifestHasDotnetEf(cwd: string): Promise<boolean> {
  let dir = cwd;
  for (;;) {
    try {
      const manifest = JSON.parse(await readFile(join(dir, '.config', 'dotnet-tools.json'), 'utf8')) as { tools?: Record<string, unknown> };
      if (manifest.tools && Object.keys(manifest.tools).some((t) => t.toLowerCase() === 'dotnet-ef')) return true;
    } catch {
      // sem manifesto nesta pasta
    }
    const parent = dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

const firstLine = (s: string): string => s.trim().split(/\r?\n/)[0]?.trim() ?? '';

export async function checkTool(platform: PlatformAdapter, env: Env, tool: ToolName, cwd: string): Promise<ToolStatus> {
  const opts = { cwd, env, timeoutMs: 10_000 };
  switch (tool) {
    case 'dotnet': {
      const r = await runTool(platform, 'dotnet', ['--version'], opts);
      return r.exitCode === 0 ? { found: true, version: firstLine(r.stdout) } : { found: false, detail: r.found ? 'nenhum SDK do .NET instalado' : 'dotnet não está no PATH' };
    }
    case 'dotnet-ef': {
      const sdk = await runTool(platform, 'dotnet', ['--version'], opts);
      if (sdk.exitCode !== 0) return { found: false, detail: '.NET SDK não encontrado' };
      const global = await runTool(platform, 'dotnet', ['tool', 'list', '--global'], opts);
      if (/^\s*dotnet-ef\s/im.test(global.stdout)) return { found: true, detail: 'global' };
      if (await localManifestHasDotnetEf(cwd)) return { found: true, detail: 'manifesto local' };
      return { found: false, detail: 'dotnet-ef não encontrado' };
    }
    case 'node':
    case 'npm':
    case 'yarn':
    case 'pnpm': {
      const r = await runTool(platform, tool, tool === 'node' ? ['-v'] : ['--version'], opts);
      return r.exitCode === 0 ? { found: true, version: firstLine(r.stdout) } : { found: false };
    }
  }
}
