import { createHash } from 'node:crypto';
import { watch, type FSWatcher } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyEdits, findNodeAtLocation, modify, parse, parseTree, printParseErrorCode, type ParseError } from 'jsonc-parser';
import type { ZodTypeAny } from 'zod';
import { normalizeAccelerator } from '@shared/keys';
import {
  commandsFileSchema,
  defaultCommandsFile,
  defaultKeybindings,
  defaultProjectsFile,
  defaultSettings,
  defaultUiState,
  defaultWorkspacesFile,
  defaultHostsFile,
  defaultKeychainFile,
  defaultKnownHostsFile,
  hostsFileSchema,
  keychainFileSchema,
  knownHostsFileSchema,
  type HostsFile,
  type KeychainFile,
  type KnownHostsFile,
  workspacesFileSchema,
  type WorkspacesFile,
  projectsFileSchema,
  settingsSchema,
  uiStateSchema,
  type CommandsFile,
  type ConfigFileName,
  type ConfigIssue,
  type ConfigSnapshot,
  type ProjectsFile,
  type SaveResult,
  type Settings,
  type UiState,
} from '@shared/model';
import { writeFileAtomic } from './atomic-write';
import { validateWithFallback } from './validate';

export const CURRENT_VERSION = 1;

/** Migração de `version` n para n+1. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;
export type Migrations = Partial<Record<ConfigFileName, Record<number, Migration>>>;

interface FileDef {
  name: ConfigFileName;
  fileName: string;
  schema: ZodTypeAny;
  defaults: unknown;
  /**
   * Fora do histórico de configuração: restaurar uma versão antiga do keychain apontaria para segredos
   * apagados, e a de known hosts traria de volta como confiável uma chave que o usuário substituiu.
   */
  noHistory?: boolean;
}

const FILES: Record<ConfigFileName, FileDef> = {
  settings: { name: 'settings', fileName: 'settings.json', schema: settingsSchema, defaults: defaultSettings },
  commands: { name: 'commands', fileName: 'commands.json', schema: commandsFileSchema, defaults: defaultCommandsFile },
  projects: { name: 'projects', fileName: 'projects.json', schema: projectsFileSchema, defaults: defaultProjectsFile },
  workspaces: { name: 'workspaces', fileName: 'workspaces.json', schema: workspacesFileSchema, defaults: defaultWorkspacesFile },
  hosts: { name: 'hosts', fileName: 'hosts.json', schema: hostsFileSchema, defaults: defaultHostsFile },
  // Keychain e known hosts: validados e gravados aqui, mas fora do snapshot do renderer (têm ids de segredo).
  keychain: { name: 'keychain', fileName: 'keychain.json', schema: keychainFileSchema, defaults: defaultKeychainFile, noHistory: true },
  knownHosts: { name: 'knownHosts', fileName: 'known_hosts.json', schema: knownHostsFileSchema, defaults: defaultKnownHostsFile, noHistory: true },
};

interface FileState {
  text: string | null;
  value: unknown;
  issues: ConfigIssue[];
  readOnly: boolean;
}

const hash = (text: string): string => createHash('sha1').update(text).digest('hex');
const toJson = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
const clone = <T>(value: T): T => structuredClone(value);

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** Junta os atalhos do usuário com os padrões e avisa sobre combinações repetidas (vale a primeira). */
function normalizeKeybindings(raw: Record<string, string | null>, issues: ConfigIssue[]): Record<string, string | null> {
  const merged: Record<string, string | null> = { ...raw };
  for (const [action, accel] of Object.entries(defaultKeybindings)) if (!(action in merged)) merged[action] = accel;

  const seen = new Map<string, string>();
  const result: Record<string, string | null> = {};
  for (const [action, accel] of Object.entries(merged)) {
    if (accel === null) {
      result[action] = null;
      continue;
    }
    const normalized = normalizeAccelerator(accel);
    if (!normalized) {
      issues.push({ file: 'settings', path: ['keybindings', action], message: `atalho inválido: "${accel}"`, severity: 'warning' });
      result[action] = null;
      continue;
    }
    const owner = seen.get(normalized);
    if (owner) {
      issues.push({
        file: 'settings',
        path: ['keybindings', action],
        message: `${normalized} já está associado a "${owner}"; mantido só em "${owner}"`,
        severity: 'warning',
      });
      result[action] = null;
      continue;
    }
    seen.set(normalized, action);
    result[action] = normalized;
  }
  return result;
}

