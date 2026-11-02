import { describe, expect, it } from 'vitest';
import { findFileCandidates, resolveCandidatePath } from './file-links';

describe('findFileCandidates', () => {
  it('erro do MSBuild com (linha,coluna)', () => {
    const [c] = findFileCandidates('src\\Loja.Api\\Program.cs(42,13): error CS0103: nome não existe');
    expect(c).toEqual({ text: 'src\\Loja.Api\\Program.cs(42,13)', start: 0, path: 'src\\Loja.Api\\Program.cs', line: 42, column: 13 });
  });

  it('TypeScript com linha e coluna', () => {
    expect(findFileCandidates('  src/App.tsx:10:5 - error TS2322')[0]).toMatchObject({ path: 'src/App.tsx', line: 10, column: 5, start: 2 });
  });

  it('arquivo com linha e caminho absoluto', () => {
    expect(findFileCandidates('em Program.cs:42')[0]).toMatchObject({ path: 'Program.cs', line: 42 });
    expect(findFileCandidates('C:\\src\\a.ts:3')[0]).toMatchObject({ path: 'C:\\src\\a.ts', line: 3 });
  });

  it('ignora URLs, versões e pastas sem extensão', () => {
    expect(findFileCandidates('https://localhost:5173/')).toEqual([]);
    expect(findFileCandidates('versão 8.0.404 instalada')).toEqual([]);
    expect(findFileCandidates('cd /usr/bin')).toEqual([]);
  });
});

describe('resolveCandidatePath', () => {
  it('relativo à pasta da aba, com / ou \\ e ..', () => {
    expect(resolveCandidatePath('src/App.tsx', 'C:\\src\\Loja\\frontend', 'cmd')).toBe('C:\\src\\Loja\\frontend\\src\\App.tsx');
    expect(resolveCandidatePath('..\\api\\x.cs', 'C:\\src\\web', 'pwsh')).toBe('C:\\src\\api\\x.cs');
  });

  it('caminhos do Git Bash e do WSL', () => {
    expect(resolveCandidatePath('/c/src/a.ts', null, 'gitbash')).toBe('C:\\src\\a.ts');
    expect(resolveCandidatePath('/mnt/d/x/y.py', null, 'wsl')).toBe('D:\\x\\y.py');
    expect(resolveCandidatePath('/home/ana/app.js', null, 'wsl', 'Ubuntu')).toBe('\\\\wsl.localhost\\Ubuntu\\home\\ana\\app.js');
  });

  it('sem pasta conhecida, relativo não resolve', () => {
    expect(resolveCandidatePath('a.ts', null, 'cmd')).toBeNull();
  });
});
