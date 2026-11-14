import { posix as path } from 'node:path';
import { getVar, type Env } from '../env/env-utils';
import type { DetectedShell } from '../platform/types';

/** Acesso ao sistema usado pela detecção; injetado para permitir testes com fakes. */
export interface PosixDetectDeps {
  env: Env;
  exists(path: string): Promise<boolean>;
  /** Conteúdo de /etc/shells, ou null se não existir. */
  readShellsFile(): Promise<string | null>;
  resolveOnPath(name: string): Promise<string | null>;
}

type NativeShell = 'zsh' | 'bash' | 'fish';

/** Argumentos de cada shell sem a integração (com ela, o bash troca o login pelo --rcfile). */
const NATIVE: Record<NativeShell, { name: string; args: string[]; supportsIntegration: boolean }> = {
  zsh: { name: 'zsh', args: ['-l'], supportsIntegration: true },
  bash: { name: 'bash', args: [], supportsIntegration: true },
  // O fish abre sem integração: a pasta atual e o fim dos comandos não são rastreados.
  fish: { name: 'fish', args: ['-l'], supportsIntegration: false },
};

function shellKind(file: string): NativeShell | null {
  const base = path.basename(file);
  return base === 'zsh' || base === 'bash' || base === 'fish' ? base : null;
}

/** Caminhos de /etc/shells (um por linha; `#` comenta). */
export function parseShellsFile(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.startsWith('/'));
}

/**
 * Shells do macOS e do Linux: o shell de login do usuário ($SHELL) vem primeiro e vira o perfil padrão;
 * depois os outros shells conhecidos de /etc/shells ou do PATH, e o PowerShell, se instalado.
 */
export async function detectPosixShells(deps: PosixDetectDeps): Promise<DetectedShell[]> {
  const login = getVar(deps.env, 'SHELL') ?? null;
  const listed = parseShellsFile((await deps.readShellsFile()) ?? '');
  const found = new Map<NativeShell, string>();

  for (const candidate of [login, ...listed]) {
    if (!candidate) continue;
    const kind = shellKind(candidate);
    if (kind && !found.has(kind) && (await deps.exists(candidate))) found.set(kind, candidate);
  }
  for (const kind of Object.keys(NATIVE) as NativeShell[]) {
    if (found.has(kind)) continue;
    const onPath = await deps.resolveOnPath(kind);
    if (onPath) found.set(kind, onPath);
  }

  const loginKind = login ? shellKind(login) : null;
  const order = (Object.keys(NATIVE) as NativeShell[]).sort((a, b) => Number(b === loginKind) - Number(a === loginKind));
  const shells: DetectedShell[] = order
    .filter((kind) => found.has(kind))
    .map((kind) => ({
      id: `builtin.${kind}`,
      name: NATIVE[kind].name,
      shellType: kind,
      executable: found.get(kind)!,
      args: NATIVE[kind].args,
      supportsIntegration: NATIVE[kind].supportsIntegration,
    }));

  // Id próprio: `builtin.pwsh` é o preferido como padrão no Windows, e aqui o padrão é o shell de login.
  const pwsh = await deps.resolveOnPath('pwsh');
  if (pwsh) shells.push({ id: 'builtin.pwsh.unix', name: 'PowerShell', shellType: 'pwsh', executable: pwsh, args: ['-NoLogo'], supportsIntegration: true });
  return shells;
}
