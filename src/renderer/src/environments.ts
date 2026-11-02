import { envCommands } from '@shared/env-profiles';
import { askDialog, activeTab, useStore } from './store';
import { openTab } from './tabs';
import { terminals } from './terminal/terminal-registry';

function profile(id: string) {
  return useStore.getState().config?.settings.environments.find((e) => e.id === id);
}

/** Nova aba cujo processo já nasce com as variáveis do perfil (resolvidas no main). */
export async function openWithEnvironment(envProfileId: string): Promise<void> {
  if (!profile(envProfileId)) return;
  await openTab({ envProfileId });
}

/** Digita na aba ativa os comandos que definem as variáveis, depois da pré-visualização/confirmação. */
export async function applyEnvironment(envProfileId: string): Promise<boolean> {
  const store = useStore.getState();
  const env = profile(envProfileId);
  const tab = activeTab(store);
  if (!env || !tab || tab.status !== 'running') return false;
  const shell = store.profiles.find((p) => p.id === tab.profileId);
  const commands = shell ? envCommands(shell.shellType, env.variables) : null;
  if (!commands) {
    store.pushNotice('warning', 'Este shell não é reconhecido: use "Nova aba com ambiente".');
    return false;
  }
  const choice = await askDialog({
    title: env.confirm ? `Ambiente sensível: ${env.name}` : `Aplicar ambiente: ${env.name}`,
    message: env.confirm
      ? `Os comandos desta aba passarão a usar ${env.name}. Confirme que é isso mesmo.`
      : 'Estes comandos serão enviados à aba ativa:',
    detail: commands.join('\n'),
    buttons: [
      { label: 'Cancelar', value: 'cancel' },
      { label: env.confirm ? `Aplicar ${env.name}` : 'Aplicar', value: 'ok', primary: true },
    ],
  });
  if (choice !== 'ok') return false;
  for (const command of commands) {
    terminals.paste(tab.key, command);
    terminals.input(tab.key, '\r');
  }
  useStore.getState().updateTab(tab.key, { envProfileId });
  return true;
}
