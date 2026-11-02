import type { ConfigStore } from '../../config/config-store';
import { NotFoundError, type IpcRegistry } from '../registry';
import type { TestRunnerService } from '../../tests/test-runner';

/** Executor de testes. */
export function registerTestHandlers(ipc: IpcRegistry, deps: { runner: TestRunnerService; config: ConfigStore }): void {
  ipc.handle('tests:run', async ({ projectId, target, filter }) => {
    const project = deps.config.snapshot().projects.projects.find((p) => p.id === projectId);
    if (!project) throw new NotFoundError('Projeto não encontrado');
    return { runId: await deps.runner.run(project.rootPath, target, filter ?? []) };
  });
  ipc.handle('tests:cancel', ({ runId }) => deps.runner.cancel(runId));
}
