import { recordCommand, type CommandHistoryEntry } from '@shared/command-history';
import { api } from './api';
import { useStore } from './store';
import { terminals } from './terminal/terminal-registry';

/** Vários comandos seguidos viram uma gravação só do state.json. */
const SAVE_DELAY_MS = 1000;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const commandHistory = useStore.getState().ui?.commandHistory ?? [];
    void api.invoke('state:patch', { commandHistory }).catch(() => undefined);
  }, SAVE_DELAY_MS);
}

/** Guarda um comando que terminou (se o histórico estiver ligado nas configurações). */
export function rememberCommand(command: string, cwd: string | null, exitCode: number | null): void {
  const { ui, config } = useStore.getState();
  if (!ui || !config?.settings.terminal.commandHistory) return;
  const commandHistory = recordCommand(ui.commandHistory, { command, cwd, at: Date.now(), exitCode });
  if (commandHistory.length === ui.commandHistory.length && commandHistory[0] === ui.commandHistory[0]) return;
  useStore.getState().setUi({ ...ui, commandHistory });
  scheduleSave();
}

export function clearCommandHistory(): void {
  const ui = useStore.getState().ui;
  if (!ui) return;
  useStore.getState().setUi({ ...ui, commandHistory: [] });
  scheduleSave();
}

/** Escreve o comando no terminal ativo; só executa com `execute` (Ctrl+Enter na busca). */
export function applyHistoryEntry(entry: CommandHistoryEntry, execute: boolean): void {
  const key = useStore.getState().activeKey;
  if (!key) return;
  terminals.paste(key, entry.command);
  if (execute) terminals.input(key, '\r');
  terminals.focus(key);
}
