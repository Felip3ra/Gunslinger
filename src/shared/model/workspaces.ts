import { z } from 'zod';

export const workspacePaneSchema = z.object({
  profileId: z.string().nullable().default(null),
  cwd: z.string().nullable().default(null),
  projectId: z.string().nullable().default(null),
  /** Comando inicial (executado só depois da confirmação, ao abrir o workspace). */
  command: z.string().nullable().default(null),
});
export type WorkspacePane = z.infer<typeof workspacePaneSchema>;

export type WorkspaceLayout =
  | { type: 'pane'; pane: WorkspacePane }
  | { type: 'split'; direction: 'row' | 'column'; sizes: number[]; children: WorkspaceLayout[] };

export const workspaceLayoutSchema: z.ZodType<WorkspaceLayout, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal('pane'), pane: workspacePaneSchema }),
    z
      .object({
        type: z.literal('split'),
        direction: z.enum(['row', 'column']),
        sizes: z.array(z.number().positive()),
        children: z.array(workspaceLayoutSchema).min(2),
      })
      .refine((s) => s.sizes.length === s.children.length, 'sizes e children devem ter o mesmo tamanho'),
  ]),
);

export const workspaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tabs: z.array(workspaceLayoutSchema).min(1),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const workspacesFileSchema = z.object({
  version: z.literal(1),
  workspaces: z.array(workspaceSchema),
});
export type WorkspacesFile = z.infer<typeof workspacesFileSchema>;
export const defaultWorkspacesFile: WorkspacesFile = { version: 1, workspaces: [] };
