import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '@shared/model';
import { ConfigStore, CURRENT_VERSION } from './config-store';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gunslinger-config-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const read = (name: string): Promise<string> => readFile(join(dir, name), 'utf8');

describe('ConfigStore', () => {
  it('cria os arquivos padrão na primeira execução', async () => {
    const store = new ConfigStore(join(dir, 'Gunslinger'));
    const snap = await store.load();
    expect(snap.issues).toEqual([]);
    expect(snap.settings.appearance.fontSize).toBe(14);
    const settings = JSON.parse(await readFile(join(dir, 'Gunslinger', 'settings.json'), 'utf8'));
    expect(settings.version).toBe(1);
    expect(JSON.parse(await readFile(join(dir, 'Gunslinger', 'commands.json'), 'utf8'))).toEqual({ version: 1, commands: [] });
  });

  it('keychain e known hosts ficam fora do snapshot do renderer', async () => {
    const store = new ConfigStore(dir);
    await store.load();
    await store.mutateKeychain((f) => ({
      ...f,
      identities: [{ id: 'i1', name: 'deploy', username: 'deploy', passwordSecretId: 'segredo-1' }],
    }));
    const snap = store.snapshot();
    expect(JSON.stringify(snap)).not.toContain('segredo-1');
    expect(snap.hosts).toEqual({ version: 1, groups: [], hosts: [] });
    expect(store.keychainFile().identities[0]?.passwordSecretId).toBe('segredo-1');
  });

  it('keychain.json inválido não é sobrescrito e bloqueia gravações', async () => {
    const broken = '{ "version": 1, "keys": [ { "id": 1 } ], "identities": [] }';
    await writeFile(join(dir, 'keychain.json'), broken);
    const store = new ConfigStore(dir);
    const snap = await store.load();
    expect(snap.readOnly.keychain).toBe(true);
    expect(snap.issues.some((i) => i.file === 'keychain')).toBe(true);
    const r = await store.mutateKeychain((f) => f);
    expect(r.ok).toBe(false);
    expect(await read('keychain.json')).toBe(broken);
  });

  it('JSON quebrado: usa os padrões, informa a linha e não altera o arquivo', async () => {
    const broken = '{\n  "version": 1,\n  "defaultProfile": "builtin.cmd",\n}\n';
    await writeFile(join(dir, 'settings.json'), broken);
    const store = new ConfigStore(dir);
    const snap = await store.load();
    expect(snap.readOnly.settings).toBe(true);
    expect(snap.settings.defaultProfile).toBe(defaultSettings.defaultProfile);
    expect(snap.issues[0]).toMatchObject({ file: 'settings', line: 4, severity: 'error' });
    expect(await read('settings.json')).toBe(broken);
  });

  it('campo inválido: só ele volta ao padrão, com aviso citando o campo', async () => {
    await writeFile(
      join(dir, 'settings.json'),
      JSON.stringify({ version: 1, defaultProfile: 'builtin.cmd', appearance: { fontSize: 'grande', fontFamily: 'Fira Code' } }),
    );
    const snap = await new ConfigStore(dir).load();
    expect(snap.settings.appearance.fontSize).toBe(14);
    expect(snap.settings.appearance.fontFamily).toBe('Fira Code');
    expect(snap.settings.defaultProfile).toBe('builtin.cmd');
    expect(snap.issues.map((i) => i.path.join('.'))).toEqual(['appearance.fontSize']);
  });

  it('aceita comentários no settings.json', async () => {
    await writeFile(join(dir, 'settings.json'), '// meu arquivo\n{ "version": 1, "defaultProfile": "builtin.cmd" }');
    const snap = await new ConfigStore(dir).load();
    expect(snap.issues).toEqual([]);
    expect(snap.settings.defaultProfile).toBe('builtin.cmd');
  });

  it('recusa gravar pela UI enquanto o arquivo estiver inválido', async () => {
    await writeFile(join(dir, 'commands.json'), '{ "version": 1, "commands": [ }');
    const store = new ConfigStore(dir);
    await store.load();
    const result = await store.mutateCommands((f) => f);
    expect(result.ok).toBe(false);
    expect(await read('commands.json')).toBe('{ "version": 1, "commands": [ }');
  });

  it('updateSettings preserva comentários e cria .bak', async () => {
    const original = '{\n  // fonte preferida\n  "version": 1,\n  "appearance": { "fontSize": 14 }\n}\n';
    await writeFile(join(dir, 'settings.json'), original);
    const store = new ConfigStore(dir);
    await store.load();
    expect(await store.updateSettings(['appearance', 'fontSize'], 16)).toEqual({ ok: true });
    const text = await read('settings.json');
    expect(text).toContain('// fonte preferida');
    expect(text).toContain('16');
    expect(await read('settings.json.bak')).toBe(original);
    expect(store.snapshot().settings.appearance.fontSize).toBe(16);
  });

  it('updateSettings rejeita valor inválido sem gravar', async () => {
    const store = new ConfigStore(dir);
    await store.load();
    const before = await read('settings.json');
    const result = await store.updateSettings(['appearance', 'fontSize'], 'enorme');
    expect(result.ok).toBe(false);
    expect(await read('settings.json')).toBe(before);
  });

  it('atalho repetido: mantém só na primeira ação e avisa', async () => {
    await writeFile(
      join(dir, 'settings.json'),
      JSON.stringify({ version: 1, keybindings: { 'palette.open': 'ctrl+p', 'terminal.find': 'Ctrl+P' } }),
    );
    const snap = await new ConfigStore(dir).load();
    expect(snap.settings.keybindings['palette.open']).toBe('Ctrl+P');
    expect(snap.settings.keybindings['terminal.find']).toBeNull();
    expect(snap.settings.keybindings['tab.new']).toBe('Ctrl+T');
    expect(snap.issues).toHaveLength(1);
    expect(snap.issues[0]).toMatchObject({ severity: 'warning', path: ['keybindings', 'terminal.find'] });
    expect(snap.readOnly.settings).toBe(false);
  });

  it('versão mais nova: somente leitura', async () => {
    await writeFile(join(dir, 'projects.json'), JSON.stringify({ version: CURRENT_VERSION + 1, projects: [] }));
    const snap = await new ConfigStore(dir).load();
    expect(snap.readOnly.projects).toBe(true);
    expect(snap.issues[0]?.message).toMatch(/versão mais nova/);
  });

  it('aplica migrações de versões antigas e grava com .bak', async () => {
    const old = JSON.stringify({ version: 0, items: [] });
    await writeFile(join(dir, 'commands.json'), old);
    const store = new ConfigStore(dir, { commands: { 0: (d) => ({ commands: d['items'] }) } });
    const snap = await store.load();
    expect(snap.issues).toEqual([]);
    expect(JSON.parse(await read('commands.json'))).toEqual({ version: 1, commands: [] });
    expect(await read('commands.json.bak')).toBe(old);
  });

  it('detecta edição externa e ignora as próprias gravações', async () => {
    const store = new ConfigStore(dir);
    await store.load();
    const changes: number[] = [];
    store.onChange((s) => changes.push(s.settings.appearance.fontSize));
    store.startWatching(50);
    try {
      await store.updateSettings(['appearance', 'fontSize'], 18);
      await new Promise((r) => setTimeout(r, 300));
      expect(changes).toEqual([18]);

      const text = (await read('settings.json')).replace('18', '20');
      await writeFile(join(dir, 'settings.json'), text);
      await expect.poll(() => changes.at(-1), { timeout: 3000 }).toBe(20);
    } finally {
      store.stopWatching();
    }
  });

  it('state.json inválido volta ao padrão sem aviso', async () => {
    await writeFile(join(dir, 'state.json'), 'lixo');
    const store = new ConfigStore(dir);
    await store.load();
    expect(store.getState().sidebar.visible).toBe(true);
    await store.patchState({ sidebar: { visible: false, width: 300 } });
    expect(JSON.parse(await read('state.json')).sidebar).toEqual({ visible: false, width: 300 });
  });
});

