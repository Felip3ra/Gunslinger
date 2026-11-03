import type { IPty } from 'node-pty';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShellProfile } from '@shared/model';
import { posixAdapter } from '../platform/posix';
import { FLUSH_MAX_BYTES, HIGH_WATERMARK, PtyManager, type PtyManagerDeps } from './pty-manager';

class FakePty {
  pid = 999_999;
  paused = false;
  written: string[] = [];
  private dataListener: (d: string) => void = () => {};
  private exitListener: (e: { exitCode: number }) => void = () => {};
  onData = (l: (d: string) => void) => {
    this.dataListener = l;
    return { dispose() {} };
  };
  onExit = (l: (e: { exitCode: number }) => void) => {
    this.exitListener = l;
    return { dispose() {} };
  };
  write = (d: string) => void this.written.push(d);
  resize = vi.fn();
  pause = () => void (this.paused = true);
  resume = () => void (this.paused = false);
  kill = vi.fn();
  emit(d: string) {
    this.dataListener(d);
  }
  exit(code: number) {
    this.exitListener({ exitCode: code });
  }
}

const profile: ShellProfile = {
  id: 'builtin.cmd',
  name: 'CMD',
  shellType: 'cmd',
  executable: 'cmd.exe',
  args: [],
  cwd: null,
  color: '#000000',
  icon: 'x',
  source: 'detected',
  hidden: false,
  available: true,
  shellIntegration: true,
};

let fake: FakePty;
let sent: { channel: string; payload: unknown }[];
let manager: PtyManager;

beforeEach(() => {
  vi.useFakeTimers();
  fake = new FakePty();
  sent = [];
  const deps: PtyManagerDeps = {
    platform: { ...posixAdapter, listDescendants: async () => [] },
    spawn: () => fake as unknown as IPty,
    send: (channel, payload) => void sent.push({ channel, payload }),
    resolveProfile: (id) => (id === profile.id ? profile : id === 'off' ? { ...profile, available: false } : undefined),
    buildLaunch: (p, cwd) => ({ file: p.executable, args: [], cwd, env: {} }),
    envGeneration: () => 3,
    defaultCwd: () => 'C:\\Users\\ana',
    environmentVariables: (id) => (id === 'dev' ? { ASPNETCORE_ENVIRONMENT: 'Development' } : undefined),
  };
  manager = new PtyManager(deps);
});
afterEach(() => vi.useRealTimers());

describe('PtyManager', () => {
  it('cria a sessão na pasta padrão e guarda a geração do ambiente', () => {
    const info = manager.create({ profileId: 'builtin.cmd', cols: 80, rows: 24 });
    expect(info).toMatchObject({ profileId: 'builtin.cmd', cwd: 'C:\\Users\\ana', envGeneration: 3 });
  });

  it('acrescenta as variáveis do perfil de ambiente ao processo', () => {
    let env: Record<string, string> = {};
    const spy = vi.fn((_f: string, _a: string[], opts: { env: Record<string, string> }) => ((env = opts.env), fake as unknown as IPty));
    const withSpy = new PtyManager({ ...(manager as unknown as { deps: PtyManagerDeps }).deps, spawn: spy });
    const info = withSpy.create({ profileId: 'builtin.cmd', cols: 80, rows: 24, envProfileId: 'dev' });
    expect(env['ASPNETCORE_ENVIRONMENT']).toBe('Development');
    expect(info.envProfileId).toBe('dev');
    expect(() => withSpy.create({ profileId: 'builtin.cmd', cols: 80, rows: 24, envProfileId: 'x' })).toThrow(/ambiente não encontrado/);
  });

  it('rejeita perfil inexistente ou indisponível', () => {
    expect(() => manager.create({ profileId: 'nada', cols: 80, rows: 24 })).toThrow(/não encontrado/);
    expect(() => manager.create({ profileId: 'off', cols: 80, rows: 24 })).toThrow(/não está disponível/);
  });

  it('agrupa a saída em lotes de 5 ms', () => {
    const { id } = manager.create({ profileId: 'builtin.cmd', cols: 80, rows: 24 });
    fake.emit('a');
    fake.emit('b');
    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(5);
    expect(sent).toEqual([{ channel: 'pty:data', payload: { sessionId: id, data: 'ab' } }]);
  });

  it('envia na hora quando o lote passa de 64 KB', () => {
    manager.create({ profileId: 'builtin.cmd', cols: 80, rows: 24 });
    fake.emit('x'.repeat(FLUSH_MAX_BYTES));
    expect(sent).toHaveLength(1);
  });

  it('pausa o PTY acima de 1 MB sem confirmação e retoma após o ack', () => {
    const { id } = manager.create({ profileId: 'builtin.cmd', cols: 80, rows: 24 });
    const chunk = 'y'.repeat(FLUSH_MAX_BYTES);
    for (let i = 0; i <= HIGH_WATERMARK / FLUSH_MAX_BYTES; i++) fake.emit(chunk);
    expect(fake.paused).toBe(true);
    manager.ack(id, HIGH_WATERMARK);
    expect(fake.paused).toBe(false);
  });

  it('descarrega o pendente e avisa a saída do processo', () => {
    const { id } = manager.create({ profileId: 'builtin.cmd', cols: 80, rows: 24 });
    fake.emit('fim');
    fake.exit(1);
    expect(sent.map((s) => s.channel)).toEqual(['pty:data', 'pty:exit']);
    expect(sent[1]!.payload).toEqual({ sessionId: id, exitCode: 1 });
    expect(manager.get(id)).toBeUndefined();
  });

  it('isBusy usa o estado da integração', async () => {
    vi.useRealTimers();
    const { id } = manager.create({ profileId: 'builtin.cmd', cols: 80, rows: 24 });
    expect(await manager.isBusy(id)).toBe(false);
    manager.updateState(id, { commandRunning: true, cwd: 'D:\\x' });
    expect(await manager.isBusy(id)).toBe(true);
    expect(manager.get(id)?.cwd).toBe('D:\\x');
  });
});

