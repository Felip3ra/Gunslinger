import { readdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface Relevance {
  /** Pasta mais próxima (da atual para cima) com package.json, ou null. */
  nodeDir: string | null;
  /** Pasta mais próxima com .sln, .slnx, .csproj ou global.json, ou null. */
  dotnetDir: string | null;
}

export const isNodeMarker = (name: string): boolean => name.toLowerCase() === 'package.json';
export const isDotnetMarker = (name: string): boolean => /\.(sln|slnx|csproj)$/i.test(name) || name.toLowerCase() === 'global.json';

/** Sobe da pasta atual até a raiz do disco procurando os marcadores de Node e .NET. */
export async function findRelevance(cwd: string, list: (dir: string) => Promise<string[]> = (d) => readdir(d)): Promise<Relevance> {
  const result: Relevance = { nodeDir: null, dotnetDir: null };
  let dir = cwd;
  for (;;) {
    let names: string[] = [];
    try {
      names = await list(dir);
    } catch {
      // sem acesso: continua subindo
    }
    if (!result.nodeDir && names.some(isNodeMarker)) result.nodeDir = dir;
    if (!result.dotnetDir && names.some(isDotnetMarker)) result.dotnetDir = dir;
    if (result.nodeDir && result.dotnetDir) return result;
    const parent = dirname(dir);
    if (parent === dir) return result;
    dir = parent;
  }
}
