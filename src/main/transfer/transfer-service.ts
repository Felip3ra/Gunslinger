import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { CustomProfile } from '@shared/model';
import { exportFileSchema, type ConflictDecision, type ExportFile, type ExportSelection, type ImportPreview, type ImportResult } from '@shared/transfer';
import { applyImport, buildExport, previewItems, type DataSnapshot } from '@shared/transfer-logic';
import type { DialogPort } from '../ports';
import type { SaveResult } from '@shared/model';

const FILTERS = [{ name: 'Gunslinger (JSON)', extensions: ['json'] }];

/** O que o serviço precisa da configuração e dos perfis (ISP: só isso). */
export interface TransferDeps {
  dialogs: DialogPort;
  snapshot(): DataSnapshot;
  knownProfileIds(): string[];
  executableExists(profile: CustomProfile): Promise<boolean>;
  writeProjects(projects: DataSnapshot['projects']): Promise<SaveResult>;
  writeCommands(commands: DataSnapshot['commands']): Promise<SaveResult>;
  writeCustomProfiles(profiles: CustomProfile[]): Promise<SaveResult>;
  readFile?(path: string): Promise<string>;
  writeFile?(path: string, content: string): Promise<void>;
}

export class TransferService {
  private readonly previews = new Map<string, ExportFile>();
  private readonly read: (p: string) => Promise<string>;
  private readonly write: (p: string, c: string) => Promise<void>;

  constructor(private readonly deps: TransferDeps) {
    this.read = deps.readFile ?? ((p) => readFile(p, 'utf8'));
    this.write = deps.writeFile ?? ((p, c) => writeFile(p, c, 'utf8'));
  }

  async export(selection: ExportSelection): Promise<{ path: string } | null> {
    const path = await this.deps.dialogs.saveFile({ title: 'Exportar', defaultPath: 'gunslinger-export.json', filters: FILTERS });
    if (!path) return null;
    await this.write(path, JSON.stringify(buildExport(this.deps.snapshot(), selection), null, 2) + '\n');
    return { path };
  }

  /** Lê e valida o arquivo e devolve a prévia. Nada é gravado e nenhum processo é iniciado. */
  async preview(): Promise<ImportPreview | { error: string } | null> {
    const path = await this.deps.dialogs.openFile({ title: 'Importar', filters: FILTERS });
    if (!path) return null;
    let raw: unknown;
    try {
      raw = JSON.parse(await this.read(path));
    } catch (err) {
      return { error: `Arquivo de importação inválido: ${err instanceof Error ? err.message : String(err)}` };
    }
    const parsed = exportFileSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      return { error: `Arquivo de importação inválido: ${issue.path.join('.') || 'arquivo'}: ${issue.message}` };
    }
    const available = new Map<string, boolean>();
    await Promise.all(parsed.data.profiles.map(async (p) => available.set(p.id, await this.deps.executableExists(p))));
    const items = previewItems(this.deps.snapshot(), parsed.data, {
      knownProfileIds: new Set(this.deps.knownProfileIds()),
      executableExists: (p) => available.get(p.id) ?? false,
    });
    const previewId = randomUUID();
    this.previews.set(previewId, parsed.data);
    return { previewId, sourcePath: path, items };
  }

  async apply(previewId: string, decisions: ConflictDecision[]): Promise<ImportResult> {
    const file = this.previews.get(previewId);
    if (!file) throw new Error('Prévia de importação expirada; importe o arquivo de novo.');
    const applied = applyImport(this.deps.snapshot(), file, decisions, () => randomUUID());
    // Projetos antes dos comandos: os comandos importados podem referenciar projetos novos.
    for (const step of [
      () => this.deps.writeProjects(applied.projects),
      () => this.deps.writeCommands(applied.commands),
      () => this.deps.writeCustomProfiles(applied.customProfiles),
    ]) {
      const r = await step();
      if (!r.ok) throw new Error(r.error);
    }
    this.previews.delete(previewId);
    return applied.result;
  }
}
