import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PluginService, type PluginSettings } from './plugin-service';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gunslinger-plugins-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function fakeSettings(): PluginSettings & { list: string[] } {
  const listeners = new Set<() => void>();
  const s = {
    list: [] as string[],
    disabled: () => s.list,
    setDisabled: async (ids: string[]) => {
      s.list = ids;
      listeners.forEach((l) => l());
      return { ok: true as const };
    },
    onChange: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
  return s;
}

async function plugin(folder: string, text: string): Promise<void> {
  await mkdir(join(dir, folder), { recursive: true });
  await writeFile(join(dir, folder, 'plugin.json'), text);
}

describe('PluginService', () => {
  it('lê manifestos (com comentários), aponta erros e aplica ativação', async () => {
    await plugin('kit', '// kit do time\n{ "id": "kit", "name": "Kit", "version": "1", "contributes": { "commands": [{ "id": "a", "name": "A", "command": "echo a" }] } }');
    await plugin('quebrado', '{ "id": ');
    await mkdir(join(dir, 'vazio'));
    const settings = fakeSettings();
    const service = new PluginService(dir, settings);
    await service.start();
    try {
      const snap = service.snapshot();
      expect(snap.plugins.map((p) => [p.folder, p.error === null])).toEqual([
        ['kit', true],
        ['quebrado', false],
        ['vazio', false],
      ]);
      expect(snap.plugins[2]!.error).toBe('plugin.json não encontrado');
      expect(snap.contributions.commands.map((c) => c.id)).toEqual(['plugin:kit:a']);

      let events = 0;
      service.onChange(() => events++);
      await service.setEnabled('kit', false);
      expect(settings.list).toEqual(['kit']);
      expect(service.snapshot().contributions.commands).toEqual([]);
      await service.setEnabled('kit', true);
      expect(service.snapshot().contributions.commands).toHaveLength(1);
      expect(events).toBe(2);
    } finally {
      service.stop();
    }
  });

  it('observa a pasta: plugin novo entra sem reiniciar', async () => {
    const service = new PluginService(dir, fakeSettings());
    await service.start(20);
    try {
      expect(service.snapshot().plugins).toEqual([]);
      await plugin('novo', '{ "id": "novo", "name": "Novo", "version": "1" }');
      await expect.poll(() => service.snapshot().plugins.map((p) => p.id), { timeout: 5000 }).toEqual(['novo']);
    } finally {
      service.stop();
    }
  });
});