export class ConfigStore {
  private readonly files = new Map<ConfigFileName, FileState>();
  private readonly ownWrites = new Map<string, string>();
  private readonly listeners = new Set<(snapshot: ConfigSnapshot) => void>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private watcher: FSWatcher | null = null;
  private state: UiState = clone(defaultUiState);
  private stateWrite: Promise<void> = Promise.resolve();

  constructor(
    readonly dir: string,
    private readonly migrations: Migrations = {},
  ) {}

  async load(): Promise<ConfigSnapshot> {
    for (const def of Object.values(FILES)) this.files.set(def.name, await this.loadFile(def));
    this.state = await this.loadState();
    return this.snapshot();
  }

  snapshot(): ConfigSnapshot {
    const get = (name: ConfigFileName): FileState => this.files.get(name)!;
    return {
      settings: clone(get('settings').value as Settings),
      commands: clone(get('commands').value as CommandsFile),
      projects: clone(get('projects').value as ProjectsFile),
      workspaces: clone(get('workspaces').value as WorkspacesFile),
      hosts: clone(get('hosts').value as HostsFile),
      issues: Object.values(FILES).flatMap((def) => get(def.name).issues),
      readOnly: Object.fromEntries(Object.values(FILES).map((def) => [def.name, get(def.name).readOnly])) as Record<ConfigFileName, boolean>,
      dataDir: this.dir,
    };
  }

  /** Metadados do keychain (com ids de segredo): só para o processo principal. */
  keychainFile(): KeychainFile {
    return clone(this.files.get('keychain')!.value as KeychainFile);
  }

  /** Hosts conhecidos: só para o processo principal (o renderer recebe a visão com fingerprint). */
  knownHostsFile(): KnownHostsFile {
    return clone(this.files.get('knownHosts')!.value as KnownHostsFile);
  }

  onChange(listener: (snapshot: ConfigSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  pathOf(name: ConfigFileName): string {
    return join(this.dir, FILES[name].fileName);
  }

  // ---------- leitura ----------

  private async loadFile(def: FileDef): Promise<FileState> {
    const path = this.pathOf(def.name);
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        const fresh = toJson(def.defaults);
        await this.write(def.name, fresh, false);
        return { text: fresh, value: clone(def.defaults), issues: [], readOnly: false };
      }
      return {
        text: null,
        value: clone(def.defaults),
        issues: [{ file: def.name, path: [], message: `não foi possível ler: ${String(err)}`, severity: 'error' }],
        readOnly: true,
      };
    }
    return this.parseFile(def, text);
  }

