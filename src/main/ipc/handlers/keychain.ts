import { join } from 'node:path';
import type { ClipboardPort, DialogPort } from '../../ports';
import type { KeychainService } from '../../ssh/keychain-service';
import type { KnownHostsService } from '../../ssh/known-hosts-service';
import type { IpcRegistry } from '../registry';

/** Keychain (chaves, identidades, segredos) e hosts conhecidos. */
export function registerKeychainHandlers(
  ipc: IpcRegistry,
  deps: {
    keychain: KeychainService;
    knownHosts: KnownHostsService;
    dialogs: DialogPort;
    clipboard: ClipboardPort;
    /** Pasta ~/.ssh do usuário. */
    sshDir(): string;
    readFile(path: string): Promise<string>;
  },
): void {
  const { keychain, knownHosts, dialogs } = deps;
  ipc.handle('keychain:get', () => keychain.snapshot());
  ipc.handle('keychain:pickKeyFile', () => dialogs.openFile({ title: 'Chave privada', filters: [{ name: 'Todos os arquivos', extensions: ['*'] }] }));
  ipc.handle('keychain:importKey', (req) => keychain.importKey(req));
  ipc.handle('keychain:generateKey', (req) => keychain.generateKey(req));
  ipc.handle('keychain:renameKey', ({ keyId, name }) => keychain.renameKey(keyId, name));
  ipc.handle('keychain:setKeyPassphrase', ({ keyId, passphrase }) => keychain.setKeyPassphrase(keyId, passphrase));
  ipc.handle('keychain:saveIdentity', (req) => keychain.saveIdentity(req));
  ipc.handle('keychain:usage', ({ kind, id }) => keychain.usage(kind, id));
  ipc.handle('keychain:delete', ({ kind, id }) => keychain.delete(kind, id));
  ipc.handle('keychain:copyPublicKey', ({ keyId }) => {
    const pub = keychain.publicKey(keyId);
    if (!pub) return { ok: false, error: 'Chave não encontrada.' };
    deps.clipboard.writeText(pub);
    return { ok: true };
  });
  ipc.handle('keychain:exportKey', async ({ keyId, which }) => {
    const key = keychain.snapshot().keys.find((k) => k.id === keyId);
    if (!key) return { ok: false, error: 'Chave não encontrada.' };
    const base = key.name.replace(/[\\/:*?"<>|]/g, '_');
    const path = await dialogs.saveFile({
      title: which === 'public' ? 'Exportar chave pública' : 'Exportar chave privada',
      defaultPath: which === 'public' ? `${base}.pub` : base,
      filters: [{ name: 'Todos os arquivos', extensions: ['*'] }],
    });
    return path ? keychain.exportKey(keyId, which, path) : null;
  });

  ipc.handle('knownHosts:list', () => knownHosts.list());
  ipc.handle('knownHosts:delete', ({ index }) => knownHosts.delete(index));
  ipc.handle('knownHosts:importOpenSsh', async () => {
    let text: string;
    try {
      text = await deps.readFile(join(deps.sshDir(), 'known_hosts'));
    } catch {
      return { ok: false, error: `Arquivo não encontrado: ${join(deps.sshDir(), 'known_hosts')}` };
    }
    const r = await knownHosts.importOpenSsh(text);
    return r.ok ? { ok: true, added: r.added, ignored: r.ignored.length } : r;
  });
}
