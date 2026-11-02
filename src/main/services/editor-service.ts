import type { OpenResult } from '@shared/model';
import { openInEditor, type EditorSettings } from '../editor/open-editor';
import type { Env } from '../env/env-utils';
import type { PlatformAdapter } from '../platform/types';
import type { DesktopPort } from '../ports';

/** Abre arquivos no editor configurado, com o programa padrão do SO como alternativa. */
export class EditorService {
  constructor(
    private readonly platform: PlatformAdapter,
    private readonly desktop: DesktopPort,
    private readonly env: () => Env,
    private readonly editor: () => EditorSettings,
  ) {}

  async open(file: string, line?: number, column?: number, useDefaultApp = false): Promise<OpenResult> {
    if (useDefaultApp) {
      const error = await this.desktop.openPath(file);
      return error ? { ok: false, error } : { ok: true };
    }
    return openInEditor(this.platform, this.env(), this.editor(), file, line, column);
  }

  /** Tenta o editor e cai para o programa padrão (usado para abrir o settings.json). */
  async openWithFallback(file: string): Promise<OpenResult> {
    const result = await this.open(file);
    return result.ok ? result : this.open(file, undefined, undefined, true);
  }
}
