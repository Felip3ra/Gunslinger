import type { CommandsFile } from './commands';
import type { HostsFile } from './hosts';
import type { PackageManager, ProjectsFile } from './projects';
import type { Settings } from './settings';
import type { WorkspacesFile } from './workspaces';

export type ConfigFileName = 'settings' | 'commands' | 'projects' | 'workspaces' | 'hosts' | 'keychain' | 'knownHosts';

export interface ConfigIssue {
  file: ConfigFileName;
  /** Caminho do campo (ex.: ["appearance", "fontSize"]); vazio quando o JSON inteiro é ilegível. */
  path: (string | number)[];
  line?: number;
  message: string;
  /** 'error' bloqueia gravações no arquivo até ser corrigido; 'warning' só informa. */
  severity: 'error' | 'warning';
}

export interface ConfigSnapshot {
  settings: Settings;
  commands: CommandsFile;
  projects: ProjectsFile;
  workspaces: WorkspacesFile;
  hosts: HostsFile;
  /** Inclui os problemas de keychain.json e known_hosts.json, que não vêm no snapshot. */
  issues: ConfigIssue[];
  /** Arquivos com erro: a UI não pode gravá-los até o usuário corrigir. */
  readOnly: Record<ConfigFileName, boolean>;
  dataDir: string;
}

export type SaveResult = { ok: true } | { ok: false; error: string };
export type OpenResult = { ok: true } | { ok: false; error: string };

export interface ToolStatus {
  found: boolean;
  version?: string;
  detail?: string;
}

export interface CsprojInfo {
  path: string;
  sdk: string | null;
  isWeb: boolean;
  isExe: boolean;
  referencesEf: boolean;
  /** Projeto de testes (Microsoft.NET.Test.Sdk, xUnit, NUnit ou MSTest). */
  isTestProject: boolean;
}

/** Perfil de execução de Properties/launchSettings.json. */
export interface LaunchProfile {
  /** .csproj relativo à raiz do projeto. */
  project: string;
  name: string;
  commandName: string;
  applicationUrl: string | null;
  environment: Record<string, string>;
  /** Erro de leitura do arquivo (o perfil é só um marcador). */
  error: string | null;
}

export interface DotnetAnalysis {
  solutions: string[];
  projects: CsprojInfo[];
  suggestedProject: string | null;
  suggestedStartupProject: string | null;
  projectCandidates: string[];
  startupCandidates: string[];
  launchProfiles: LaunchProfile[];
}

export interface NodePackage {
  /** Pasta relativa à raiz do projeto, com '/' ('' para a raiz). */
  dir: string;
  name: string | null;
  scripts: Record<string, string>;
  packageManager: PackageManager;
  packageManagerSource: 'override' | 'packageManager-field' | 'lockfile' | 'default';
  yarnBerry: boolean;
  /** Framework de testes do script `test` (null sem script ou sem framework conhecido). */
  testFramework: 'vitest' | 'jest' | null;
  warnings: string[];
  /** Lista mantida da última leitura válida porque o package.json atual está inválido. */
  stale: boolean;
  error: string | null;
}

export interface ProjectAnalysis {
  rootPath: string;
  suggestedTypes: { dotnet: boolean; node: boolean };
  dotnet: DotnetAnalysis;
  nodePackages: NodePackage[];
}

export interface GitStatus {
  branch: string | null;
  detachedSha: string | null;
  dirty: boolean;
  /** true quando o status completo deu timeout e só a branch é conhecida. */
  partial: boolean;
}

/** null = não relevante para a pasta; { version: null } = relevante, mas a ferramenta não foi encontrada. */
export type VersionInfo = { version: string | null } | null;

export interface StatusInfo {
  cwd: string | null;
  git: GitStatus | null;
  node: VersionInfo;
  dotnet: VersionInfo;
}
