import { z } from 'zod';

export const variableDefSchema = z.object({
  label: z.string().optional(),
  default: z.string().optional(),
  options: z.array(z.string()).default([]),
});
export type VariableDef = z.infer<typeof variableDefSchema>;

export const savedCommandSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  command: z.string().min(1),
  description: z.string().default(''),
  category: z.string().default(''),
  targetProfileId: z.string().nullable().default(null),
  cwd: z.string().nullable().default(null),
  projectId: z.string().nullable().default(null),
  variables: z.record(z.string(), variableDefSchema).default({}),
});
export type SavedCommand = z.infer<typeof savedCommandSchema>;

export const commandsFileSchema = z.object({
  version: z.literal(1),
  commands: z.array(savedCommandSchema),
});
export type CommandsFile = z.infer<typeof commandsFileSchema>;
export const defaultCommandsFile: CommandsFile = { version: 1, commands: [] };
