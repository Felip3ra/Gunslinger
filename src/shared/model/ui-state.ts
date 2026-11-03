import { z } from 'zod';
import { commandHistoryEntrySchema } from '../command-history';
import { workspaceLayoutSchema } from './workspaces';

export const uiStateSchema = z.object({
  version: z.literal(1),
  sidebar: z.object({ visible: z.boolean(), width: z.number().int().min(160).max(800) }),
  recents: z.array(z.string()).max(50),
  detectedProfiles: z.array(z.unknown()).default([]),
  /** Abas e painéis abertos quando o app fechou (reabertos se `session.restore`). */
  lastSession: z.array(workspaceLayoutSchema).max(50).default([]),
  /** Comandos digitados nos terminais, o mais recente primeiro. */
  commandHistory: z.array(commandHistoryEntrySchema).default([]),
});
export type UiState = z.infer<typeof uiStateSchema>;
export const defaultUiState: UiState = {
  version: 1,
  sidebar: { visible: true, width: 280 },
  recents: [],
  detectedProfiles: [],
  lastSession: [],
  commandHistory: [],
};
