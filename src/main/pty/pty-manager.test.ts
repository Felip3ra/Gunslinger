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
