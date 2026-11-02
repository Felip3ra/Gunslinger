import type { ZodTypeAny } from 'zod';
import type { InvokeChannel, InvokeReq, InvokeRes, IpcError, SendChannel, SendMap } from '@shared/ipc-contract';
import { invokeSchemas, sendSchemas } from '@shared/ipc-schemas';

export type InvokeResult<T> = { ok: true; value: T } | { ok: false; error: IpcError };

/** Erro lançado por handlers quando o recurso pedido não existe. */
export class NotFoundError extends Error {}

/** Abstração mínima do ipcMain, para testar sem Electron. */
export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, arg: unknown) => unknown): void;
  on(channel: string, listener: (event: unknown, arg: unknown) => void): void;
}

export type InvokeHandler<K extends InvokeChannel> = (req: InvokeReq<K>) => Promise<InvokeRes<K>> | InvokeRes<K>;

/** Valida e executa uma requisição; nunca lança: devolve um resultado tipado. */
export async function runInvoke<K extends InvokeChannel>(
  channel: K,
  schema: ZodTypeAny,
  handler: InvokeHandler<K>,
  arg: unknown,
): Promise<InvokeResult<InvokeRes<K>>> {
  const parsed = schema.safeParse(arg);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ');
    return { ok: false, error: { code: 'invalid-args', message: `Argumentos inválidos em ${channel}: ${message}` } };
  }
  try {
    return { ok: true, value: await handler(parsed.data as InvokeReq<K>) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: { code: err instanceof NotFoundError ? 'not-found' : 'failed', message } };
  }
}

export class IpcRegistry {
  constructor(private readonly ipc: IpcMainLike) {}

  handle<K extends InvokeChannel>(channel: K, handler: InvokeHandler<K>): void {
    const schema: ZodTypeAny = invokeSchemas[channel];
    this.ipc.handle(channel, (_event, arg) => runInvoke(channel, schema, handler, arg));
  }

  on<K extends SendChannel>(channel: K, listener: (payload: SendMap[K]) => void): void {
    const schema: ZodTypeAny = sendSchemas[channel];
    this.ipc.on(channel, (_event, arg) => {
      const parsed = schema.safeParse(arg);
      // Mensagens fire-and-forget inválidas são descartadas: não há a quem responder.
      if (parsed.success) listener(parsed.data as SendMap[K]);
    });
  }
}
