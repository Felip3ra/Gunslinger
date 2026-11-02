import { describe, expect, it } from 'vitest';
import { defaultSettings, type Project, type SavedCommand } from './model';
import { exportFileSchema } from './transfer';
import { applyImport, buildExport, previewItems, type DataSnapshot } from './transfer-logic';

const cmd = (id: string, name: string, category: string, extra: Partial<SavedCommand> = {}): SavedCommand => ({
  id, name, command: `echo ${name}`, description: '', category, targetProfileId: null, cwd: null, projectId: null, variables: {}, ...extra,
});
const project = (id: string, name: string): Project => ({
  id, name, rootPath: `C:\\src\\${name}`, defaultProfileId: null, types: { dotnet: true, node: false }, variables: {}, node: { packageManagerOverrides: {} },
});

const data: DataSnapshot = {
  commands: { version: 1, commands: [cmd('g1', 'Status', 'Git'), cmd('e1', 'Nova migration', 'EF'), cmd('e2', 'Remover', 'EF')] },
  projects: { version: 1, projects: [project('p1', 'Loja')] },
  settings: {
    ...defaultSettings,
    profiles: { overrides: {}, custom: [{ id: 'node', name: 'Node REPL', executable: 'node.exe', args: [], cwd: null, color: null, icon: null, shellIntegration: false }] },
  },
};

describe('buildExport', () => {
  it('exporta só a categoria escolhida, sem perfis detectados nem preferências', () => {
    const file = buildExport(data, { categories: ['EF'], profileIds: [], projectIds: [] }, new Date('2026-11-02T00:00:00Z'));
    expect(file.commands.map((c) => c.id)).toEqual(['e1', 'e2']);
    expect(file).not.toHaveProperty('settings');
    expect(exportFileSchema.safeParse(file).success).toBe(true);
  });
});

describe('importação', () => {
  const ctx = { knownProfileIds: new Set(['builtin.cmd', 'node']), executableExists: (p: { executable: string }) => p.executable !== 'C:\\tools\\fish.exe' };
  const file = exportFileSchema.parse({
    format: 'gunslinger-export',
    version: 1,
    exportedAt: 'x',
    commands: [cmd('x1', 'Nova migration', 'EF'), cmd('x2', 'Seed', '', { projectId: 'fantasma', targetProfileId: 'builtin.zsh' })],
    profiles: [{ id: 'fish', name: 'Fish', executable: 'C:\\tools\\fish.exe', args: [], cwd: null, color: null, icon: null, shellIntegration: false }],
    projects: [],
  });

  it('prévia marca conflitos e observações, com o texto completo do comando', () => {
    const items = previewItems(data, file, ctx);
    expect(items[0]).toMatchObject({ kind: 'command', conflictWith: 'Nova migration', detail: 'echo Nova migration' });
    expect(items[1]!.notes).toEqual(['Projeto vinculado não existe: será importado como comando global.', 'Shell de destino não encontrado nesta máquina.']);
    expect(items[2]!.notes[0]).toMatch(/indisponível/);
  });

  it('manter ambos renomeia; projeto desconhecido vira global; perfil ausente é importado', () => {
    let n = 0;
    const applied = applyImport(data, file, [{ key: 'command:x1', action: 'keepBoth' }], () => `novo${++n}`);
    const names = applied.commands.commands.filter((c) => c.category === 'EF').map((c) => c.name);
    expect(names).toEqual(['Nova migration', 'Remover', 'Nova migration (2)']);
    expect(applied.commands.commands.find((c) => c.name === 'Seed')!.projectId).toBeNull();
    expect(applied.customProfiles.map((p) => p.name)).toEqual(['Node REPL', 'Fish']);
    expect(applied.result).toEqual({ added: 3, replaced: 0, skipped: 0 });
  });

  it('substituir mantém o id existente; ignorar não altera', () => {
    const replaced = applyImport(data, file, [{ key: 'command:x1', action: 'replace' }], () => 'z');
    expect(replaced.commands.commands.filter((c) => c.name === 'Nova migration')).toHaveLength(1);
    expect(replaced.commands.commands.find((c) => c.name === 'Nova migration')!.id).toBe('e1');
    const skipped = applyImport(data, file, [{ key: 'command:x1', action: 'skip' }], () => 'z');
    expect(skipped.result.skipped).toBe(1);
  });
});
