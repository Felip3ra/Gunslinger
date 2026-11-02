import { watch, type FSWatcher } from 'node:fs';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { resolvePlugins, type LoadedPlugin, type PluginsSnapshot } from '@shared/plugins';

/** O que os plugins precisam da configuração: a lista de desativados e quando ela muda. */
export interface PluginSettings {
  disabled(): string[];
  setDisabled(ids: string[]): Promise<{ ok: true } | { ok: false; error: string }>;
  onChange(listener: () => void): () => void;
}

/** Lê `<dir>/<pasta>/plugin.json` (só dados; nenhum código de plugin é carregado). */
async function readPlugins(dir: string): Promise<LoadedPlugin[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e): Promise<LoadedPlugin> => {
        let text: string;
        try {
          text = await readFile(join(dir, e.name, 'plugin.json'), 'utf8');
        } catch {
          return { folder: e.name, error: 'plugin.json não encontrado' };
        }
        const errors: ParseError[] = [];
        const data: unknown = parse(text, errors, { allowTrailingComma: true });
        if (errors.length > 0) return { folder: e.name, error: `plugin.json com JSON inválido: ${printParseErrorCode(errors[0]!.error)}` };
        return { folder: e.name, data };
      }),
  );
}

/** Plugins declarativos: lê a pasta, observa mudanças e junta as contribuições dos ativos. */
export class PluginService {
  private loaded: LoadedPlugin[] = [];
  private current: PluginsSnapshot;
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<(snapshot: PluginsSnapshot) => void>();

  constructor(
    readonly dir: string,
    private readonly settings: PluginSettings,
  ) {
    this.current = { dir, ...resolvePlugins([], []) };
  }

  async start(debounceMs = 300): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await this.reload();
    try {
      this.watcher = watch(this.dir, { recursive: true }, () => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.reload(), debounceMs);
      });
    } catch {
      // Sem observação (pasta em rede, por exemplo): "Recarregar" continua funcionando.
    }
    // Ativar/desativar (ou editar settings.json à mão) recalcula sem reler a pasta.
    this.unsubscribe = this.settings.onChange(() => this.resolve());
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.timer) clearTimeout(this.timer);
    this.unsubscribe?.();
  }

  snapshot(): PluginsSnapshot {
    return this.current;
  }

  async reload(): Promise<PluginsSnapshot> {
    this.loaded = await readPlugins(this.dir);
    this.resolve(true);
    return this.current;
  }

  private resolve(force = false): void {
    const next: PluginsSnapshot = { dir: this.dir, ...resolvePlugins(this.loaded, this.settings.disabled()) };
    if (!force && JSON.stringify(next) === JSON.stringify(this.current)) return;
    this.current = next;
    for (const l of this.listeners) l(next);
  }

  async setEnabled(id: string, enabled: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
    const disabled = this.settings.disabled().filter((d) => d !== id);
    return this.settings.setDisabled(enabled ? disabled : [...disabled, id]);
  }

  onChange(listener: (snapshot: PluginsSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
