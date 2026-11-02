import { access } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { NodePackage, PackageManager } from '@shared/model';

const LOCKFILES: [string, PackageManager][] = [
  ['package-lock.json', 'npm'],
  ['yarn.lock', 'yarn'],
  ['pnpm-lock.yaml', 'pnpm'],
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Pastas do pacote até a raiz do projeto (inclusive), da mais próxima para a mais distante. */
function ancestorsUpToRoot(root: string, dir: string): string[] {
  const out: string[] = [];
  let current = resolve(dir);
  const top = resolve(root);
  for (;;) {
    out.push(current);
    if (current.toLowerCase() === top.toLowerCase()) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return out;
}

interface PmResolution {
  packageManager: PackageManager;
  source: NodePackage['packageManagerSource'];
  yarnBerry: boolean;
  warnings: string[];
}

/** override → campo packageManager → arquivo de lock (subindo até a raiz) → npm. */
export async function resolvePackageManager(
  root: string,
  dir: string,
  packageManagerField: unknown,
  override: PackageManager | undefined,
): Promise<PmResolution> {
  const warnings: string[] = [];
  const dirs = ancestorsUpToRoot(root, dir);
  const hasYarnrcYml = async (): Promise<boolean> => {
    for (const d of dirs) if (await exists(join(d, '.yarnrc.yml'))) return true;
    return false;
  };

  const field = typeof packageManagerField === 'string' ? /^(npm|yarn|pnpm)@(\d+)/.exec(packageManagerField) : null;
  const yarnBerryFromField = field?.[1] === 'yarn' ? Number(field[2]) >= 2 : null;

  if (override) {
    return { packageManager: override, source: 'override', yarnBerry: override === 'yarn' && (yarnBerryFromField ?? (await hasYarnrcYml())), warnings };
  }
  if (field) {
    const pm = field[1] as PackageManager;
    return { packageManager: pm, source: 'packageManager-field', yarnBerry: pm === 'yarn' && !!yarnBerryFromField, warnings };
  }
  for (const d of dirs) {
    const found: PackageManager[] = [];
    for (const [file, pm] of LOCKFILES) if (await exists(join(d, file))) found.push(pm);
    if (found.length === 1) {
      const pm = found[0]!;
      return { packageManager: pm, source: 'lockfile', yarnBerry: pm === 'yarn' && (await hasYarnrcYml()), warnings };
    }
    if (found.length > 1) {
      warnings.push('Vários arquivos de lock encontrados: escolha o gerenciador');
      return { packageManager: 'npm', source: 'default', yarnBerry: false, warnings };
    }
  }
  return { packageManager: 'npm', source: 'default', yarnBerry: false, warnings };
}

/** Vitest ou Jest, quando o pacote tem script `test` e o framework nas dependências. */
export function detectTestFramework(json: Record<string, unknown>, scripts: Record<string, string>): 'vitest' | 'jest' | null {
  const test = scripts['test'];
  if (!test) return null;
  const deps = { ...(json['dependencies'] as object | undefined), ...(json['devDependencies'] as object | undefined) } as Record<string, unknown>;
  if ('vitest' in deps || /\bvitest\b/.test(test)) return 'vitest';
  if ('jest' in deps || /\bjest\b/.test(test)) return 'jest';
  return null;
}

/** Lê um pacote; com package.json inválido, mantém os scripts de `previous` marcados como desatualizados. */
export async function analyzePackage(
  root: string,
  relDir: string,
  override: PackageManager | undefined,
  previous?: NodePackage,
): Promise<NodePackage> {
  const dir = join(root, relDir);
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>;
    if (typeof json !== 'object' || json === null || Array.isArray(json)) throw new Error('não é um objeto JSON');
  } catch (err) {
    const pm = await resolvePackageManager(root, dir, undefined, override);
    return {
      dir: relDir,
      name: previous?.name ?? null,
      scripts: previous?.scripts ?? {},
      packageManager: pm.packageManager,
      packageManagerSource: pm.source,
      yarnBerry: pm.yarnBerry,
      testFramework: previous?.testFramework ?? null,
      warnings: pm.warnings,
      stale: !!previous,
      error: `package.json inválido: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const scripts: Record<string, string> = {};
  if (typeof json['scripts'] === 'object' && json['scripts'] !== null) {
    for (const [k, v] of Object.entries(json['scripts'] as Record<string, unknown>)) if (typeof v === 'string') scripts[k] = v;
  }
  const pm = await resolvePackageManager(root, dir, json['packageManager'], override);
  return {
    dir: relDir,
    name: typeof json['name'] === 'string' ? json['name'] : null,
    scripts,
    packageManager: pm.packageManager,
    packageManagerSource: pm.source,
    yarnBerry: pm.yarnBerry,
    testFramework: detectTestFramework(json, scripts),
    warnings: pm.warnings,
    stale: false,
    error: null,
  };
}
