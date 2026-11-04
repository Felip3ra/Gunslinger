import { Client } from 'ssh2';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HostsFile } from '@shared/model';
import type { SshSessionState } from '@shared/ssh';
import { posixAdapter } from '../platform/posix';
import { PtyManager } from '../pty/pty-manager';
import { SshConnectionPool } from './connection-pool';
import { SshSessionService } from './ssh-session-service';
import { startTestServer, type TestServer } from './testing/ssh-test-server';

let server: TestServer;
let data: Record<string, string>;
let exits: Record<string, number>;
let states: SshSessionState[];
let pty: PtyManager;
let service: SshSessionService;
let hosts: HostsFile;

function waitFor(check: () => boolean, ms = 5000): Promise<void> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (check()) return resolve();
      if (Date.now() - started > ms) return reject(new Error('tempo esgotado esperando a condição'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

beforeEach(async () => {
  server = await startTestServer({ password: 'x' });
  hosts = { version: 1, groups: [], hosts: [{ id: 'vm', name: 'VM teste', address: '127.0.0.1', port: server.port, username: 'deploy', groupId: null, color: null, tags: [] }] };
  data = {};
  exits = {};
  states = [];
  pty = new PtyManager({
    platform: { ...posixAdapter, listDescendants: async () => [] },
    spawn: () => {
      throw new Error('sem shells locais neste teste');
    },
    send: (channel, payload) => {
      if (channel === 'pty:data') {
        const p = payload as { sessionId: string; data: string };
        data[p.sessionId] = (data[p.sessionId] ?? '') + p.data;
      }
      if (channel === 'pty:exit') {
        const p = payload as { sessionId: string; exitCode: number };
        exits[p.sessionId] = p.exitCode;
      }
    },
    resolveProfile: () => undefined,
    buildLaunch: () => ({ file: '', args: [], cwd: '', env: {} }),
    envGeneration: () => 1,
    defaultCwd: () => '/',
    environmentVariables: () => undefined,
  });
  const pool = new SshConnectionPool({
    createClient: () => new Client(),
    hostsFile: () => hosts,
    settings: () => ({ agent: 'off', keepaliveSec: 0, connectTimeoutSec: 5 }),
    keychain: {
      loadKeyMaterial: async () => ({ ok: false, error: 'sem chaves' }),
      identityCredentials: () => null,
      setKeyPassphrase: async () => ({ ok: true }),
      rememberPassword: async () => ({ ok: false, error: 'não usado' }),
    },
    knownHosts: { check: () => ({ status: 'unknown' }), accept: async () => ({ ok: true }), replace: async () => ({ ok: true }) },
    prompts: {
      ask: async (_g, _t, p) => (p.kind === 'hostKey-new' ? { kind: 'hostKey', decision: 'once' } : p.kind === 'password' ? { kind: 'text', value: 'x', save: false } : null),
      cancelGroup: () => undefined,
    },
    linkIdentity: async () => ({ ok: true }),
  });
  service = new SshSessionService({ pool, pty, send: (s) => void states.push(s), hostsFile: () => hosts });
});
afterEach(async () => server.close());

describe('SshSessionService', () => {
  it('abre o shell remoto, mostra as etapas e troca dados pelo PtyManager', async () => {
    const { sessionId, label } = service.connect({ kind: 'host', hostId: 'vm' }, 80, 24);
    expect(label).toBe('VM teste');
    expect(pty.get(sessionId)).toMatchObject({ kind: 'ssh', hostId: 'vm', pid: null });
    await waitFor(() => (data[sessionId] ?? '').includes('bem-vindo'));
    expect(states.filter((s) => s.sessionId === sessionId).map((s) => s.stage)).toEqual(['connecting', 'connecting', 'verifying', 'authenticating', 'connected']);

    pty.write(sessionId, 'olá\r');
    await waitFor(() => (data[sessionId] ?? '').includes('você disse: olá'));
    pty.resize(sessionId, 120, 40);
    expect(await pty.isBusy(sessionId)).toBe(false);

    pty.write(sessionId, 'exit\r');
    await waitFor(() => exits[sessionId] !== undefined);
    expect(exits[sessionId]).toBe(0);
  });

  it('queda da conexão encerra a sessão com o motivo e permite reconectar', async () => {
    const { sessionId } = service.connect({ kind: 'host', hostId: 'vm' }, 80, 24);
    await waitFor(() => (data[sessionId] ?? '').includes('bem-vindo'));
    server.dropAll();
    await waitFor(() => exits[sessionId] !== undefined);
    expect(exits[sessionId]).toBe(-1);
    expect(service.stateOf(sessionId)?.stage).toBe('closed');

    const again = await service.reconnect(sessionId, 80, 24);
    expect(again.sessionId).not.toBe(sessionId);
    await waitFor(() => (data[again.sessionId] ?? '').includes('bem-vindo'));
  });

  it('falha de conexão fica na sessão como "failed" com a mensagem', async () => {
    hosts.hosts[0]!.port = 1;
    const { sessionId } = service.connect({ kind: 'host', hostId: 'vm' }, 80, 24);
    await waitFor(() => exits[sessionId] !== undefined);
    expect(service.stateOf(sessionId)).toMatchObject({ stage: 'failed', message: expect.stringContaining('127.0.0.1:1') });
  });

  it('fechar a aba encerra o canal e a conexão', async () => {
    const { sessionId } = service.connect({ kind: 'host', hostId: 'vm' }, 80, 24);
    await waitFor(() => (data[sessionId] ?? '').includes('bem-vindo'));
    await pty.kill(sessionId);
    expect(pty.get(sessionId)).toBeUndefined();
  });

  it('fechar a aba enquanto a conexão espera uma resposta descarta as perguntas', async () => {
    const cancelled: unknown[] = [];
    const waiting = new SshSessionService({
      pool: { acquire: () => new Promise(() => undefined) },
      pty,
      send: () => undefined,
      hostsFile: () => hosts,
      cancelPrompts: (target) => void cancelled.push(target),
    });
    const { sessionId } = waiting.connect({ kind: 'host', hostId: 'vm' }, 80, 24);
    await pty.kill(sessionId);
    expect(cancelled).toEqual([{ kind: 'host', hostId: 'vm' }]);
    expect(pty.get(sessionId)).toBeUndefined();
  });

  it('host inexistente é recusado', () => {
    expect(() => service.connect({ kind: 'host', hostId: 'sumiu' }, 80, 24)).toThrow('Host não encontrado.');
  });
});
