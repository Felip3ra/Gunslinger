import { stat } from 'node:fs/promises';
import type { ConfigStore } from '../../config/config-store';
import type { ClipboardPort, DesktopPort } from '../../ports';
import type { EditorService } from '../../services/editor-service';
import type { LongCommandNotifier } from '../../services/long-command-notifier';
import type { TransferService } from '../../transfer/transfer-service';
import type { IpcRegistry } from '../registry';

/** Integração com a área de trabalho: editor, links, área de transferência, notificações e arquivos. */
export function registerDesktopHandlers(
  ipc: IpcRegistry,
  deps: { editor: EditorService; desktop: DesktopPort; clipboard: ClipboardPort; notifier: LongCommandNotifier; transfer: TransferService; config: ConfigStore },
): void {
  const { editor, desktop, clipboard, notifier, transfer, config } = deps;
  ipc.handle('shell:openExternal', async ({ url }) => {
    try {
      await desktop.openExternal(url);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipc.handle('editor:open', ({ file, line, column, useDefaultApp }) => editor.open(file, line, column, useDefaultApp));
  ipc.handle('settings:openFile', () => editor.openWithFallback(config.pathOf('settings')));
  ipc.handle('fs:statMany', ({ paths }) => Promise.all(paths.map((p) => stat(p).then((st) => st.isFile(), () => false))));
  ipc.handle('notify:longCommand', (cmd) => void notifier.notify(cmd));
  ipc.handle('clipboard:read', () => clipboard.readText());
  ipc.handle('clipboard:write', ({ text }) => clipboard.writeText(text));

  ipc.handle('transfer:export', (selection) => transfer.export(selection));
  ipc.handle('transfer:previewImport', () => transfer.preview());
  ipc.handle('transfer:applyImport', ({ previewId, decisions }) => transfer.apply(previewId, decisions));
}
