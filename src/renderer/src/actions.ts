import type { ActionId } from '@shared/model';
import { api } from './api';
import { eventToAccelerator } from './keyboard';
import { hasModalOpen, useStore } from './store';
import { closeTab, cyclePane, cycleTab, openTab, splitActive } from './tabs';
import { terminals } from './terminal/terminal-registry';
import { newHost } from './store/hosts-slice';

export interface Action {
  id: ActionId;
  title: string;
  run(): void | Promise<void>;
}

function activeTerminalKey(): string | null {
  return useStore.getState().activeKey;
}

export async function toggleSidebar(): Promise<void> {
  const ui = useStore.getState().ui;
  if (!ui) return;
  const sidebar = { ...ui.sidebar, visible: !ui.sidebar.visible };
  useStore.getState().setUi({ ...ui, sidebar });
  await api.invoke('state:patch', { sidebar });
}

export async function reloadEnvironment(): Promise<void> {
  const result = await api.invoke('env:reload');
  const store = useStore.getState();
  if ('error' in result) store.pushNotice('error', `Não foi possível recarregar o ambiente: ${result.error}`);
  else store.pushNotice('info', 'Ambiente recarregado. Abas novas usam o ambiente atualizado.');
}

/** Verifica (e baixa) uma versão nova e mostra o resultado na seção "Sobre" das configurações. */
export async function checkForUpdates(): Promise<void> {
  useStore.setState({ overlay: 'settings', settingsSection: 'sobre' });
  const status = await api.invoke('update:check');
  useStore.setState({ update: status });
}

/** Abre o arquivo e mostra a prévia; nada é gravado antes da confirmação. */
export async function startImport(): Promise<void> {
  const preview = await api.invoke('transfer:previewImport');
  if (!preview) return;
  if ('error' in preview) useStore.getState().pushNotice('error', preview.error);
  else useStore.setState({ transferDialog: { kind: 'import', preview } });
}

