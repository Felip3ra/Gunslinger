import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HistoryFiles } from '@shared/history';
import { HistoryService, type HistorySource } from './history-service';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gunslinger-history-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const commands = (...names: string[]): string => JSON.stringify({ version: 1, commands: names.map((name) => ({ name })) });

function fakeSource(initial: HistoryFiles): HistorySource & { files: HistoryFiles | null; changed(): void } {
  const listeners = new Set<() => void>();
  const source = {
    files: initial as HistoryFiles | null,
    fileTexts: () => (source.files ? { ...source.files } : null),
    restoreFiles: async (texts: HistoryFiles) => {
      source.files = { ...source.files, ...texts };
      return { ok: true as const };
    },
    onChange: (l: () => void) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    changed: () => listeners.forEach((l) => l()),
  };
  return source;
}

describe('HistoryService', () => {
  it('captura ao iniciar e não repete estados iguais', async () => {
    const source = fakeSource({ commands: commands('a') });
    const history = new HistoryService(dir, source, { debounceMs: 10 });
    await history.start();
    await history.capture('auto');
    expect(await history.list()).toHaveLength(1);

    source.files = { commands: commands('a', 'b') };
    source.changed();
    await expect.poll(() => history.list().then((l) => l.length)).toBe(2);
    const [latest] = await history.list();
    expect(latest!.counts.commands).toBe(2);
    history.stop();
  });

  it('ponto com nome é gravado mesmo sem mudança e sobrevive à retenção', async () => {
    let now = 1_000;
    const source = fakeSource({ commands: commands() });
    const history = new HistoryService(dir, source, { keep: 2, now: () => now++ });
    await history.capture('manual', 'Antes de reorganizar');
    for (let i = 0; i < 4; i++) {
      source.files = { commands: commands(...Array.from({ length: i + 1 }, (_, j) => `c${j}`)) };
      await history.capture('auto');
    }
    const list = await history.list();
    expect(list.map((e) => e.kind)).toEqual(['auto', 'auto', 'manual']);
    expect(list[2]!.label).toBe('Antes de reorganizar');
    expect(await readdir(dir)).toHaveLength(3);
  });

  it('restaurar grava "antes de restaurar" e devolve os arquivos do snapshot', async () => {
    const source = fakeSource({ commands: commands('Build') });
    const history = new HistoryService(dir, source);
    await history.capture('auto');
    const [old] = await history.list();
    source.files = { commands: commands() };

    expect((await history.restore(old!.id)).ok).toBe(true);
    expect(JSON.parse(source.files!.commands!).commands).toEqual([{ name: 'Build' }]);
    const list = await history.list();
    expect(list[0]).toMatchObject({ kind: 'restore', label: 'Antes de restaurar', counts: { commands: 0 } });
  });

  it('arquivo inválido: sem captura; id desconhecido ou malformado é recusado', async () => {
    const source = fakeSource({ commands: commands() });
    source.files = null;
    const history = new HistoryService(dir, source);
    expect((await history.capture('manual', 'x')).ok).toBe(false);
    expect((await history.restore('../settings')).ok).toBe(false);
    expect((await history.remove('../settings')).ok).toBe(false);
  });
});
