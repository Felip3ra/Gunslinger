import type { StateCreator } from 'zustand';
import type { Project, SavedCommand, Workspace } from '@shared/model';
import type { ImportPreview } from '@shared/transfer';
import type { VariablesPrompt } from '../run-command';

export interface Notice {
  id: number;
  kind: 'info' | 'warning' | 'error';
  message: string;
}

export interface DialogButton {
  label: string;
  value: string;
  primary?: boolean;
}

export interface DialogRequest {
  title: string;
  message: string;
  detail?: string;
  buttons: DialogButton[];
  resolve: (value: string | null) => void;
}

/** Avisos, diálogos, formulários e painéis sobrepostos. */
export interface OverlaysSlice {
  notices: Notice[];
  dialog: DialogRequest | null;
  overlay: 'palette' | 'commandHistory' | 'settings' | 'dockerPorts' | null;
  /** Seção a abrir nas configurações (consumida pelo diálogo). */
  settingsSection: 'historico' | 'plugins' | 'sobre' | null;
  variablesPrompt: VariablesPrompt | null;
  /** Comando em edição no formulário (null = fechado; id vazio = novo). */
  editingCommand: SavedCommand | null;
  selectedCommandId: string | null;
  /** 'list' = lista de projetos; objeto = formulário (id vazio = novo). */
  projectsDialog: 'list' | Project | null;
  transferDialog: { kind: 'export' } | { kind: 'import'; preview: ImportPreview } | null;
  /** 'list' = lista; 'save' = salvar abas atuais; objeto = editar. */
  workspacesDialog: 'list' | 'save' | Workspace | null;
  pushNotice(kind: Notice['kind'], message: string): void;
  dismissNotice(id: number): void;
}

let noticeId = 0;

export const createOverlaysSlice: StateCreator<OverlaysSlice, [], [], OverlaysSlice> = (set) => ({
  notices: [],
  dialog: null,
  overlay: null,
  settingsSection: null,
  variablesPrompt: null,
  editingCommand: null,
  selectedCommandId: null,
  projectsDialog: null,
  transferDialog: null,
  workspacesDialog: null,
  pushNotice: (kind, message) =>
    set((s) => (s.notices.some((n) => n.message === message) ? s : { notices: [...s.notices, { id: ++noticeId, kind, message }] })),
  dismissNotice: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
});

/** true quando algum modal está aberto (as teclas são dele, não dos atalhos globais). */
export function hasModalOpen(s: OverlaysSlice): boolean {
  return !!(s.dialog || s.overlay || s.variablesPrompt || s.editingCommand || s.projectsDialog || s.transferDialog || s.workspacesDialog);
}
