import { describe, expect, it, vi } from 'vitest';
import type { EnvironmentService } from '../env/environment-service';
import { posixAdapter } from '../platform/posix';
import type { PlatformAdapter } from '../platform/types';
import { PtyManager, type SessionInfo } from '../pty/pty-manager';
import type { TerminalBackend } from '../pty/terminal-backend';
import { PortService } from '../services/port-service';
import { StatusService } from '../status/status-service';

const sshInfo: SessionInfo = {
  id: 's1',
  kind: 'ssh',
  profileId: '',
  hostId: 'vm',
  projectId: null,
  pid: null,
  envGeneration: 1,
  initialCwd: '',
  cwd: '',
  commandRunning: false,
  elevated: false,
  envProfileId: null,
  integrated: false,
  exited: false,
};

/** Plataforma que registra qualquer chamada (os consumidores não devem tocar nela por sessões SSH). */
function spyPlatform(): { platform: PlatformAdapter; calls: string[] } {
  const calls: string[] = [];
  const platform = new Proxy(posixAdapter, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        calls.push(String(prop));
        if (prop === 'listListeningPorts') return Promise.resolve([{ address: '0.0.0.0', port: 5000, pid: 42, name: 'node' }]);
        if (prop === 'listDescendants') return Promise.resolve([]);
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return { platform, calls };
}

function remoteBackend(): TerminalBackend & { killed: boolean } {
  return {
    pid: null,
    killed: false,
    write: () => undefined,
    resize: () => undefined,
    pause: () => undefined,
    resume: () => undefined,
    kill() {
      this.killed = true;
    },
    onData: () => undefined,
    onExit: () => undefined,
  };
}

describe('sessões SSH nos consumidores do SessionInfo', () => {
  it('StatusService ignora sessões SSH (sem git nem versões locais)', () => {
    const { platform, calls } = spyPlatform();
    const send = vi.fn();
    const env = { current: () => ({ env: {}, generation: 1 }), onChange: () => () => undefined } as unknown as EnvironmentService;
    const status = new StatusService({ platform, env, send, projects: () => ({ version: 1, projects: [] }) });
    status.onSessionEvent(sshInfo, 'created');
    status.onSessionEvent({ ...sshInfo, cwd: '/srv' }, 'state');
    status.activate('s1');
    expect(calls).toEqual([]);
    expect(send).not.toHaveBeenCalled();
    status.dispose();
  });

  it('PortService não procura processos de sessões SSH', async () => {
    const { platform, calls } = spyPlatform();
    const ports = await new PortService(platform, () => [sshInfo]).list();
    expect(ports).toEqual([{ address: '0.0.0.0', port: 5000, pid: 42, name: 'node', sessionId: null }]);
    expect(calls).toEqual(['listListeningPorts']);
  });

  it('PtyManager: sessão remota não usa rastreador nem árvore de processos, não conta como ocupada e não reinicia', async () => {
    const { platform, calls } = spyPlatform();
    const tracker = { track: vi.fn(), release: vi.fn(async () => []) };
    const pty = new PtyManager({
      platform,
      spawn: () => {
        throw new Error('sem shells locais');
      },
      send: () => undefined,
      resolveProfile: () => undefined,
      buildLaunch: () => ({ file: '', args: [], cwd: '', env: {} }),
      envGeneration: () => 1,
      defaultCwd: () => '/',
      environmentVariables: () => undefined,
      tracker: tracker as never,
    });
    const backend = remoteBackend();
    const info = pty.createRemote({ hostId: 'vm' }, backend);
    expect(info).toMatchObject({ kind: 'ssh', hostId: 'vm', pid: null, profileId: '' });
    expect(await pty.isBusy(info.id)).toBe(false);
    expect(await pty.busyCount()).toBe(0);
    await expect(pty.restart(info.id, 80, 24)).rejects.toThrow('ssh:reconnect');
    expect(await pty.kill(info.id)).toEqual({ token: null, detached: [] });
    expect(backend.killed).toBe(true);
    expect(tracker.track).not.toHaveBeenCalled();
    expect(tracker.release).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
