import { z } from 'zod';

export const uiStateSchema = z.object({
  version: z.literal(1),
  sidebar: z.object({ visible: z.boolean(), width: z.number().int().min(160).max(800) }),
  recents: z.array(z.string()).max(50),
  detectedProfiles: z.array(z.unknown()).default([]),
});
export type UiState = z.infer<typeof uiStateSchema>;
export const defaultUiState: UiState = {
  version: 1,
  sidebar: { visible: true, width: 280 },
  recents: [],
  detectedProfiles: [],
};
