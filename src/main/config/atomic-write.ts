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
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}
