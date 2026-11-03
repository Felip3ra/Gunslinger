import { describe, expect, it, vi, afterEach } from 'vitest';
import type { UpdateStatus } from '@shared/update';
import { UPDATE_FIRST_CHECK_MS, UPDATE_INTERVAL_MS } from '@shared/update';
import { describeError, UpdateService, type UpdaterPort } from './update-service';

function fakeUpdater(version: string | null): UpdaterPort & { installs: number } {
  const u = {
    installs: 0,
    currentVersion: () => '0.1.0',
    check: vi.fn(async () => version),
    download: vi.fn(async (onProgress: (p: number) => void) => {
      onProgress(42.4);
    }),
    quitAndInstall: () => {
      u.installs++;
    },
  };
  return u;
}

function service(updater: UpdaterPort | null, auto = true) {
  const changes: UpdateStatus[] = [];
  const s = new UpdateService({ updater, currentVersion: '0.1.0', auto: () => auto, onChange: (st) => changes.push(st), now: () => 1000 });
  return { s, changes };
}

afterEach(() => vi.useRealTimers());

describe('UpdateService', () => {
  it('sem atualizador fica como não suportado e não verifica', async () => {
    const { s, changes } = service(null);
    await s.check();
    expect(s.status()).toEqual({ state: 'unsupported', currentVersion: '0.1.0' });
    expect(changes).toEqual([]);
  });

  it('sem versão nova volta a idle com a hora da verificação', async () => {
    const { s } = service(fakeUpdater(null));
    await s.check();
    expect(s.status()).toEqual({ state: 'idle', currentVersion: '0.1.0', checkedAt: 1000 });
  });

  it('baixa a versão nova, informa o progresso e fica pronta para instalar', async () => {
    const updater = fakeUpdater('0.2.0');
    const { s, changes } = service(updater);
    await s.check();
    expect(changes.map((c) => c.state)).toEqual(['checking', 'downloading', 'downloading', 'ready']);
    expect(changes[2]).toMatchObject({ percent: 42 });
    s.install();
    expect(updater.installs).toBe(1);
  });

  it('install sem versão baixada não faz nada', () => {
    const updater = fakeUpdater(null);
    service(updater).s.install();
    expect(updater.installs).toBe(0);
  });

  it('verificações simultâneas viram uma só', async () => {
    const updater = fakeUpdater(null);
    const { s } = service(updater);
    await Promise.all([s.check(), s.check()]);
    expect(updater.check).toHaveBeenCalledTimes(1);
  });

  it('erro de rede vira mensagem curta', async () => {
    const updater = fakeUpdater(null);
    updater.check = async () => {
      throw new Error('getaddrinfo ENOTFOUND api.github.com');
    };
    const { s } = service(updater);
    await s.check();
    expect(s.status()).toEqual({ state: 'error', currentVersion: '0.1.0', message: 'Sem conexão com o GitHub.' });
  });

  it('agenda a primeira verificação e as seguintes só com auto ligado', async () => {
    vi.useFakeTimers();
    const on = fakeUpdater(null);
    service(on).s.start();
    await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_MS);
    expect(on.check).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
    expect(on.check).toHaveBeenCalledTimes(2);

    const off = fakeUpdater(null);
    service(off, false).s.start();
    await vi.advanceTimersByTimeAsync(UPDATE_FIRST_CHECK_MS + UPDATE_INTERVAL_MS);
    expect(off.check).not.toHaveBeenCalled();
  });
});

describe('describeError', () => {
  it('resume 404 e corta mensagens longas', () => {
    expect(describeError(new Error('HttpError: 404 \n body...'))).toBe('Nenhuma versão publicada encontrada.');
    expect(describeError(new Error('x'.repeat(300))).length).toBe(158);
  });
});
