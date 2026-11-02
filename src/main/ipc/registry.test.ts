import { describe, expect, it, vi } from 'vitest';
import { IpcRegistry, NotFoundError, type IpcMainLike } from './registry';

function fakeIpc() {
  const handlers = new Map<string, (event: unknown, arg: unknown) => unknown>();
  const listeners = new Map<string, (event: unknown, arg: unknown) => void>();
  const ipc: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    on: (channel, listener) => void listeners.set(channel, listener),
  };
  return { ipc, handlers, listeners };
}

describe('IpcRegistry', () => {
  it('rejeita argumentos inválidos sem chamar o handler', async () => {
    const { ipc, handlers } = fakeIpc();
    const handler = vi.fn();
    new IpcRegistry(ipc).handle('pty:create', handler);
    const result = await handlers.get('pty:create')!(null, { profileId: '', cols: 0, rows: 24 });
    expect(handler).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-args' } });
  });

  it('executa o handler com argumentos válidos', async () => {
    const { ipc, handlers } = fakeIpc();
    new IpcRegistry(ipc).handle('pty:isBusy', ({ sessionId }) => sessionId === 's1');
    expect(await handlers.get('pty:isBusy')!(null, { sessionId: 's1' })).toEqual({ ok: true, value: true });
  });

  it('converte exceções em erro tipado', async () => {
    const { ipc, handlers } = fakeIpc();
    new IpcRegistry(ipc).handle('pty:kill', () => {
      throw new NotFoundError('Sessão não encontrada');
    });
    expect(await handlers.get('pty:kill')!(null, { sessionId: 'x' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'Sessão não encontrada' },
    });
  });

  it('descarta mensagens send inválidas', () => {
    const { ipc, listeners } = fakeIpc();
    const listener = vi.fn();
    new IpcRegistry(ipc).on('pty:resize', listener);
    listeners.get('pty:resize')!(null, { sessionId: 's', cols: -1, rows: 10 });
    listeners.get('pty:resize')!(null, { sessionId: 's', cols: 80, rows: 10 });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ sessionId: 's', cols: 80, rows: 10 });
  });
});
