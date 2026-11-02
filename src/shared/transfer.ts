import { z } from 'zod';
import { customProfileSchema, projectSchema, savedCommandSchema } from './model';

export const EXPORT_FORMAT = 'gunslinger-export';

export const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(1),
  exportedAt: z.string(),
  commands: z.array(savedCommandSchema).default([]),
  profiles: z.array(customProfileSchema).default([]),
  projects: z.array(projectSchema).default([]),
});
export type ExportFile = z.infer<typeof exportFileSchema>;

export interface ExportSelection {
  /** 'all' ou lista de categorias ('' = sem categoria). */
  categories: 'all' | string[];
  profileIds: string[];
  projectIds: string[];
}

export type ImportKind = 'command' | 'profile' | 'project';
export type ConflictAction = 'replace' | 'keepBoth' | 'skip';

export interface ImportItem {
  key: string;
  kind: ImportKind;
  name: string;
  /** Texto completo do comando, para revisão antes de importar. */
  detail: string;
  conflictWith: string | null;
  notes: string[];
}

export interface ImportPreview {
  previewId: string;
  sourcePath: string;
  items: ImportItem[];
}

export interface ConflictDecision {
  key: string;
  action: ConflictAction;
}

export interface ImportResult {
  added: number;
  replaced: number;
  skipped: number;
}