describe('PtyManager: processos fora da árvore', () => {
  function withTracker(mode: 'ask' | 'kill' | 'keep') {
    const killed: number[] = [];
    const tracked: [string, number][] = [];
    const base = (manager as unknown as { deps: PtyManagerDeps }).deps;
    const m = new PtyManager({
      ...base,
      // pid 999_999 não existe: o kill não espera sobreviventes.
      platform: { ...base.platform, killTree: async (pid) => void killed.push(pid) },
      tracker: {
        track: (key, pid) => void tracked.push([key, pid]),
        release: async () => [
          { pid: 999_999, name: 'cmd' },
          { pid: 4242, name: 'PING' },
        ],
        dispose: () => {},
      },
      detachedMode: () => mode,
    });
    return { m, killed, tracked };
  }

  async function kill(m: PtyManager, id: string) {
    const result = m.kill(id);
    await vi.advanceTimersByTimeAsync(2000);
    return result;
  }

  it('acompanha o shell ao criar e, no modo perguntar, devolve só os processos de fora da árvore', async () => {
    const { m, killed, tracked } = withTracker('ask');
    const info = m.create({ profileId: 'builtin.cmd', cols: 80, rows: 24 });
    expect(tracked).toEqual([[info.id, 999_999]]);
    const result = await kill(m, info.id);
    expect(result.detached).toEqual([{ pid: 4242, name: 'PING' }]);
    expect(killed).not.toContain(4242);
    await m.killDetached(result.token!);
    expect(killed).toContain(4242);
    // O token vale uma vez.
    killed.length = 0;
    await m.killDetached(result.token!);
    expect(killed).toEqual([]);
  });

  it('no modo encerrar encerra sem perguntar e no modo manter não encerra', async () => {
    const kill1 = withTracker('kill');
    const r1 = await kill(kill1.m, kill1.m.create({ profileId: 'builtin.cmd', cols: 80, rows: 24 }).id);
    expect(r1).toEqual({ token: null, detached: [] });
    expect(kill1.killed).toContain(4242);

    const keep = withTracker('keep');
    const r2 = await kill(keep.m, keep.m.create({ profileId: 'builtin.cmd', cols: 80, rows: 24 }).id);
    expect(r2).toEqual({ token: null, detached: [] });
    expect(keep.killed).not.toContain(4242);
  });
});

describe('PtyManager: saída durante o encerramento', () => {
  it('a saída do shell provocada pelo kill não consome o grupo de processos', async () => {
    const releases: string[] = [];
    const base = (manager as unknown as { deps: PtyManagerDeps }).deps;
    const m = new PtyManager({
      ...base,
      platform: { ...base.platform, killTree: async () => {} },
      tracker: { track: () => {}, release: async (key) => (releases.push(key), [{ pid: 4242, name: 'PING' }]), dispose: () => {} },
      detachedMode: () => 'ask',
    });
    const info = m.create({ profileId: 'builtin.cmd', cols: 80, rows: 24 });
    fake.kill.mockImplementation(() => fake.exit(1));
    const result = m.kill(info.id);
    await vi.advanceTimersByTimeAsync(2000);
    expect((await result).detached).toEqual([{ pid: 4242, name: 'PING' }]);
    expect(releases).toEqual([info.id]);
  });
});
