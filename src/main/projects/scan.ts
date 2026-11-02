import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const IGNORED_DIRS = new Set(['bin', 'obj', 'node_modules']);
export const MAX_DEPTH = 4;

export interface ScanResult {
  /** Caminhos relativos à raiz, com '/'. */
  solutions: string[];
  csprojs: string[];
  packageJsonDirs: string[];
}

const toRel = (root: string, path: string): string => relative(root, path).replace(/\\/g, '/');

/**
 * Percorre a pasta uma única vez (busca em largura, até 4 níveis abaixo da raiz),
 * ignorando bin, obj, node_modules e pastas ocultas. O AbortSignal cancela a varredura.
 */
export async function scanProject(root: string, signal?: AbortSignal): Promise<ScanResult> {
  const result: ScanResult = { solutions: [], csprojs: [], packageJsonDirs: [] };
  let level: string[] = [root];
  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      if (signal?.aborted) throw new Error('Análise cancelada');
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue; // sem permissão ou removida durante a varredura
      }
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.startsWith('.') && !IGNORED_DIRS.has(entry.name.toLowerCase())) next.push(full);
          continue;
        }
        const lower = entry.name.toLowerCase();
        if (lower.endsWith('.sln') || lower.endsWith('.slnx')) result.solutions.push(toRel(root, full));
        else if (lower.endsWith('.csproj')) result.csprojs.push(toRel(root, full));
        else if (lower === 'package.json') result.packageJsonDirs.push(toRel(root, dir));
      }
    }
    level = next;
  }
  for (const list of Object.values(result)) list.sort();
  return result;
}
