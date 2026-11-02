import type { StateCreator } from 'zustand';
import type { ConfigSnapshot, ProjectAnalysis, ShellProfile, StatusInfo, UiState } from '@shared/model';
import type { PluginsSnapshot } from '@shared/plugins';

/** Dados vindos do main: configuração, perfis, estado da UI, status e análises de projeto. */
export interface DataSlice {
  config: ConfigSnapshot | null;
  profiles: ShellProfile[];
  ui: UiState | null;
  envGeneration: number;
  statuses: Record<string, StatusInfo>;
  projectAnalyses: Record<string, ProjectAnalysis>;
  /** Plugins declarativos e as contribuições dos ativos (somente leitura). */
  plugins: PluginsSnapshot | null;
  setConfig(config: ConfigSnapshot): void;
  setProfiles(profiles: ShellProfile[]): void;
  setUi(ui: UiState): void;
}

export const createDataSlice: StateCreator<DataSlice, [], [], DataSlice> = (set) => ({
  config: null,
  profiles: [],
  ui: null,
  envGeneration: 0,
  statuses: {},
  projectAnalyses: {},
  plugins: null,
  setConfig: (config) => set({ config }),
  setProfiles: (profiles) => set({ profiles }),
  setUi: (ui) => set({ ui }),
});
