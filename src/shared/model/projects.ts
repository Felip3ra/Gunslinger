import { z } from 'zod';

export const packageManagers = ['npm', 'yarn', 'pnpm'] as const;
export type PackageManager = (typeof packageManagers)[number];

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string().min(1),
  defaultProfileId: z.string().nullable().default(null),
  types: z.object({ dotnet: z.boolean(), node: z.boolean() }).default({ dotnet: false, node: false }),
  variables: z.record(z.string(), z.string()).default({}),
  node: z
    .object({ packageManagerOverrides: z.record(z.string(), z.enum(packageManagers)).default({}) })
    .default({ packageManagerOverrides: {} }),
});
export type Project = z.infer<typeof projectSchema>;

export const projectsFileSchema = z.object({
  version: z.literal(1),
  projects: z.array(projectSchema),
});
export type ProjectsFile = z.infer<typeof projectsFileSchema>;
export const defaultProjectsFile: ProjectsFile = { version: 1, projects: [] };
