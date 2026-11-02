import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { eventChannels, invokeChannels, sendChannels } from '@shared/ipc-channels';
import type { GunslingerApi } from '@shared/ipc-contract';

const api: GunslingerApi = {
  async invoke(channel, ...req) {
    if (!invokeChannels.has(channel)) throw new Error(`Canal não permitido: ${channel}`);
    const result = (await ipcRenderer.invoke(channel, req[0])) as
      | { ok: true; value: unknown }
      | { ok: false; error: { code: string; message: string } };
    if (!result.ok) {
      const err = new Error(result.error.message);
      (err as Error & { code?: string }).code = result.error.code;
      throw err;
    }
    return result.value as never;
  },
  send(channel, payload) {
    if (!sendChannels.has(channel)) throw new Error(`Canal não permitido: ${channel}`);
    ipcRenderer.send(channel, payload);
  },
  on(channel, listener) {
    if (!eventChannels.has(channel)) throw new Error(`Canal não permitido: ${channel}`);
    const wrapped = (_event: IpcRendererEvent, payload: unknown): void => listener(payload as never);
    ipcRenderer.on(channel, wrapped);
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('gunslinger', api);
