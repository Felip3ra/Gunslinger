import { describe, expect, it, vi } from 'vitest';
import type { CommandsFile, ProjectsFile, SaveResult } from '@shared/model';
import type { NotifierPort, WindowPort } from '../ports';
import { LongCommandNotifier } from './long-command-notifier';
import { ProjectCatalog } from './project-catalog';

function fakeConfig() {
  let commands: CommandsFile = {
    version: 1,
    commands: [{ id: 'c1', name: 'Seed', command: 'x', description: '', category: '', targetProfileId: null, cwd: null, projectId: 'p1', variables: {} }],
  };
  let projects: ProjectsFile = {
    version: 1,
    projects: [{ id: 'p1', name: 'Loja', rootPath: 'C:\\x', defaultProfileId: null, types: { dotnet: false, node: false }, variables: {}, node: { packageManagerOverrides: {} } }],
  };
  const ok: SaveResult = { ok: true };
  return {
    get commands() {
      return commands;
    },
    get projects() {
      return projects;
    },
    mutateCommands: async (fn: (f: CommandsFile) => CommandsFile) => ((commands = fn(commands)), ok),
    mutateProjects: async (fn: (f: ProjectsFile) => ProjectsFile) => ((projects = fn(projects)), ok),
  };
}

describe('ProjectCatalog', () => {
  it('recusa pasta inexistente', async () => {
    const catalog = new ProjectCatalog(fakeConfig(), async () => false);
    expect(await catalog.save(fakeConfig().projects.projects[0]!)).toEqual({ ok: false, error: 'Pasta raiz inválida: a pasta não existe.' });
  });

  it('excluir tornando comandos globais e avisando o observador', async () => {
    const config = fakeConfig();
    const deleted = vi.fn();
    await new ProjectCatalog(config, async () => true, deleted).delete('p1', 'makeGlobal');
    expect(config.commands.commands[0]!.projectId).toBeNull();
    expect(config.projects.projects).toEqual([]);
    expect(deleted).toHaveBeenCalledWith('p1');
  });

  it('excluir apagando os comandos vinculados', async () => {
    const config = fakeConfig();
    await new ProjectCatalog(config, async () => true).delete('p1', 'delete');
    expect(config.commands.commands).toEqual([]);
  });
});

describe('LongCommandNotifier', () => {
  function setup(focused: boolean) {
    const clicks: (() => void)[] = [];
    const shown: { title: string; body: string }[] = [];
    const notifier: NotifierPort = {
      isSupported: () => true,
      show: (o) => (shown.push(o), { onClick: (l) => void clicks.push(l) }),
    };
    const window: WindowPort = { isFocused: () => focused, reveal: vi.fn() };
    const activate = vi.fn();
    const service = new LongCommandNotifier(notifier, window, () => ({ enabled: true, thresholdSeconds: 10 }), activate);
    return { service, shown, clicks, window, activate };
  }

  it('notifica fora de foco acima do limite; clique revela a janela e ativa a aba', () => {
    const { service, shown, clicks, window, activate } = setup(false);
    expect(service.notify({ sessionId: 's1', command: 'npm run build', durationMs: 25_000, exitCode: 0 })).toBe(true);
    expect(shown[0]!.title).toBe('npm run build concluído em 25 s');
    clicks[0]!();
    expect(window.reveal).toHaveBeenCalled();
    expect(activate).toHaveBeenCalledWith('s1');
  });

  it('informa falha com o código de saída', () => {
    const { service, shown } = setup(false);
    service.notify({ sessionId: 's', command: 'npm run dev', durationMs: 600_000, exitCode: 1 });
    expect(shown[0]!.title).toBe('npm run dev falhou (código 1)');
  });

  it('não notifica com a janela em foco ou comando curto', () => {
    expect(setup(true).service.notify({ sessionId: 's', command: 'x', durationMs: 30_000 })).toBe(false);
    expect(setup(false).service.notify({ sessionId: 's', command: 'x', durationMs: 3_000 })).toBe(false);
  });
});