  private async parseFile(def: FileDef, text: string): Promise<FileState> {
    const errors: ParseError[] = [];
    const data: unknown = parse(text, errors, { allowTrailingComma: false, disallowComments: false });
    if (errors.length > 0) {
      const first = errors[0]!;
      return {
        text,
        value: clone(def.defaults),
        issues: [
          {
            file: def.name,
            path: [],
            line: lineOf(text, first.offset),
            message: `JSON inválido: ${printParseErrorCode(first.error)}`,
            severity: 'error',
          },
        ],
        readOnly: true,
      };
    }

    const issues: ConfigIssue[] = [];
    let readOnly = false;
    let migrated = data;
    const version = typeof data === 'object' && data !== null ? (data as { version?: unknown }).version : undefined;
    if (typeof version === 'number' && version > CURRENT_VERSION) {
      issues.push({
        file: def.name,
        path: ['version'],
        message: `arquivo criado por uma versão mais nova do Gunslinger (versão ${version}); aberto somente para leitura`,
        severity: 'error',
      });
      readOnly = true;
      migrated = { ...(data as object), version: CURRENT_VERSION };
    } else if (typeof version === 'number' && version < CURRENT_VERSION) {
      try {
        migrated = this.migrate(def.name, data as Record<string, unknown>, version);
      } catch (err) {
        issues.push({ file: def.name, path: ['version'], message: String(err), severity: 'error' });
        return { text, value: clone(def.defaults), issues, readOnly: true };
      }
    }

    const tree = parseTree(text);
    const validated = validateWithFallback(def.schema, def.defaults, migrated);
    const fieldIssues = validated.issues;
    let value = validated.value;
    for (const fi of fieldIssues) {
      const node = tree ? findNodeAtLocation(tree, fi.path) : undefined;
      issues.push({
        file: def.name,
        path: fi.path,
        ...(node ? { line: lineOf(text, node.offset) } : {}),
        message: fi.message,
        severity: 'error',
      });
    }
    if (fieldIssues.length > 0) readOnly = true;

    if (def.name === 'settings') {
      const settings = value as Settings;
      value = { ...settings, keybindings: normalizeKeybindings(settings.keybindings, issues) };
    }

    // Migração bem-sucedida e sem erros: grava a nova versão (com .bak da anterior).
    if (migrated !== data && !readOnly) {
      const migratedText = toJson(value);
      await this.write(def.name, migratedText, true);
      return { text: migratedText, value, issues, readOnly };
    }
    return { text, value, issues, readOnly };
  }

  private migrate(name: ConfigFileName, data: Record<string, unknown>, from: number): Record<string, unknown> {
    let current = data;
    for (let v = from; v < CURRENT_VERSION; v++) {
      const step = this.migrations[name]?.[v];
      if (!step) throw new Error(`Sem migração de ${name} v${v} para v${v + 1}`);
      current = { ...step(current), version: v + 1 };
    }
    return current;
  }

  private async loadState(): Promise<UiState> {
    try {
      const raw: unknown = JSON.parse(await readFile(join(this.dir, 'state.json'), 'utf8'));
      return validateWithFallback(uiStateSchema, defaultUiState, raw).value as UiState;
    } catch {
      return clone(defaultUiState);
    }
  }

  // ---------- gravação ----------

  private async write(name: ConfigFileName, text: string, backup: boolean): Promise<void> {
    const path = this.pathOf(name);
    this.ownWrites.set(path, hash(text));
    await writeFileAtomic(path, text, { backup });
  }

  private blocked(name: ConfigFileName): SaveResult | null {
    const file = this.files.get(name)!;
    if (!file.readOnly) return null;
    return {
      ok: false,
      error: `${FILES[name].fileName} contém erros. Corrija o arquivo (ou restaure ${FILES[name].fileName}.bak) antes de salvar.`,
    };
  }

