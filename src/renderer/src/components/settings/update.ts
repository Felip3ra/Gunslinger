import { api } from '../../api';
import { useStore } from '../../store';

/** Grava um campo do settings.json e mostra o erro, se houver. */
export async function update(path: (string | number)[], value: unknown): Promise<void> {
  const result = await api.invoke('settings:update', { path, value });
  if (!result.ok) useStore.getState().pushNotice('error', result.error);
}
