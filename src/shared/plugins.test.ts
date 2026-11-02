import { describe, expect, it } from 'vitest';
import { defaultTheme } from './model/settings';
import { resolvePlugins } from './plugins';

const kit = {
  id: 'kit-loja',
  name: 'Kit Loja',
  version: '1.0.0',
  contributes: {
    commands: [{ id: 'db', name: 'Subir banco', command: 'docker compose up -d db' }],
    themes: [{ id: 'escuro', name: 'Loja Escuro', theme: defaultTheme }],
    logHighlight: [{ pattern: 'PEDIDO-\\d+', foreground: '#ff00ff' }],
    workspaces: [{ id: 'full', name: 'Loja completa', tabs: [{ type: 'pane', pane: { command: 'npm run dev' } }] }],
    profiles: [{ id: 'node', name: 'Node REPL', executable: 'node.exe' }],
  },
};

describe('plugins declarativos', () => {
  it('junta as contribuições com ids no namespace do plugin', () => {
    const { plugins, contributions } = resolvePlugins([{ folder: 'kit', data: kit }], []);
    expect(plugins[0]).toMatchObject({ id: 'kit-loja', enabled: true, error: null, counts: { commands: 1, themes: 1, logHighlight: 1, workspaces: 1, profiles: 1 } });
    expect(contributions.commands[0]).toMatchObject({ id: 'plugin:kit-loja:db', name: 'Subir banco', category: 'Kit Loja' });
    expect(contributions.workspaces[0]).toMatchObject({ id: 'plugin:kit-loja:full', name: 'Loja completa (Kit Loja)' });
    expect(contributions.profiles[0]).toMatchObject({ id: 'plugin.kit-loja.node', args: [], shellIntegration: false });
    expect(contributions.themes[0]).toMatchObject({ id: 'kit-loja.escuro', pluginName: 'Kit Loja' });
    expect(contributions.highlightRules).toHaveLength(1);
  });

  it('chave desconhecida em contributes é erro e não contribui', () => {
    const { plugins, contributions } = resolvePlugins([{ folder: 'mal', data: { ...kit, contributes: { scripts: ['x.js'] } } }], []);
    expect(plugins[0]!.error).toMatch(/chave não suportada: scripts/);
    expect(contributions.commands).toEqual([]);
  });

  it('desativado e id repetido não contribuem; erro de leitura aparece', () => {
    const { plugins, contributions } = resolvePlugins(
      [
        { folder: 'b-copia', data: kit },
        { folder: 'a-kit', data: kit },
        { folder: 'c', error: 'plugin.json não encontrado' },
      ],
      [],
    );
    expect(plugins.map((p) => [p.folder, p.error])).toEqual([
      ['a-kit', null],
      ['b-copia', 'id "kit-loja" repetido (outra pasta já usa)'],
      ['c', 'plugin.json não encontrado'],
    ]);
    expect(contributions.commands).toHaveLength(1);
    expect(resolvePlugins([{ folder: 'kit', data: kit }], ['kit-loja']).contributions.commands).toEqual([]);
  });
});
