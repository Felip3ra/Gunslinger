import type { ShellProfile } from '@shared/model';
import { api } from './api';
import { activeTab, useStore } from './store';
import { openTab } from './tabs';

/** Perfis que podem abrir como administrador. */
export function canElevate(profile: ShellProfile): boolean {
  return ['powershell', 'pwsh', 'cmd', 'gitbash'].includes(profile.shellType) && profile.available;
}

/**
 * Abre o perfil como administrador: dentro de uma aba (sudo inline/gsudo) ou, sem esses
 * mecanismos, numa janela separada do Windows, explicando como habilitar o sudo.
 */
export async function openElevated(profileId: string): Promise<void> {
  const store = useStore.getState();
  const info = await api.invoke('elevation:info');
  if (info.mechanism !== 'external') {
    await openTab({ profileId, elevated: true });
    return;
  }
  const cwd = activeTab(store)?.cwd ?? undefined;
  const result = await api.invoke('elevation:openExternal', { profileId, ...(cwd ? { cwd } : {}) });
  if (!result.ok) {
    store.pushNotice('error', `Não foi possível abrir como administrador: ${result.error}`);
    return;
  }
  store.pushNotice('warning', `O shell elevado abriu numa janela separada. ${info.hint ?? ''}`.trim());
}
