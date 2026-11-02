import { win32 as path } from 'node:path';
import { getVar, type Env } from '../env/env-utils';
import { parseRegExportSections } from '../env/windows-registry-env';
import type { DetectedShell } from '../platform/types';

/** Acesso ao sistema usado pela detecção; injetado para permitir testes com fakes. */
export interface DetectDeps {
  env: Env;
  exists(path: string): Promise<boolean>;
  readdir(path: string): Promise<string[]>;
  /** Conteúdo de `reg export` da chave (UTF-16 já decodificado) ou null. */
  regExport(key: string): Promise<string | null>;
  resolveOnPath(name: string): Promise<string | null>;
  /** Saída de `wsl.exe --list --quiet` já decodificada, ou null se falhar. */
  wslListQuiet(): Promise<string | null>;
}

const join = path.join;
const systemRoot = (env: Env): string => getVar(env, 'SystemRoot') ?? 'C:\\Windows';

async function firstExisting(deps: DetectDeps, candidates: (string | null | undefined)[]): Promise<string | null> {
  for (const c of candidates) if (c && (await deps.exists(c))) return c;
  return null;
}

function compareVersionDirs(a: string, b: string): number {
  const nums = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);
  const [x, y] = [nums(a), nums(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  // Versões estáveis antes de preview com o mesmo número.
  return Number(b.includes('preview')) - Number(a.includes('preview'));
}

export async function detectWindowsPowerShell(deps: DetectDeps): Promise<DetectedShell | null> {
  const exe = join(systemRoot(deps.env), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (!(await deps.exists(exe))) return null;
  return { id: 'builtin.powershell', name: 'Windows PowerShell', shellType: 'powershell', executable: exe, args: ['-NoLogo'], supportsIntegration: true };
}

export async function detectPwsh(deps: DetectDeps): Promise<DetectedShell | null> {
  const candidates: string[] = [];
  for (const pf of [getVar(deps.env, 'ProgramFiles'), getVar(deps.env, 'ProgramW6432')]) {
    if (!pf) continue;
    const root = join(pf, 'PowerShell');
    const versions = (await deps.readdir(root).catch(() => [] as string[])).sort(compareVersionDirs).reverse();
    candidates.push(...versions.map((v) => join(root, v, 'pwsh.exe')));
  }
  const local = getVar(deps.env, 'LOCALAPPDATA');
  if (local) candidates.push(join(local, 'Microsoft', 'WindowsApps', 'pwsh.exe'));
  const home = getVar(deps.env, 'USERPROFILE');
  if (home) candidates.push(join(home, '.dotnet', 'tools', 'pwsh.exe'));
  const exe = (await firstExisting(deps, candidates)) ?? (await deps.resolveOnPath('pwsh.exe'));
  if (!exe) return null;
  return { id: 'builtin.pwsh', name: 'PowerShell', shellType: 'pwsh', executable: exe, args: ['-NoLogo'], supportsIntegration: true };
}

export function detectCmd(deps: DetectDeps): DetectedShell {
  const exe = getVar(deps.env, 'ComSpec') ?? join(systemRoot(deps.env), 'System32', 'cmd.exe');
  return { id: 'builtin.cmd', name: 'Prompt de Comando', shellType: 'cmd', executable: exe, args: [], supportsIntegration: true };
}

/** Raiz da instalação do Git a partir de um git.exe (cmd\, bin\ ou mingw64\bin\). */
export function gitRootFromGitExe(gitExe: string): string {
  const dir = path.dirname(gitExe);
  const parent = path.basename(dir).toLowerCase();
  if (parent === 'bin' && path.basename(path.dirname(dir)).toLowerCase() === 'mingw64') return path.dirname(path.dirname(dir));
  return path.dirname(dir);
}

export async function detectGitBash(deps: DetectDeps): Promise<DetectedShell | null> {
  const roots: (string | null | undefined)[] = [];
  for (const hive of ['HKLM', 'HKCU']) {
    const exported = await deps.regExport(`${hive}\\SOFTWARE\\GitForWindows`);
    if (!exported) continue;
    const installPath = parseRegExportSections(exported)
      .flatMap((s) => s.values)
      .find((v) => v.name === 'InstallPath');
    roots.push(installPath?.value);
  }
  const pf = getVar(deps.env, 'ProgramFiles');
  const pf86 = getVar(deps.env, 'ProgramFiles(x86)');
  const local = getVar(deps.env, 'LOCALAPPDATA');
  const home = getVar(deps.env, 'USERPROFILE');
  roots.push(
    pf && join(pf, 'Git'),
    pf86 && join(pf86, 'Git'),
    local && join(local, 'Programs', 'Git'),
    home && join(home, 'scoop', 'apps', 'git', 'current'),
  );
  const gitOnPath = await deps.resolveOnPath('git.exe');
  if (gitOnPath) roots.push(gitRootFromGitExe(gitOnPath));

  const bash = await firstExisting(
    deps,
    roots.map((r) => (r ? join(r, 'bin', 'bash.exe') : null)),
  );
  if (!bash) return null;
  return { id: 'builtin.gitbash', name: 'Git Bash', shellType: 'gitbash', executable: bash, args: [], supportsIntegration: true };
}

export function parseLxssDistros(exported: string): string[] {
  const names: string[] = [];
  for (const section of parseRegExportSections(exported)) {
    const name = section.values.find((v) => v.name === 'DistributionName')?.value;
    if (name) names.push(name);
  }
  return names;
}

export function parseWslListQuiet(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((l) => l.replace(/\0/g, '').trim())
    .filter(Boolean);
}

export async function detectWsl(deps: DetectDeps): Promise<DetectedShell[]> {
  const wslExe = join(systemRoot(deps.env), 'System32', 'wsl.exe');
  if (!(await deps.exists(wslExe))) return [];
  const lxss = await deps.regExport('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss');
  let distros = lxss ? parseLxssDistros(lxss) : [];
  if (distros.length === 0) {
    const listed = await deps.wslListQuiet();
    distros = listed ? parseWslListQuiet(listed) : [];
  }
  return distros
    .filter((d) => !/^docker-desktop/i.test(d))
    .map((distro) => ({
      id: `builtin.wsl.${distro}`,
      name: `WSL: ${distro}`,
      shellType: 'wsl' as const,
      executable: wslExe,
      args: ['-d', distro],
      wslDistro: distro,
      supportsIntegration: true,
    }));
}

/** Detecta todos os shells em paralelo; um detector com erro não afeta os outros. */
export async function detectWindowsShells(deps: DetectDeps): Promise<DetectedShell[]> {
  const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
  const [pwsh, powershell, gitbash, wsl] = await Promise.all([
    safe(detectPwsh(deps), null),
    safe(detectWindowsPowerShell(deps), null),
    safe(detectGitBash(deps), null),
    safe(detectWsl(deps), [] as DetectedShell[]),
  ]);
  return [pwsh, powershell, detectCmd(deps), gitbash, ...wsl].filter((s): s is DetectedShell => s !== null);
}

