import { spawn } from 'node:child_process';
import type { OpenResult } from '@shared/model';

/** Inicia um processo independente do app (não fica preso ao ciclo de vida da janela). */
export function launchDetached(file: string, args: string[]): Promise<OpenResult> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', (err) => resolve({ ok: false, error: err.message }));
    child.once('spawn', () => {
      child.unref();
      resolve({ ok: true });
    });
  });
}
