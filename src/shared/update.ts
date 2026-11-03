/** Estado da atualização automática, como o renderer o vê. */
export type UpdateStatus =
  /** Build de desenvolvimento ou sem instalador: não há de onde atualizar. */
  | { state: 'unsupported'; currentVersion: string }
  | { state: 'idle'; currentVersion: string; checkedAt: number | null }
  | { state: 'checking'; currentVersion: string }
  | { state: 'downloading'; currentVersion: string; version: string; percent: number }
  /** Baixada: instala ao reiniciar (ou ao fechar o app). */
  | { state: 'ready'; currentVersion: string; version: string }
  | { state: 'error'; currentVersion: string; message: string };

/** Primeira verificação depois de abrir o app e intervalo entre as seguintes. */
export const UPDATE_FIRST_CHECK_MS = 15_000;
export const UPDATE_INTERVAL_MS = 4 * 60 * 60 * 1000;
