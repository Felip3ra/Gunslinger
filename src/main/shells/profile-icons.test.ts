import { describe, expect, it } from 'vitest';
import { isIconFile, loadIconData } from './profile-icons';

describe('ícones de perfil por arquivo', () => {
  it('reconhece só caminhos de imagem', () => {
    expect(isIconFile('C:\\icons\\api.PNG')).toBe(true);
    expect(isIconFile('builtin:node')).toBe(false);
    expect(isIconFile('C:\\tools\\app.exe')).toBe(false);
  });

  it('devolve data URL e recusa arquivos ausentes ou grandes', async () => {
    expect(await loadIconData('a.png', async () => Buffer.from([1, 2, 3]))).toBe('data:image/png;base64,AQID');
    expect(await loadIconData('a.svg', async () => Buffer.alloc(300 * 1024))).toBeNull();
    expect(
      await loadIconData('a.ico', async () => {
        throw new Error('ENOENT');
      }),
    ).toBeNull();
  });
});
