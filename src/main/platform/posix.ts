import { execFile } from 'node:child_process';
import { access, constants, readFile } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import { getVar, type Env } from '../env/env-utils';
import { detectPosixShells } from '../shells/detect-posix';
import type { PlatformAdapter } from './types';

type ListeningPort = { address: string; port: number; pid: number; processName: string | null };

const ENV_MARK = '__GUNSLINGER_ENV__';

function run(file: string, args: string[], options: { env?: Env; timeout?: number } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: options.timeout ?? 10_000, maxBuffer: 16 * 1024 * 1024, ...(options.env ? { env: options.env } : {}) }, (err, stdout) =>
      resolve(err ? null : stdout.toString()),
    );
  });
}

async function resolveExecutable(name: string, env: Env): Promise<string | null> {
  const candidates =
    isAbsolute(name) || name.includes('/')
      ? [name]
      : (getVar(env, 'PATH') ?? '')
          .split(':')
          .filter(Boolean)
          .map((d) => join(d, name));
  for (const c of candidates) {
    try {
      await access(c, constants.X_OK);
      return c;
    } catch {
      // tenta o próximo
    }
  }
  return null;
}

/** "127.0.0.1:5270", "*:80", "[::1]:5432" → endereço e porta. */
function splitEndpoint(endpoint: string): { address: string; port: number } | null {
  const at = endpoint.lastIndexOf(':');
  const port = Number(endpoint.slice(at + 1));
  if (at < 0 || !Number.isInteger(port) || port <= 0) return null;
  const host = endpoint.slice(0, at).replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  return { address: host === '*' || host === '' ? '0.0.0.0' : host, port };
}

/** Saída de `lsof -nP -iTCP -sTCP:LISTEN -F pcn`: campos p (pid), c (comando) e n (endereço) por linha. */
export function parseLsofListening(output: string): ListeningPort[] {
  const ports: ListeningPort[] = [];
  const seen = new Set<string>();
  let pid = 0;
  let name: string | null = null;
  for (const line of output.split('\n')) {
    const value = line.slice(1);
    if (line.startsWith('p')) {
      pid = Number(value);
      name = null;
    } else if (line.startsWith('c')) {
      name = value;
    } else if (line.startsWith('n')) {
      const endpoint = splitEndpoint(value);
      const key = `${pid}|${value}`;
      if (!endpoint || !pid || seen.has(key)) continue;
      seen.add(key);
      ports.push({ ...endpoint, pid, processName: name });
    }
  }
  return ports;
}

/** Saída de `ss -H -ltnp` (Linux): o processo só aparece para os processos do próprio usuário. */
export function parseSsListening(output: string): ListeningPort[] {
  const ports: ListeningPort[] = [];
  for (const line of output.split('\n')) {
    const cols = line.trim().split(/\s+/);
    const endpoint = cols[3] ? splitEndpoint(cols[3]) : null;
    if (!endpoint) continue;
    const owner = /users:\(\("([^"]*)",pid=(\d+)/.exec(line);
    ports.push({ ...endpoint, pid: owner ? Number(owner[2]) : 0, processName: owner ? owner[1]! : null });
  }
  return ports;
}

/** Ambiente impresso pelo shell de login, entre duas marcas (os arquivos de perfil podem escrever antes e depois). */
export function parseLoginEnvironment(output: string): Env | null {
  const start = output.indexOf(ENV_MARK);
  const end = output.lastIndexOf(ENV_MARK);
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(output.slice(start + ENV_MARK.length, end));
    if (!parsed || typeof parsed !== 'object') return null;
    const env: Env = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') env[k] = v;
    return env;
  } catch {
    return null;
  }
}

/**
 * Ambiente que um terminal novo teria: o shell de login do usuário lê os arquivos de perfil e o próprio
 * executável do app (como Node) imprime o resultado. É o que traz o PATH do Homebrew, do nvm etc. quando
 * o app é aberto pelo Dock ou pelo menu, que entregam só o ambiente mínimo do sistema.
 */
async function readLoginEnvironment(current: Env): Promise<Env> {
  const shell = getVar(current, 'SHELL');
  if (!shell) return { ...current };
  const script = `'${process.execPath.replace(/'/g, `'\\''`)}' -p '"${ENV_MARK}" + JSON.stringify(process.env) + "${ENV_MARK}"'`;
  const args = basename(shell) === 'fish' ? ['-l', '-c', script] : ['-l', '-i', '-c', script];
  const output = await run(shell, args, { env: { ...current, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ATTACH_CONSOLE: '1' }, timeout: 8000 });
  const env = output ? parseLoginEnvironment(output) : null;
  if (!env) throw new Error('Não foi possível ler o ambiente do shell de login.');
  delete env['ELECTRON_RUN_AS_NODE'];
  delete env['ELECTRON_NO_ATTACH_CONSOLE'];
  return env;
}

export const posixAdapter: PlatformAdapter = {
  name: 'posix',
  pathDelimiter: ':',

  detectShells(env) {
    return detectPosixShells({
      env,
      exists: (p) => access(p, constants.X_OK).then(
        () => true,
        () => false,
      ),
      readShellsFile: () => readFile('/etc/shells', 'utf8').catch(() => null),
      resolveOnPath: (name) => resolveExecutable(name, env),
    });
  },

  fallbackShell(env) {
    const shell = getVar(env, 'SHELL') ?? '/bin/sh';
    return { id: 'builtin.default', name: basename(shell), shellType: 'custom', executable: shell, args: ['-l'], supportsIntegration: false };
  },

  async exportRegistryKey() {
    return null;
  },

  readSystemEnvironment(current) {
    return readLoginEnvironment(current);
  },

  async launchEnvironment(current) {
    // Aberto por um terminal, o app já herdou o ambiente completo (e o shell de login custaria tempo à toa).
    if (getVar(current, 'TERM')) return current;
    return readLoginEnvironment(current).catch(() => current);
  },

  resolveExecutable,

  buildSpawn(file, args) {
    return { file, args };
  },

  createProcessTracker() {
    return null;
  },

  sshAgentSocket(env) {
    return getVar(env, 'SSH_AUTH_SOCK') ?? null;
  },

  supportsAutoUpdate(env) {
    // Linux: só o AppImage se substitui (o .deb é do gerenciador de pacotes). macOS: exige app assinado.
    return process.platform === 'linux' && !!getVar(env, 'APPIMAGE');
  },

  async listListeningPorts() {
    const lsof = await run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-F', 'pcn']);
    if (lsof !== null) return parseLsofListening(lsof);
    const ss = await run('ss', ['-H', '-ltnp']);
    return ss === null ? [] : parseSsListening(ss);
  },

  async listDescendants(pid) {
    // O pgrep só lista os filhos diretos: desce nível a nível.
    const all: number[] = [];
    let level = [pid];
    while (level.length > 0 && all.length < 2000) {
      const children = await Promise.all(level.map(async (p) => ((await run('pgrep', ['-P', String(p)])) ?? '').split('\n').filter(Boolean).map(Number)));
      level = children.flat().filter((p) => Number.isInteger(p) && !all.includes(p));
      all.push(...level);
    }
    return all;
  },

  async killTree(pid, descendants) {
    for (const p of [pid, ...descendants]) {
      try {
        process.kill(p, 'SIGKILL');
      } catch {
        // já encerrado
      }
    }
  },
};