export const actions: Record<ActionId, Action> = {
  'tab.new': { id: 'tab.new', title: 'Nova aba', run: () => void openTab() },
  'tab.close': {
    id: 'tab.close',
    title: 'Fechar aba',
    run: () => {
      const key = activeTerminalKey();
      if (key) void closeTab(key);
    },
  },
  'tab.next': { id: 'tab.next', title: 'Próxima aba', run: () => cycleTab(1) },
  'tab.prev': { id: 'tab.prev', title: 'Aba anterior', run: () => cycleTab(-1) },
  'palette.open': {
    id: 'palette.open',
    title: 'Paleta de comandos',
    run: () => useStore.setState({ overlay: 'palette' }),
  },
  'terminal.find': {
    id: 'terminal.find',
    title: 'Buscar no terminal',
    run: () => void window.dispatchEvent(new CustomEvent('gunslinger:find')),
  },
  'sidebar.toggle': {
    id: 'sidebar.toggle',
    title: 'Alternar painel lateral',
    run: () => void toggleSidebar(),
  },
  'terminal.copy': {
    id: 'terminal.copy',
    title: 'Copiar seleção',
    run: () => {
      const key = activeTerminalKey();
      const term = key ? terminals.get(key) : undefined;
      if (term?.hasSelection()) void api.invoke('clipboard:write', { text: term.getSelection() });
    },
  },
  'terminal.paste': {
    id: 'terminal.paste',
    title: 'Colar',
    run: async () => {
      const key = activeTerminalKey();
      if (!key) return;
      const text = await api.invoke('clipboard:read');
      if (text) terminals.paste(key, text);
    },
  },
  'env.reload': { id: 'env.reload', title: 'Recarregar ambiente', run: () => void reloadEnvironment() },
  'settings.open': {
    id: 'settings.open',
    title: 'Abrir configurações',
    run: () => useStore.setState({ overlay: 'settings' }),
  },
  'pane.splitRight': {
    id: 'pane.splitRight',
    title: 'Dividir painel à direita',
    run: () => void splitActive('row'),
  },
  'pane.splitDown': {
    id: 'pane.splitDown',
    title: 'Dividir painel abaixo',
    run: () => void splitActive('column'),
  },
  'pane.focusNext': { id: 'pane.focusNext', title: 'Próximo painel', run: () => cyclePane(1) },
  'pane.focusPrev': { id: 'pane.focusPrev', title: 'Painel anterior', run: () => cyclePane(-1) },
  'workspace.save': {
    id: 'workspace.save',
    title: 'Salvar abas como workspace',
    run: () => useStore.setState({ workspacesDialog: 'save' }),
  },
  'workspace.manage': {
    id: 'workspace.manage',
    title: 'Gerenciar workspaces',
    run: () => useStore.setState({ workspacesDialog: 'list' }),
  },
  'logHighlight.toggle': {
    id: 'logHighlight.toggle',
    title: 'Alternar destaque de logs',
    run: async () => {
      const enabled = useStore.getState().config?.settings.logHighlight.enabled ?? true;
      const result = await api.invoke('settings:update', {
        path: ['logHighlight', 'enabled'],
        value: !enabled,
      });
      if (!result.ok) useStore.getState().pushNotice('error', result.error);
      else
        useStore
          .getState()
          .pushNotice('info', enabled ? 'Destaque de logs desligado.' : 'Destaque de logs ligado.');
    },
  },
  'tests.open': {
    id: 'tests.open',
    title: 'Executor de testes',
    run: () => useStore.setState({ testsOpen: true }),
  },
  'dockerPorts.open': {
    id: 'dockerPorts.open',
    title: 'Docker e portas',
    run: () => useStore.setState({ overlay: 'dockerPorts' }),
  },
  'history.open': {
    id: 'history.open',
    title: 'Histórico de dados (restaurar)',
    run: () => useStore.setState({ overlay: 'settings', settingsSection: 'historico' }),
  },
  'plugins.open': {
    id: 'plugins.open',
    title: 'Plugins',
    run: () => useStore.setState({ overlay: 'settings', settingsSection: 'plugins' }),
  },
  'commandHistory.search': {
    id: 'commandHistory.search',
    title: 'Buscar no histórico de comandos',
    run: () => useStore.setState({ overlay: 'commandHistory' }),
  },
  'update.check': { id: 'update.check', title: 'Procurar atualizações', run: () => void checkForUpdates() },
  'data.export': {
    id: 'data.export',
    title: 'Exportar comandos e perfis',
    run: () => useStore.setState({ transferDialog: { kind: 'export' } }),
  },
  'data.import': { id: 'data.import', title: 'Importar comandos e perfis', run: () => void startImport() },
  'hosts.new': { id: 'hosts.new', title: 'Novo host SSH', run: () => useStore.setState({ hostDialog: newHost() }) },
  'keychain.open': { id: 'keychain.open', title: 'Keychain (chaves e identidades SSH)', run: () => useStore.setState({ keychainOpen: true }) },
  'hosts.importOpenSsh': { id: 'hosts.importOpenSsh', title: 'Importar hosts do ~/.ssh/config', run: () => void startOpenSshImport() },
};

/** Lê o ~/.ssh/config e mostra a prévia; nada é gravado antes da confirmação. */
export async function startOpenSshImport(): Promise<void> {
  const preview = await api.invoke('transfer:previewOpenSsh');
  if ('error' in preview) useStore.getState().pushNotice('error', preview.error);
  else useStore.setState({ transferDialog: { kind: 'import', preview } });
}

/** Ação associada ao atalho do evento, segundo os keybindings atuais. */
export function actionForEvent(e: KeyboardEvent): Action | null {
  const accel = eventToAccelerator(e);
  if (!accel) return null;
  const keybindings = useStore.getState().config?.settings.keybindings ?? {};
  for (const [id, binding] of Object.entries(keybindings)) {
    if (binding === accel && id in actions) return actions[id as ActionId];
  }
  return null;
}

/**
 * Atalhos globais em fase de captura: uma combinação associada a uma ação é consumida
 * aqui e nunca chega ao xterm (nem ao shell). As demais seguem normalmente.
 */
export function installGlobalShortcuts(): () => void {
  const listener = (e: KeyboardEvent): void => {
    // Com um modal aberto (diálogo, formulário, configurações, paleta), as teclas são dele.
    if (hasModalOpen(useStore.getState())) return;
    const action = actionForEvent(e);
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    void action.run();
  };
  window.addEventListener('keydown', listener, true);
  return () => window.removeEventListener('keydown', listener, true);
}
