import type { ConfigStore } from '../../config/config-store';
import type { EnvironmentService } from '../../env/environment-service';
import type { PlatformAdapter } from '../../platform/types';
import type { DialogPort } from '../../ports';
import type { ProjectService } from '../../projects/project-service';
import type { ProjectCatalog } from '../../services/project-catalog';
import { checkTool } from '../../tools/check-tool';
import type { IpcRegistry } from '../registry';

/** Projetos (cadastro e análise) e verificação de ferramentas. */
export function registerProjectHandlers(
  ipc: IpcRegistry,
  deps: { catalog: ProjectCatalog; analysis: ProjectService; config: ConfigStore; dialogs: DialogPort; platform: PlatformAdapter; env: EnvironmentService },
): void {
  const { catalog, analysis, config, dialogs, platform, env } = deps;
  ipc.handle('projects:save', (project) => catalog.save(project));
  ipc.handle('projects:delete', ({ id, linkedCommands }) => catalog.delete(id, linkedCommands));
  ipc.handle('projects:analyze', ({ root, projectId }) => {
    const project = projectId ? config.snapshot().projects.projects.find((p) => p.id === projectId) : undefined;
    return analysis.analyze(root, projectId, project?.node.packageManagerOverrides ?? {});
  });
  ipc.handle('projects:pickFolder', () => dialogs.openFolder());
  ipc.handle('tools:check', ({ tool, cwd }) => checkTool(platform, env.current().env, tool, cwd));
}
