import type { ShellType } from './model';

export interface FileCandidate {
  /** Trecho da linha que vira link (caminho + linha/coluna). */
  text: string;
  /** Posição inicial (0-based) na linha. */
  start: number;
  path: string;
  line?: number;
  column?: number;
}

const SEG = String.raw`[\w.@+-]+`;
const PATH = String.raw`(?:[A-Za-z]:[\\/](?:${SEG}[\\/])*${SEG}|\/(?:${SEG}\/)*${SEG}|(?:\.{1,2}[\\/])?(?:${SEG}[\\/])*${SEG}\.[A-Za-z0-9]+)`;
// arquivo:linha[:coluna]  ou  arquivo(linha,coluna) (MSBuild/tsc)
const CANDIDATE = new RegExp(String.raw`(?<![\w/\\.])(${PATH})(?::(\d+)(?::(\d+))?|\((\d+)(?:,(\d+))?\))?`, 'g');

/** Encontra possíveis caminhos de arquivo numa linha da saída (a existência é verificada depois). */
export function findFileCandidates(lineText: string): FileCandidate[] {
  const out: FileCandidate[] = [];
  for (const m of lineText.matchAll(CANDIDATE)) {
    const path = m[1]!;
    // Sem extensão nem linha, provavelmente não é arquivo (ex.: "/usr/bin").
    const line = m[2] ?? m[4];
    const column = m[3] ?? m[5];
    if (!/\.[A-Za-z0-9]+$/.test(path) && !line) continue;
    if (/^\d+(\.\d+)+$/.test(path)) continue; // números de versão
    out.push({
      text: m[0],
      start: m.index!,
      path,
      ...(line ? { line: Number(line) } : {}),
      ...(column ? { column: Number(column) } : {}),
    });
  }
  return out;
}

const DRIVE = /^[A-Za-z]:[\\/]/;

/** Converte o caminho encontrado em caminho do Windows, relativo à pasta atual da aba. */
export function resolveCandidatePath(path: string, cwd: string | null, shellType: ShellType, wslDistro?: string): string | null {
  if (DRIVE.test(path)) return path.replace(/\//g, '\\');
  if (path.startsWith('/')) {
    const msys = /^\/([a-zA-Z])(\/.*)?$/.exec(path);
    if (shellType === 'gitbash' && msys) return `${msys[1]!.toUpperCase()}:${(msys[2] ?? '\\').replace(/\//g, '\\')}`;
    const mnt = /^\/mnt\/([a-zA-Z])(\/.*)?$/.exec(path);
    if (shellType === 'wsl' && mnt) return `${mnt[1]!.toUpperCase()}:${(mnt[2] ?? '\\').replace(/\//g, '\\')}`;
    if (shellType === 'wsl' && wslDistro) return `\\\\wsl.localhost\\${wslDistro}${path.replace(/\//g, '\\')}`;
    return null;
  }
  if (!cwd) return null;
  const parts = `${cwd.replace(/[\\/]+$/, '')}\\${path.replace(/\//g, '\\')}`.split('\\');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  const prefix = cwd.startsWith('\\\\') ? '\\\\' : '';
  return prefix + stack.join('\\');
}
