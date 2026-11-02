import { describe, expect, it } from 'vitest';
import { posixAdapter } from '../platform/posix';
import { buildEditorArgs, openInEditor } from './open-editor';

describe('buildEditorArgs', () => {
  it('substitui arquivo, linha e coluna', () => {
    expect(buildEditorArgs(['-g', '{file}:{line}:{column}'], 'C:\\a b\\Program.cs', 42, 13)).toEqual(['-g', 'C:\\a b\\Program.cs:42:13']);
  });

  it('usa linha e coluna 1 quando não informadas', () => {
    expect(buildEditorArgs(['{file}:{line}:{column}'], 'x.ts')).toEqual(['x.ts:1:1']);
  });
});

describe('openInEditor', () => {
  it('recusa arquivo inexistente sem iniciar processo', async () => {
    const result = await openInEditor(posixAdapter, {}, { command: 'code', args: ['{file}'] }, 'C:\\nao\\existe.cs');
    expect(result).toEqual({ ok: false, error: 'Arquivo não encontrado: C:\\nao\\existe.cs' });
  });

  it('editor ausente gera erro descritivo', async () => {
    const result = await openInEditor({ ...posixAdapter, resolveExecutable: async () => null }, {}, { command: 'editor-x', args: ['{file}'] }, __filename);
    expect(result).toEqual({ ok: false, error: 'Editor "editor-x" não encontrado.' });
  });
});
