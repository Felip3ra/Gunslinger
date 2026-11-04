import { describe, expect, it } from 'vitest';
import { workspaceSchema, type Workspace, type WorkspacePane } from './model';
import { buildKeyTree, captureLayout, commandsOf, type KeyTree } from './workspaces';

const pane = (cwd: string, command: string | null = null): WorkspacePane => ({ profileId: 'builtin.cmd', cwd, projectId: null, command, hostId: null });

describe('workspaces', () => {
  const tree: KeyTree = { type: 'split', direction: 'row', sizes: [0.7, 0.3], children: [{ type: 'pane', key: 'a' }, { type: 'pane', key: 'b' }] };

  it('captura o layout aberto com tamanhos e dados dos painéis', () => {
    const layout = captureLayout(tree, (key) => pane(key === 'a' ? 'C:\\api' : 'C:\\web'));
    expect(layout).toEqual({ type: 'split', direction: 'row', sizes: [0.7, 0.3], children: [{ type: 'pane', pane: pane('C:\\api') }, { type: 'pane', pane: pane('C:\\web') }] });
  });

  it('monta a árvore criando os painéis em ordem; painéis que falham saem', async () => {
    const layout = captureLayout(tree, (key) => pane(key));
    const created: string[] = [];
    const rebuilt = await buildKeyTree(layout, async (p) => (created.push(p.cwd!), p.cwd === 'b' ? null : `novo-${p.cwd}`));
    expect(created).toEqual(['a', 'b']);
    expect(rebuilt).toEqual({ type: 'pane', key: 'novo-a' });
  });

  it('lista os comandos iniciais e valida o schema', () => {
    const ws: Workspace = { id: 'w', name: 'Loja', tabs: [{ type: 'pane', pane: pane('C:\\api', 'dotnet watch run') }, captureLayout(tree, (k) => pane(k, k === 'b' ? 'npm run dev' : '  '))] };
    expect(commandsOf(ws)).toEqual(['dotnet watch run', 'npm run dev']);
    expect(workspaceSchema.safeParse(ws).success).toBe(true);
    expect(workspaceSchema.safeParse({ ...ws, tabs: [{ type: 'split', direction: 'row', sizes: [1], children: [] }] }).success).toBe(false);
  });
});
