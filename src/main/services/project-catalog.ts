import { access } from 'node:fs/promises';
import type { Project, SaveResult } from '@shared/model';
import type { ConfigStore } from '../config/config-store';

export type LinkedCommandsPolicy = 'delete' | 'makeGlobal';

/** Cadastro de projetos: validação da pasta e integridade dos comandos vinculados. */
export class ProjectCatalog {
  constructor(
    private readonly config: Pick<ConfigStore, 'mutateProjects' | 'mutateCommands'>,
    private readonly folderExists: (path: string) => Promise<boolean> = (p) => access(p).then(() => true, () => false),
    private readonly onDeleted: (projectId: string) => void = () => {},
  ) {}

  async save(project: Project): Promise<SaveResult> {
    if (!(await this.folderExists(project.rootPath))) return { ok: false, error: 'Pasta raiz inválida: a pasta não existe.' };
    return this.config.mutateProjects((f) => {
      const exists = f.projects.some((p) => p.id === project.id);
      return { ...f, projects: exists ? f.projects.map((p) => (p.id === project.id ? project : p)) : [...f.projects, project] };
    });
  }

  /** commands.json primeiro: se falhar, o projeto continua existindo e nada fica órfão. */
  async delete(id: string, linkedCommands: LinkedCommandsPolicy): Promise<SaveResult> {
    const commands = await this.config.mutateCommands((f) => ({
      ...f,
      commands:
        linkedCommands === 'delete'
          ? f.commands.filter((c) => c.projectId !== id)
          : f.commands.map((c) => (c.projectId === id ? { ...c, projectId: null } : c)),
    }));
    if (!commands.ok) return commands;
    this.onDeleted(id);
    return this.config.mutateProjects((f) => ({ ...f, projects: f.projects.filter((p) => p.id !== id) }));
  }
}
