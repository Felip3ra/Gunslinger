import { describe, expect, it } from 'vitest';
import { defaultSettings } from '@shared/model';
import type { DataSnapshot } from '@shared/transfer-logic';
import type { DialogPort } from '../ports';
import { TransferService, type TransferDeps } from './transfer-service';

function setup(fileContent: string | null) {
  const files = new Map<string, string>();
  if (fileContent !== null) files.set('C:\\in.json', fileContent);
  let data: DataSnapshot = { commands: { version: 1, commands: [] }, projects: { version: 1, projects: [] }, settings: defaultSettings };
  const dialogs: DialogPort = {
    saveFile: async () => 'C:\\out.json',
    openFile: async () => (fileContent === null ? null : 'C:\\in.json'),
    openFolder: async () => null,
    ask: async () => 0,
  };
  const deps: TransferDeps = {
    dialogs,
    snapshot: () => data,
    knownProfileIds: () => ['builtin.cmd'],
    executableExists: async () => true,
    writeProjects: async (projects) => ((data = { ...data, projects }), { ok: true }),
    writeCommands: async (commands) => ((data = { ...data, commands }), { ok: true }),
    writeCustomProfiles: async () => ({ ok: true }),
    readFile: async (p) => files.get(p) ?? '',
    writeFile: async (p, c) => void files.set(p, c),
  };
  return { service: new TransferService(deps), files, data: () => data };
}

describe('TransferService', () => {
  it('exporta para o caminho escolhido no diálogo', async () => {
    const { service, files } = setup(null);
    expect(await service.export({ categories: 'all', profileIds: [], projectIds: [] })).toEqual({ path: 'C:\\out.json' });
    expect(JSON.parse(files.get('C:\\out.json')!).format).toBe('gunslinger-export');
  });

  it('cancelar o diálogo não faz nada', async () => {
    expect(await setup(null).service.preview()).toBeNull();
  });

  it('JSON inválido gera erro sem prévia', async () => {
    const result = await setup('{ quebrado').service.preview();
    expect(result).toMatchObject({ error: expect.stringMatching(/^Arquivo de importação inválido/) });
  });

  it('prévia e aplicação gravam só depois da confirmação', async () => {
    const file = JSON.stringify({
      format: 'gunslinger-export',
      version: 1,
      exportedAt: 'x',
      commands: [{ id: 'c1', name: 'A', command: 'echo a', description: '', category: '', targetProfileId: null, cwd: null, projectId: null, variables: {} }],
    });
    const { service, data } = setup(file);
    const preview = await service.preview();
    if (!preview || 'error' in preview) throw new Error('prévia esperada');
    expect(data().commands.commands).toHaveLength(0);
    expect(await service.apply(preview.previewId, [])).toEqual({ added: 1, replaced: 0, skipped: 0 });
    expect(data().commands.commands).toHaveLength(1);
    await expect(service.apply(preview.previewId, [])).rejects.toThrow(/expirada/);
  });
});