  async updateSettings(path: (string | number)[], value: unknown): Promise<SaveResult> {
    const blocked = this.blocked('settings');
    if (blocked) return blocked;
    const file = this.files.get('settings')!;
    const text = file.text ?? toJson(defaultSettings);
    const edits = modify(text, path, value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' } });
    const newText = applyEdits(text, edits);
    const next = await this.parseFile(FILES.settings, newText);
    if (next.readOnly) {
      return { ok: false, error: next.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
    }
    await this.write('settings', newText, true);
    this.files.set('settings', next);
    this.emit();
    return { ok: true };
  }

  async mutateCommands(fn: (file: CommandsFile) => CommandsFile): Promise<SaveResult> {
    return this.mutateJson('commands', commandsFileSchema, fn);
  }

  async mutateProjects(fn: (file: ProjectsFile) => ProjectsFile): Promise<SaveResult> {
    return this.mutateJson('projects', projectsFileSchema, fn);
  }

  async mutateWorkspaces(fn: (file: WorkspacesFile) => WorkspacesFile): Promise<SaveResult> {
    return this.mutateJson('workspaces', workspacesFileSchema, fn);
  }

  async mutateHosts(fn: (file: HostsFile) => HostsFile): Promise<SaveResult> {
    return this.mutateJson('hosts', hostsFileSchema, fn);
  }

  async mutateKeychain(fn: (file: KeychainFile) => KeychainFile): Promise<SaveResult> {
    return this.mutateJson('keychain', keychainFileSchema, fn);
  }

  async mutateKnownHosts(fn: (file: KnownHostsFile) => KnownHostsFile): Promise<SaveResult> {
    return this.mutateJson('knownHosts', knownHostsFileSchema, fn);
  }

  private async mutateJson<T>(name: ConfigFileName, schema: ZodTypeAny, fn: (file: T) => T): Promise<SaveResult> {
    const blocked = this.blocked(name);
    if (blocked) return blocked;
    const file = this.files.get(name)!;
    let next: T;
    try {
      next = fn(clone(file.value as T));
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    const parsed = schema.safeParse(next);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
    }
    const text = toJson(parsed.data);
    await this.write(name, text, true);
    this.files.set(name, { text, value: parsed.data, issues: [], readOnly: false });
    this.emit();
    return { ok: true };
  }

  // ---------- histórico ----------

  /** Textos atuais dos arquivos válidos; null se algum estiver inválido (o snapshot ficaria parcial). */
  fileTexts(): Partial<Record<ConfigFileName, string>> | null {
    const texts: Partial<Record<ConfigFileName, string>> = {};
    for (const def of Object.values(FILES).filter((d) => !d.noHistory)) {
      const file = this.files.get(def.name)!;
      if (file.readOnly) return null;
      texts[def.name] = file.text ?? toJson(file.value);
    }
    return texts;
  }

  /**
   * Substitui os arquivos pelos textos dados (restauração explícita do usuário). Valida todos antes de
   * gravar qualquer um; pode substituir um arquivo inválido, cujo conteúdo fica no `.bak`.
   */
  async restoreFiles(texts: Partial<Record<ConfigFileName, string>>): Promise<SaveResult> {
    const parsed: [ConfigFileName, string, FileState][] = [];
    for (const [name, text] of Object.entries(texts) as [ConfigFileName, string][]) {
      const def = FILES[name];
      if (!def || def.noHistory) continue;
      const next = await this.parseFile(def, text);
      if (next.readOnly) {
        return { ok: false, error: `${def.fileName} do snapshot é inválido: ${next.issues.map((i) => i.message).join('; ')}` };
      }
      parsed.push([name, text, next]);
    }
    for (const [name, text, next] of parsed) {
      await this.write(name, text, true);
      this.files.set(name, next);
    }
    this.emit();
    return { ok: true };
  }

  getState(): UiState {
    return clone(this.state);
  }

  async patchState(patch: Partial<Omit<UiState, 'version'>>): Promise<void> {
    this.state = { ...this.state, ...patch };
    // Gravações em fila: duas ao mesmo tempo disputariam o mesmo state.json.tmp.
    const text = toJson(this.state);
    const write = this.stateWrite.then(() => writeFileAtomic(join(this.dir, 'state.json'), text));
    this.stateWrite = write.catch(() => undefined);
    await write;
  }

  // ---------- observação de mudanças externas ----------

  startWatching(debounceMs = 200): void {
    if (this.watcher) return;
    const byFileName = new Map(Object.values(FILES).map((d) => [d.fileName.toLowerCase(), d]));
    this.watcher = watch(this.dir, (_event, filename) => {
      const def = filename ? byFileName.get(filename.toString().toLowerCase()) : undefined;
      if (!def) return;
      clearTimeout(this.timers.get(def.name));
      this.timers.set(def.name, setTimeout(() => void this.reloadFromDisk(def), debounceMs));
    });
  }

  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private async reloadFromDisk(def: FileDef): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.pathOf(def.name), 'utf8');
    } catch {
      return; // arquivo removido ou em gravação; o próximo evento resolve
    }
    if (this.ownWrites.get(this.pathOf(def.name)) === hash(text)) return;
    if (this.files.get(def.name)?.text === text) return;
    this.files.set(def.name, await this.parseFile(def, text));
    this.emit();
  }

  private emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
}
