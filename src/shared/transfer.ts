import { z } from 'zod';
import { customProfileSchema, hostGroupSchema, hostSchema, identitySchema, projectSchema, savedCommandSchema, sshKeyTypes } from './model';

export const EXPORT_FORMAT = 'gunslinger-export';

/** Identidade exportada: sem senha (o z.object descarta passwordSecretId ao ler). */
export const exportedIdentitySchema = identitySchema.omit({ passwordSecretId: true });
export type ExportedIdentity = z.infer<typeof exportedIdentitySchema>;

/** Chave exportada: só as que apontam para um arquivo em disco, e só os metadados. */
export const exportedKeySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  type: z.enum(sshKeyTypes),
  fingerprint: z.string().min(1),
  publicKey: z.string().min(1),
  comment: z.string().max(256),
  filePath: z.string().min(1),
  encrypted: z.boolean(),
});
export type ExportedKey = z.infer<typeof exportedKeySchema>;

export const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(1),
  exportedAt: z.string(),
  commands: z.array(savedCommandSchema).default([]),
  profiles: z.array(customProfileSchema).default([]),
  projects: z.array(projectSchema).default([]),
  hostGroups: z.array(hostGroupSchema).default([]),
  hosts: z.array(hostSchema).default([]),
  identities: z.array(exportedIdentitySchema).default([]),
  sshKeys: z.array(exportedKeySchema).default([]),
});
export type ExportFile = z.infer<typeof exportFileSchema>;

export interface ExportSelection {
  /** 'all' ou lista de categorias ('' = sem categoria). */
  categories: 'all' | string[];
  profileIds: string[];
  projectIds: string[];
  /** Hosts exportados; seus grupos, saltos, identidades e chaves (por arquivo) vão junto. */
  hostIds?: string[];
}

export type ImportKind = 'command' | 'profile' | 'project' | 'host' | 'identity' | 'key';
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
  /** Linhas ou itens que não serão importados (ex.: diretivas do ~/.ssh/config não suportadas). */
  warnings?: string[];
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