describe('ConfigStore: histórico', () => {
  it('fileTexts devolve os textos e null com arquivo inválido', async () => {
    const store = new ConfigStore(dir);
    await store.load();
    // keychain e known hosts ficam fora do histórico.
    expect(Object.keys(store.fileTexts()!).sort()).toEqual(['commands', 'hosts', 'projects', 'settings', 'workspaces']);
    await writeFile(join(dir, 'projects.json'), '{ quebrado');
    const broken = new ConfigStore(dir);
    await broken.load();
    expect(broken.fileTexts()).toBeNull();
  });

  it('restoreFiles grava todos e avisa; texto inválido não grava nenhum', async () => {
    const store = new ConfigStore(dir);
    await store.load();
    const commands = JSON.stringify({ version: 1, commands: [{ id: 'c1', name: 'Build', command: 'dotnet build' }] });
    const settingsBefore = await read('settings.json');

    const bad = await store.restoreFiles({ settings: '{ "version": 1, "appearance": 3 }', commands });
    expect(bad.ok).toBe(false);
    expect(await read('settings.json')).toBe(settingsBefore);
    expect(JSON.parse(await read('commands.json')).commands).toEqual([]);

    let changed = 0;
    store.onChange(() => changed++);
    const ok = await store.restoreFiles({ commands });
    expect(ok.ok).toBe(true);
    expect(changed).toBe(1);
    expect(store.snapshot().commands.commands.map((c) => c.name)).toEqual(['Build']);
  });
});
