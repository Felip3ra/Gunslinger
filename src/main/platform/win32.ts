import { execFile } from 'node:child_process';
import { access, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import { getVar, type Env } from '../env/env-utils';
import { mergeWindowsEnvironment, parseRegExport } from '../env/windows-registry-env';
import { detectWindowsShells } from '../shells/detect-windows';
import { parseNetstat, parseTasklist } from '@shared/ports';
import type { DetectedShell, PlatformAdapter, SpawnSpec } from './types';

const execFileAsync = promisify(execFile);

const MACHINE_ENV_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';
const USER_ENV_KEY = 'HKCU\\Environment';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function system32(env: Env): string {
  return join(getVar(env, 'SystemRoot') ?? 'C:\\Windows', 'System32');
}

/** Exporta uma chave do registro (UTF-16LE) e devolve o conteúdo; null se a chave não existir. */
export async function regExport(key: string, env: Env): Promise<string | null> {
  const dir = await mkdtemp(join(tmpdir(), 'gunslinger-reg-'));
  const file = join(dir, 'export.reg');
  try {
    await execFileAsync(join(system32(env), 'reg.exe'), ['export', key, file, '/y'], {
      windowsHide: true,
      timeout: 10_000,
    });
    return (await readFile(file)).toString('utf16le');
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function quoteForCmd(arg: string): string {
  // Dentro de "..." o cmd ainda expande %VAR%; aspas internas quebrariam o argumento.
  if (/["%\r\n\0]/.test(arg)) throw new Error(`Argumento não suportado por scripts .cmd: ${arg}`);
  return `"${arg}"`;
}

export const win32Adapter: PlatformAdapter = {
  name: 'win32',
  pathDelimiter: ';',

  async detectShells(env): Promise<DetectedShell[]> {
    return detectWindowsShells({
      env,
      exists,
      readdir: (p) => readdir(p),
      regExport: (key) => regExport(key, env),
      resolveOnPath: (name) => win32Adapter.resolveExecutable(name, env),
      wslListQuiet: async () => {
        try {
          const { stdout } = await execFileAsync(join(system32(env), 'wsl.exe'), ['--list', '--quiet'], {
            windowsHide: true,
            timeout: 10_000,
            encoding: 'buffer',
          });
          return stdout.toString('utf16le');
        } catch {
          return null;
        }
      },
    });
  },

  fallbackShell(env) {
    return {
      id: 'builtin.cmd',
      name: 'Prompt de Comando',
      shellType: 'cmd',
      executable: getVar(env, 'ComSpec') ?? join(system32(env), 'cmd.exe'),
      args: [],
      supportsIntegration: true,
    };
  },

  exportRegistryKey(key) {
    return regExport(key, process.env as Env);
  },

  async readSystemEnvironment(current) {
    const [machine, user] = await Promise.all([regExport(MACHINE_ENV_KEY, current), regExport(USER_ENV_KEY, current)]);
    if (machine === null) throw new Error('Não foi possível ler as variáveis de ambiente do sistema.');
    return mergeWindowsEnvironment(current, parseRegExport(machine), user ? parseRegExport(user) : []);
  },

  async resolveExecutable(name, env) {
    const pathExt = (getVar(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .filter(Boolean)
      .map((e) => e.toLowerCase());
    const candidates = (base: string): string[] =>
      extname(base) && pathExt.includes(extname(base).toLowerCase()) ? [base] : pathExt.map((e) => base + e);

    if (isAbsolute(name) || name.includes('\\') || name.includes('/')) {
      for (const c of candidates(name)) if (await exists(c)) return c;
      return null;
    }
    const dirs = (getVar(env, 'Path') ?? '').split(';').filter(Boolean);
    for (const dir of dirs) {
      for (const c of candidates(join(dir.replace(/^"|"$/g, ''), name))) if (await exists(c)) return c;
    }
    return null;
  },

  buildSpawn(file, args): SpawnSpec {
    const ext = extname(file).toLowerCase();
    if (ext !== '.cmd' && ext !== '.bat') return { file, args };
    const line = [file, ...args].map(quoteForCmd).join(' ');
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true };
  },

  async listListeningPorts() {
    const run = (file: string, args: string[]): Promise<string> =>
      execFileAsync(join(system32(process.env as Env), file), args, { windowsHide: true, timeout: 10_000, maxBuffer: 16 * 1024 * 1024 }).then(
        (r) => r.stdout,
        () => '',
      );
    const [v4, v6, tasks] = await Promise.all([run('NETSTAT.EXE', ['-ano', '-p', 'TCP']), run('NETSTAT.EXE', ['-ano', '-p', 'TCPv6']), run('tasklist.exe', ['/FO', 'CSV', '/NH'])]);
    const names = parseTasklist(tasks);
    return parseNetstat(`${v4}\n${v6}`).map((p) => ({ ...p, processName: names.get(p.pid) ?? null }));
  },

  async listDescendants(pid) {
    const { getProcessTree } = await import('@vscode/windows-process-tree');
    return new Promise((resolve) => {
      getProcessTree(pid, (tree) => {
        const out: number[] = [];
        const walk = (node: { pid: number; children: unknown[] } | undefined): void => {
          if (!node) return;
          for (const child of node.children as { pid: number; children: unknown[] }[]) {
            out.push(child.pid);
            walk(child);
          }
        };
        walk(tree);
        resolve(out);
      });
    });
  },

  async killTree(pid, descendants) {
    const taskkill = join(system32(process.env as Env), 'taskkill.exe');
    const run = (args: string[]): Promise<void> =>
      execFileAsync(taskkill, args, { windowsHide: true, timeout: 10_000 }).then(
        () => undefined,
        () => undefined, // processo já encerrado
      );
    await run(['/PID', String(pid), '/T', '/F']);
    // Descendentes podem ter perdido o pai (ex.: node iniciado por npm.cmd) e escapar do /T.
    await Promise.all(descendants.map((d) => run(['/PID', String(d), '/F'])));
  },
};
