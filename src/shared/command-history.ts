import { z } from 'zod';

export const COMMAND_HISTORY_MAX = 500;
const COMMAND_MAX_LENGTH = 2000;

export const commandHistoryEntrySchema = z.object({
  command: z.string().min(1).max(COMMAND_MAX_LENGTH),
  cwd: z.string().max(4096).nullable(),
  /** Última execução (ms desde 1970). */
  at: z.number(),
  exitCode: z.number().int().nullable(),
  /** Quantas vezes foi executado. */
  count: z.number().int().min(1),
});
export type CommandHistoryEntry = z.infer<typeof commandHistoryEntrySchema>;

/**
 * Registra um comando no topo do histórico (o mais recente primeiro). Repetições sobem e somam;
 * linhas vazias, longas demais ou começadas por espaço (convenção do bash para não guardar) ficam de fora.
 */
export function recordCommand(
  list: readonly CommandHistoryEntry[],
  run: { command: string; cwd: string | null; at: number; exitCode: number | null },
  max = COMMAND_HISTORY_MAX,
): CommandHistoryEntry[] {
  if (/^\s/.test(run.command)) return [...list];
  const command = run.command.trim();
  if (!command || command.length > COMMAND_MAX_LENGTH) return [...list];
  const previous = list.find((e) => e.command === command);
  const entry: CommandHistoryEntry = { command, cwd: run.cwd, at: run.at, exitCode: run.exitCode, count: (previous?.count ?? 0) + 1 };
  return [entry, ...list.filter((e) => e.command !== command)].slice(0, max);
}
