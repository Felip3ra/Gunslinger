import type { ShellType } from './model';

export interface WslPathInfo {
  /** Raiz de montagem dos drives do Windows na distribuição (padrão "/mnt/"). */
  mountRoot: string;
}

const WINDOWS_DRIVE = /^([A-Za-z]):[\\/]?(.*)$/;
const WSL_UNC = /^\\\\wsl(?:\.localhost|\$)\\[^\\]+(\\.*)?$/i;

/** C:\a b → /c/a b (Git Bash). */
export function toMsysPath(windowsPath: string): string {
  const m = WINDOWS_DRIVE.exec(windowsPath);
  if (!m) return windowsPath.replace(/\\/g, '/');
  const rest = m[2]!.replace(/\\/g, '/').replace(/\/$/, '');
  return `/${m[1]!.toLowerCase()}${rest ? '/' + rest : ''}`;
}

/** C:\x → /mnt/c/x; \\wsl.localhost\Ubuntu\home\u → /home/u. */
export function toWslPath(windowsPath: string, info: WslPathInfo = { mountRoot: '/mnt/' }): string {
  const unc = WSL_UNC.exec(windowsPath);
  if (unc) return (unc[1] ?? '\\').replace(/\\/g, '/');
  const m = WINDOWS_DRIVE.exec(windowsPath);
  if (!m) return windowsPath.replace(/\\/g, '/');
  const root = info.mountRoot.endsWith('/') ? info.mountRoot : info.mountRoot + '/';
  const rest = m[2]!.replace(/\\/g, '/').replace(/\/$/, '');
  return `${root}${m[1]!.toLowerCase()}${rest ? '/' + rest : ''}`;
}

const shSingleQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * Comando para trocar de pasta no shell informado, ou null quando o tipo de shell é desconhecido
 * (perfis customizados): nesse caso o app abre uma aba nova na pasta em vez de digitar algo.
 */
export function buildCdCommand(shellType: ShellType, windowsPath: string, wsl?: WslPathInfo): string | null {
  switch (shellType) {
    case 'powershell':
    case 'pwsh':
      return `Set-Location -LiteralPath '${windowsPath.replace(/'/g, "''")}'`;
    case 'cmd':
      // Caminhos do Windows não podem conter aspas; /d troca também de drive.
      return `cd /d "${windowsPath}"`;
    case 'gitbash':
      return `cd ${shSingleQuote(toMsysPath(windowsPath))}`;
    case 'wsl':
      return `cd ${shSingleQuote(toWslPath(windowsPath, wsl))}`;
    case 'custom':
      return null;
  }
}

/** Compara pastas do Windows sem diferenciar maiúsculas nem barra final. */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (p: string): string => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  return norm(a) === norm(b);
}
