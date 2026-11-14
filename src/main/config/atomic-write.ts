import { copyFile, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Grava de forma atômica: escreve em <arquivo>.tmp, faz fsync e renomeia por cima do original.
 * Se `backup` for verdadeiro, a versão atual é copiada para <arquivo>.bak antes.
 */
export async function writeFileAtomic(path: string, content: string, options: { backup?: boolean } = {}): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const handle = await open(tmp, 'w');
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (options.backup) {
    try {
      await copyFile(path, `${path}.bak`);
    } catch {
      // ainda não existe versão anterior
    }
  }
  try {
    await renameWithRetry(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

/** Códigos que o Windows devolve enquanto outro programa (antivírus, editor) segura o arquivo. */
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES']);
const RENAME_RETRY_DELAYS_MS = [20, 50, 100, 200];

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (err) {
      const delay = RENAME_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !TRANSIENT.has((err as NodeJS.ErrnoException).code ?? '')) throw err;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
