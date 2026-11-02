import type { Workspace, WorkspacePane } from '@shared/model';
import { buildKeyTree, captureLayout, commandsOf, type KeyTree } from '@shared/workspaces';
import { api } from './api';
import { panesOf, type LayoutNode } from './layout/layout';
import { analyzeProject } from './projects';
import { askDialog, useStore } from './store';
import { openTab } from './tabs';
import { terminals } from './terminal/terminal-registry';

/** Abas e painéis abertos como layout de workspace (sem comandos iniciais). */
export function captureOpenTabs(): Workspace['tabs'] {
  const { groups, tabs } = useStore.getState();
  return groups.map((g) =>
    captureLayout(g.root as KeyTree, (key): WorkspacePane => {
      const tab = tabs.find((t) => t.key === key);
      return { profileId: tab?.profileId ?? null, cwd: tab?.cwd ?? null, projectId: tab?.projectId ?? null, command: null };
    }),
  );
}

export async function saveWorkspace(workspace: Workspace): Promise<boolean> {
  const result = await api.invoke('workspaces:save', workspace);
  if (!result.ok) useStore.getState().pushNotice('error', result.error);
  return result.ok;
}

/**
 * Abre todas as abas e painéis do workspace. Comandos iniciais só rodam depois da confirmação,
 * cada um quando o shell do seu painel estiver pronto.
 */
export async function openWorkspace(workspace: Workspace): Promise<void> {
  const store = useStore.getState();
  const commands = commandsOf(workspace);
  let runCommands = false;
  if (commands.length > 0) {
    const choice = await askDialog({
      title: `Abrir workspace: ${workspace.name}`,
      message: 'Os painéis vão executar estes comandos:',
      detail: commands.join('\n'),
      buttons: [
        { label: 'Cancelar', value: 'cancel' },
        { label: 'Abrir sem executar', value: 'open' },
        { label: 'Abrir e executar', value: 'run', primary: true },
      ],
    });
    if (choice !== 'open' && choice !== 'run') return;
    runCommands = choice === 'run';
  }

  const pending: { key: string; command: string; expectMarks: boolean }[] = [];
  const projects = new Set<string>();
  let first: string | null = null;
  for (const layout of workspace.tabs) {
    const tree = await buildKeyTree(layout, async (pane) => {
      let profile = store.profiles.find((p) => p.id === pane.profileId);
      if (pane.profileId && (!profile || !profile.available)) {
        store.pushNotice('warning', `Perfil "${pane.profileId}" não encontrado; usando o perfil padrão.`);
        profile = undefined;
      }
      const key = await openTab({
        ...(profile ? { profileId: profile.id } : {}),
        ...(pane.cwd ? { cwd: pane.cwd } : {}),
        projectId: pane.projectId,
        detached: true,
      });
      if (key && runCommands && pane.command?.trim()) pending.push({ key, command: pane.command.trim(), expectMarks: profile?.shellIntegration ?? true });
      if (pane.projectId) projects.add(pane.projectId);
      return key;
    });
    if (!tree) continue;
    const root = tree as LayoutNode;
    const lead = panesOf(root)[0]!;
    first ??= lead;
    useStore.getState().addGroupWithRoot(root, lead);
  }
  if (first) useStore.getState().activate(first);
  for (const id of projects) {
    const project = useStore.getState().config?.projects.projects.find((p) => p.id === id);
    if (project) void analyzeProject(project);
  }
  for (const { key, command, expectMarks } of pending) {
    await terminals.waitForPrompt(key, expectMarks);
    terminals.paste(key, command);
    terminals.input(key, '\r');
  }
}
