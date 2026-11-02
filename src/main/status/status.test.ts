import { describe, expect, it } from 'vitest';
import { parseGitStatusV2 } from './git-parse';
import { findRelevance } from './relevance';

describe('parseGitStatusV2', () => {
  it('branch com alterações', () => {
    const out = '# branch.oid 1234567890abcdef\n# branch.head feature/pedidos\n# branch.upstream origin/x\n1 .M N... 100644 100644 100644 a b src/a.ts\n';
    expect(parseGitStatusV2(out)).toEqual({ branch: 'feature/pedidos', detachedSha: null, dirty: true, partial: false });
  });

  it('repositório limpo', () => {
    expect(parseGitStatusV2('# branch.oid abc\n# branch.head main\n').dirty).toBe(false);
  });

  it('não rastreados contam como alteração; ignorados não', () => {
    expect(parseGitStatusV2('# branch.head main\n? novo.txt\n').dirty).toBe(true);
    expect(parseGitStatusV2('# branch.head main\n! bin/x\n').dirty).toBe(false);
  });

  it('HEAD destacado mostra o hash curto', () => {
    expect(parseGitStatusV2('# branch.oid a1b2c3d4e5f6\n# branch.head (detached)\n')).toMatchObject({ branch: null, detachedSha: 'a1b2c3d' });
  });
});

describe('findRelevance', () => {
  const tree: Record<string, string[]> = {
    'C:\\src\\Loja\\frontend\\src': ['App.tsx'],
    'C:\\src\\Loja\\frontend': ['package.json', 'src'],
    'C:\\src\\Loja': ['Loja.sln', 'frontend'],
    'C:\\src': [],
    'C:\\': [],
  };
  const list = async (d: string): Promise<string[]> => {
    const entries = tree[d];
    if (!entries) throw new Error('ENOENT');
    return entries;
  };

  it('acha os marcadores mais próximos subindo a árvore', async () => {
    expect(await findRelevance('C:\\src\\Loja\\frontend\\src', list)).toEqual({ nodeDir: 'C:\\src\\Loja\\frontend', dotnetDir: 'C:\\src\\Loja' });
  });

  it('pasta sem relação com Node nem .NET', async () => {
    expect(await findRelevance('C:\\src', list)).toEqual({ nodeDir: null, dotnetDir: null });
  });
});
