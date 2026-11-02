import type { ShellType } from '@shared/model';
import type { Env } from '../env/env-utils';

/** Shell encontrado pela detecção, antes de aplicar os ajustes do usuário. */
export interface DetectedShell {
  id: string;
  name: string;
  shellType: ShellType;
  executable: string;
  args: string[];
  wslDistro?: string;
  /** false quando a distribuição WSL usa outro shell padrão (integração fica desligada). */
  supportsIntegration: boolean;
}

export interface SpawnSpec {
  file: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

export interface PlatformAdapter {
  readonly name: 'win32' | 'posix';
  /** Separador da variável PATH. */
  readonly pathDelimiter: string;
  detectShells(env: Env): Promise<DetectedShell[]>;
  /** Shell usado quando a detecção não está disponível ou nenhum perfil existe. */
  fallbackShell(env: Env): DetectedShell;
  /** Ambiente que um login novo teria (no Windows, lido do registro). */
  readSystemEnvironment(current: Env): Promise<Env>;
  /** Conteúdo de `reg export` de uma chave (só Windows; null nas demais plataformas ou se não existir). */
  exportRegistryKey(key: string): Promise<string | null>;
  /** Caminho absoluto de um executável no PATH do ambiente informado, ou null. */
  resolveExecutable(name: string, env: Env): Promise<string | null>;
  /** Como executar um arquivo resolvido sem shell (scripts .cmd precisam do cmd.exe). */
  buildSpawn(file: string, args: string[]): SpawnSpec;
  listDescendants(pid: number): Promise<number[]>;
  /** Portas TCP em escuta com o processo dono. */
  listListeningPorts(): Promise<{ address: string; port: number; pid: number; processName: string | null }[]>;
  /** Encerra o processo e os descendentes informados (capturados antes do kill). */
  killTree(pid: number, descendants: number[]): Promise<void>;
}
