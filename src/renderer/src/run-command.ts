import type { RunnableCommand } from '@shared/runnable';
import { renderTemplate } from '@shared/variables';
import { api } from './api';
import { DOTNET_EF_INSTALL, runPreflight } from './preflight';
import { initialValues, planCwd, planTarget, type PlanContext, type Target } from './run-plan';
import { askDialog, useStore } from './store';
import { openTab } from './tabs';
import { terminals } from './terminal/terminal-registry';

export type RunMode = 'execute' | 'insert';

export { initialValues } from './run-plan';

export interface VariablesPrompt {
  command: RunnableCommand;
  mode: RunMode;
  initial: Record<string, string>;
  /** Variáveis preenchidas a partir do projeto ativo (mostradas como tal no diálogo). */
  fromProject: string[];
  resolve(values: Record<string, string> | null): void;
}

function planContext(): PlanContext {
  const s = useStore.getState();
  const tab = s.tabs.find((t) => t.key === s.activeKey);
  return {
    activeTab: tab ? { key: tab.key, profileId: tab.profileId, projectId: tab.projectId, running: tab.status === 'running', cwd: tab.cwd } : undefined,
    profiles: s.profiles,
    projects: s.config?.projects.projects ?? [],
    defaultProfileId: s.config?.settings.defaultProfile ?? null,
  };
}

function askVariables(command: RunnableCommand, mode: RunMode, initial: Record<string, string>, fromProject: string[]): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    useStore.setState({
      variablesPrompt: {
        command,
        mode,
        initial,
        fromProject,
        resolve: (values) => {
          useStore.setState({ variablesPrompt: null });
          resolve(values);
        },
      },
    });
  });
}

async function confirmFallback(missing: string, target: Target): Promise<boolean> {
  const answer = await askDialog({
    title: 'Shell de destino não encontrado',
    message: `O shell de destino "${missing}" não existe ou está indisponível. Executar com "${target.profile.name}"?`,
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: `Usar ${target.profile.name}`, value: 'ok', primary: true },
    ],
  });
  return answer === 'ok';
}

/** Aba ocupada: oferece aba nova. Devolve o alvo (talvez trocado) ou null se cancelado. */
async function avoidBusyTab(target: Target): Promise<Target | null> {
  if (!target.tabKey) return target;
  const tab = useStore.getState().tabs.find((t) => t.key === target.tabKey);
  const busy = tab?.sessionId ? await api.invoke('pty:isBusy', { sessionId: tab.sessionId }).catch(() => false) : false;
  if (!busy) return target;
  const choice = await askDialog({
    title: 'Terminal ocupado',
    message: 'A aba ativa está executando um processo.',
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: 'Abrir nova aba', value: 'new', primary: true },
    ],
  });
  return choice === 'new' ? { ...target, tabKey: null } : null;
}

async function addRecent(id: string): Promise<void> {
  const ui = useStore.getState().ui;
  if (!ui) return;
  const recents = [id, ...ui.recents.filter((r) => r !== id)].slice(0, 50);
  useStore.getState().setUi({ ...ui, recents });
  await api.invoke('state:patch', { recents }).catch(() => undefined);
}

/**
 * Executa (ou insere) um comando. Esta é a única porta de envio de comandos salvos/gerados
 * para um terminal, e só é chamada por ação explícita do usuário.
 */
export async function runCommand(command: RunnableCommand, mode: RunMode): Promise<boolean> {
  const store = useStore.getState();
  if (command.disabledReason) {
    store.pushNotice('warning', command.disabledReason);
    return false;
  }

  const plan = planTarget(command, planContext());
  if (!plan.target) return false;
  if (plan.missingProfileId && !(await confirmFallback(plan.missingProfileId, plan.target))) return false;
  let target = await avoidBusyTab(plan.target);
  if (!target) return false;

  // Ferramentas: só avisa, com "Executar mesmo assim" (não roda em abas WSL).
  if (command.preflight.length > 0 && target.profile.shellType !== 'wsl') {
    const install = (): void =>
      void runCommand({ ...command, id: 'dotnet-ef-install', title: 'Instalar dotnet-ef', text: DOTNET_EF_INSTALL, variables: {}, preflight: [], confirm: false }, 'execute');
    if (!(await runPreflight(command, target.profile, install))) return false;
  }

  // Variáveis (e confirmação com pré-visualização quando pedida).
  const projectVars = store.config?.projects.projects.find((p) => p.id === target!.projectId)?.variables ?? {};
  const { values: initial, fromProject } = initialValues(command, projectVars);
  let values = initial;
  if (Object.keys(initial).length > 0 || command.confirm) {
    const answered = await askVariables(command, mode, initial, fromProject);
    if (!answered) return false;
    values = answered;
  }
  const text = renderTemplate(command.text, values);

  // Pasta de execução.
  const tabCwd = target.tabKey ? (useStore.getState().tabs.find((t) => t.key === target!.tabKey)?.cwd ?? null) : null;
  const cwdPlan = planCwd(command.cwd, target, tabCwd);
  let prefix: string | null = null;
  let newTabCwd: string | undefined;
  if (cwdPlan.kind === 'newTabIn') {
    target = { ...target, tabKey: null };
    newTabCwd = cwdPlan.cwd;
  } else if (cwdPlan.kind === 'askCd') {
    const choice = await askDialog({
      title: 'Pasta de execução',
      message: `Mudar a pasta da aba para ${cwdPlan.cwd} antes de executar?`,
      buttons: [
        { label: 'Cancelar', value: 'cancel' },
        { label: 'Executar na pasta atual', value: 'here' },
        { label: 'Mudar pasta', value: 'cd', primary: true },
      ],
    });
    if (choice === null || choice === 'cancel') return false;
    if (choice === 'cd') prefix = cwdPlan.cdCommand;
  }

  let key = target.tabKey;
  if (!key) {
    key = await openTab({ profileId: target.profile.id, ...(newTabCwd ? { cwd: newTabCwd } : {}), projectId: target.projectId });
    if (!key) return false;
    await terminals.waitForPrompt(key, target.profile.shellIntegration);
  }

  useStore.getState().activate(key);
  // O Enter vai fora do bloco colado (bracketed paste), senão não executaria.
  if (prefix) terminals.input(key, prefix + '\r');
  terminals.paste(key, text);
  if (mode === 'execute') terminals.input(key, '\r');
  terminals.focus(key);
  void addRecent(command.id);
  return true;
}
