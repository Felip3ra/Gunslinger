import type { CommandsFile, CustomProfile, Project, ProjectsFile, SavedCommand, Settings } from './model';
import { EXPORT_FORMAT, type ConflictAction, type ConflictDecision, type ExportFile, type ExportSelection, type ImportItem, type ImportResult } from './transfer';

export interface DataSnapshot {
  commands: CommandsFile;
  projects: ProjectsFile;
  settings: Settings;
}

export function buildExport(data: DataSnapshot, selection: ExportSelection, now = new Date()): ExportFile {
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    commands: data.commands.commands.filter((c) => selection.categories === 'all' || selection.categories.includes(c.category)),
    // Perfis detectados e preferências (tema, fonte, atalhos) não são exportados.
    profiles: data.settings.profiles.custom.filter((p) => selection.profileIds.includes(p.id)),
    projects: data.projects.projects.filter((p) => selection.projectIds.includes(p.id)),
  };
}

export interface ImportContext {
  /** Perfis existentes na máquina (detectados e customizados). */
  knownProfileIds: Set<string>;
  /** Executáveis disponíveis, para marcar perfis importados como indisponíveis. */
  executableExists(profile: CustomProfile): boolean;
}

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

function commandConflict(existing: SavedCommand[], c: SavedCommand): SavedCommand | undefined {
  return existing.find((e) => e.id === c.id) ?? existing.find((e) => sameName(e.name, c.name) && e.category === c.category);
}
function projectConflict(existing: Project[], p: Project): Project | undefined {
  return existing.find((e) => e.id === p.id) ?? existing.find((e) => sameName(e.name, p.name));
}
function profileConflict(existing: CustomProfile[], p: CustomProfile): CustomProfile | undefined {
  return existing.find((e) => e.id === p.id) ?? existing.find((e) => sameName(e.name, p.name));
}

/** Itens da prévia, com conflitos e observações; nada é gravado aqui. */
export function previewItems(data: DataSnapshot, file: ExportFile, ctx: ImportContext): ImportItem[] {
  const projectIds = new Set([...data.projects.projects.map((p) => p.id), ...file.projects.map((p) => p.id)]);
  const profileIds = new Set([...ctx.knownProfileIds, ...file.profiles.map((p) => p.id)]);
  const items: ImportItem[] = [];
  for (const c of file.commands) {
    const notes: string[] = [];
    if (c.projectId && !projectIds.has(c.projectId)) notes.push('Projeto vinculado não existe: será importado como comando global.');
    if (c.targetProfileId && !profileIds.has(c.targetProfileId)) notes.push('Shell de destino não encontrado nesta máquina.');
    items.push({
      key: `command:${c.id}`,
      kind: 'command',
      name: c.category ? `${c.category} / ${c.name}` : c.name,
      detail: c.command,
      conflictWith: commandConflict(data.commands.commands, c)?.name ?? null,
      notes,
    });
  }
  for (const p of file.profiles) {
    items.push({
      key: `profile:${p.id}`,
      kind: 'profile',
      name: p.name,
      detail: [p.executable, ...p.args].join(' '),
      conflictWith: profileConflict(data.settings.profiles.custom, p)?.name ?? null,
      notes: ctx.executableExists(p) ? [] : ['Executável não existe nesta máquina: o perfil ficará indisponível.'],
    });
  }
  for (const p of file.projects) {
    items.push({
      key: `project:${p.id}`,
      kind: 'project',
      name: p.name,
      detail: p.rootPath,
      conflictWith: projectConflict(data.projects.projects, p)?.name ?? null,
      notes: ['A pasta raiz pode não existir nesta máquina.'],
    });
  }
  return items;
}

function uniqueName(name: string, taken: string[]): string {
  let n = 2;
  let candidate = `${name} (${n})`;
  while (taken.some((t) => sameName(t, candidate))) candidate = `${name} (${++n})`;
  return candidate;
}

export interface ImportApplication {
  commands: CommandsFile;
  projects: ProjectsFile;
  customProfiles: CustomProfile[];
  result: ImportResult;
}

/** Aplica as decisões ("Substituir", "Manter ambos", "Ignorar"); sem conflito, o item é adicionado. */
export function applyImport(data: DataSnapshot, file: ExportFile, decisions: ConflictDecision[], newId: () => string): ImportApplication {
  const decisionOf = (key: string): ConflictAction => decisions.find((d) => d.key === key)?.action ?? 'keepBoth';
  const result: ImportResult = { added: 0, replaced: 0, skipped: 0 };
  const projects = [...data.projects.projects];
  const commands = [...data.commands.commands];
  const profiles = [...data.settings.profiles.custom];
  const projectIdMap = new Map<string, string>();

  for (const p of file.projects) {
    const conflict = projectConflict(projects, p);
    const action = conflict ? decisionOf(`project:${p.id}`) : 'keepBoth';
    if (conflict && action === 'skip') {
      result.skipped++;
      projectIdMap.set(p.id, conflict.id);
    } else if (conflict && action === 'replace') {
      projects[projects.indexOf(conflict)] = { ...p, id: conflict.id };
      projectIdMap.set(p.id, conflict.id);
      result.replaced++;
    } else {
      const id = conflict || projects.some((e) => e.id === p.id) ? newId() : p.id;
      projects.push({ ...p, id, name: conflict ? uniqueName(p.name, projects.map((e) => e.name)) : p.name });
      projectIdMap.set(p.id, id);
      result.added++;
    }
  }

  const existingProjectIds = new Set(projects.map((p) => p.id));
  for (const raw of file.commands) {
    // projectId desconhecido vira comando global.
    const mappedProject = raw.projectId ? (projectIdMap.get(raw.projectId) ?? (existingProjectIds.has(raw.projectId) ? raw.projectId : null)) : null;
    const c = { ...raw, projectId: mappedProject };
    const conflict = commandConflict(commands, c);
    const action = conflict ? decisionOf(`command:${raw.id}`) : 'keepBoth';
    if (conflict && action === 'skip') result.skipped++;
    else if (conflict && action === 'replace') {
      commands[commands.indexOf(conflict)] = { ...c, id: conflict.id };
      result.replaced++;
    } else {
      const id = conflict || commands.some((e) => e.id === c.id) ? newId() : c.id;
      const sameCategory = commands.filter((e) => e.category === c.category).map((e) => e.name);
      commands.push({ ...c, id, name: conflict ? uniqueName(c.name, sameCategory) : c.name });
      result.added++;
    }
  }

  for (const p of file.profiles) {
    const conflict = profileConflict(profiles, p);
    const action = conflict ? decisionOf(`profile:${p.id}`) : 'keepBoth';
    if (conflict && action === 'skip') result.skipped++;
    else if (conflict && action === 'replace') {
      profiles[profiles.indexOf(conflict)] = { ...p, id: conflict.id };
      result.replaced++;
    } else {
      const id = conflict || profiles.some((e) => e.id === p.id) || p.id.startsWith('builtin.') ? newId() : p.id;
      profiles.push({ ...p, id, name: conflict ? uniqueName(p.name, profiles.map((e) => e.name)) : p.name });
      result.added++;
    }
  }

  return {
    commands: { ...data.commands, commands },
    projects: { ...data.projects, projects },
    customProfiles: profiles,
    result,
  };
}
