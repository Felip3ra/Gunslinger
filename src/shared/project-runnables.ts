import { EF_COMMANDS, buildEfCommand } from './ef-commands';
import type { LaunchProfile, NodePackage, Project, ProjectAnalysis, SavedCommand } from './model';
import { NODE_COMMANDS, buildNodeCommand, buildRunScript } from './node-commands';
import { fromSavedCommand, type RunnableCommand } from './runnable';

export interface NodeGroup {
  pkg: NodePackage;
  label: string;
  scripts: RunnableCommand[];
  commands: RunnableCommand[];
}

export interface ProjectRunnables {
  ef: RunnableCommand[];
  /** Perfis de execução do launchSettings.json. */
  launch: RunnableCommand[];
  node: NodeGroup[];
  linked: RunnableCommand[];
}

/** Junta raiz e pasta relativa ('/' → '\') no formato do Windows. */
export function joinWindows(root: string, rel: string): string {
  if (!rel) return root;
  return `${root.replace(/[\\/]+$/, '')}\\${rel.replace(/\//g, '\\')}`;
}

export function packageLabel(pkg: NodePackage): string {
  return pkg.dir || 'raiz';
}

export function efRunnables(project: Project): RunnableCommand[] {
  return EF_COMMANDS.map((def): RunnableCommand => ({
    id: `ef:${project.id}:${def.kind}`,
    source: 'ef' as const,
    title: def.title,
    text: buildEfCommand(def.kind, project.variables),
    description: def.base,
    group: 'EF Core',
    cwd: project.rootPath,
    targetProfileId: null,
    projectId: project.id,
    variables: def.kind === 'add' ? { nome: { label: 'Nome da migration', options: [] } } : {},
    confirm: def.confirm,
    preflight: ['dotnet', 'dotnet-ef'],
  }));
}

const projectName = (csproj: string): string => csproj.split('/').pop()!.replace(/\.csproj$/i, '');

/** Dois comandos (run e watch) por perfil "Project"; os demais tipos aparecem desativados. */
export function launchRunnables(project: Project, profiles: LaunchProfile[]): RunnableCommand[] {
  return profiles.flatMap((p): RunnableCommand[] => {
    const base = {
      group: 'Perfis de execução',
      cwd: project.rootPath,
      targetProfileId: null,
      projectId: project.id,
      variables: {},
      confirm: false,
      preflight: ['dotnet' as const],
    };
    const title = `${projectName(p.project)}: ${p.name}`;
    if (p.error) return [{ ...base, id: `launch:${project.id}:${p.project}:erro`, source: 'launch', title, text: '', description: p.error, disabledReason: p.error }];
    const description = [p.applicationUrl, Object.keys(p.environment).map((k) => `${k}=${p.environment[k]}`).join(' ')].filter(Boolean).join(' · ');
    const args = `--project "${p.project}" --launch-profile "${p.name.replace(/"/g, '\\"')}"`;
    if (p.commandName !== 'Project') {
      const reason = `Perfil do tipo "${p.commandName || 'desconhecido'}" não é executado pelo dotnet run`;
      return [{ ...base, id: `launch:${project.id}:${p.project}:${p.name}`, source: 'launch', title, text: '', description: reason, disabledReason: reason }];
    }
    return [
      { ...base, id: `launch:${project.id}:${p.project}:${p.name}`, source: 'launch', title, text: `dotnet run ${args}`, description },
      { ...base, id: `launch-watch:${project.id}:${p.project}:${p.name}`, source: 'launch', title: `${title} (watch)`, text: `dotnet watch run ${args}`, description },
    ];
  });
}

export function nodeGroup(project: Project, pkg: NodePackage): NodeGroup {
  const label = packageLabel(pkg);
  const cwd = joinWindows(project.rootPath, pkg.dir);
  const base = {
    group: `Node: ${label}`,
    cwd,
    targetProfileId: null,
    projectId: project.id,
    confirm: false,
    preflight: ['node' as const, pkg.packageManager],
  };
  return {
    pkg,
    label,
    scripts: Object.entries(pkg.scripts).map(([name, body]): RunnableCommand => ({
      ...base,
      id: `node:${project.id}:${pkg.dir}:${name}`,
      source: 'node-script' as const,
      title: name,
      text: buildRunScript(pkg.packageManager, name),
      description: body,
      variables: {},
    })),
    commands: NODE_COMMANDS.map((def): RunnableCommand => ({
      ...base,
      id: `nodecmd:${project.id}:${pkg.dir}:${def.kind}`,
      source: 'node-command' as const,
      title: def.title,
      text: buildNodeCommand(def.kind, pkg.packageManager, pkg.yarnBerry),
      description: '',
      variables:
        def.kind === 'npx'
          ? { comando: { label: 'Comando', options: [] } }
          : def.kind === 'install'
            ? {}
            : { pacote: { label: 'Pacote', options: [] } },
    })),
  };
}

export function projectRunnables(project: Project, analysis: ProjectAnalysis | undefined, saved: SavedCommand[]): ProjectRunnables {
  return {
    ef: project.types.dotnet ? efRunnables(project) : [],
    launch: project.types.dotnet && analysis ? launchRunnables(project, analysis.dotnet.launchProfiles) : [],
    node: project.types.node && analysis ? analysis.nodePackages.map((pkg) => nodeGroup(project, pkg)) : [],
    linked: saved.filter((c) => c.projectId === project.id).map(fromSavedCommand),
  };
}

/** Comandos de EF mostrados (desativados) na paleta quando não há projeto .NET ativo. */
export function disabledEfRunnables(): RunnableCommand[] {
  return EF_COMMANDS.map((def) => ({
    id: `ef:none:${def.kind}`,
    source: 'ef' as const,
    title: def.title,
    text: def.base,
    description: def.base,
    group: 'EF Core',
    cwd: null,
    targetProfileId: null,
    projectId: null,
    variables: {},
    confirm: false,
    preflight: [],
    disabledReason: 'Abra um projeto .NET para usar',
  }));
}
