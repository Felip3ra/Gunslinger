import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
const MAX_BYTES = 256 * 1024;

/** true quando o ícone do perfil é um caminho de imagem (e não um ícone embutido "builtin:"). */
export function isIconFile(icon: string): boolean {
  return !icon.startsWith('builtin:') && extname(icon).toLowerCase() in MIME;
}

/**
 * Lê a imagem como data URL (o CSP do renderer só aceita imagens locais via data:).
 * null quando o arquivo não existe, é grande demais ou não é uma imagem suportada.
 */
export async function loadIconData(path: string, read: (p: string) => Promise<Buffer> = readFile): Promise<string | null> {
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime || !isIconFile(path)) return null;
  try {
    const data = await read(path);
    return data.length <= MAX_BYTES ? `data:${mime};base64,${data.toString('base64')}` : null;
  } catch {
    return null;
  }
}
