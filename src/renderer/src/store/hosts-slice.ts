import type { StateCreator } from 'zustand';
import type { Host, HostGroup, KeychainSnapshot } from '@shared/model';
import type { SshPromptEvent, SshSessionState } from '@shared/ssh';

/** Hosts SSH: metadados do keychain, etapas das conexões, perguntas pendentes e formulários. */
export interface HostsSlice {
  /** Só metadados e o estado dos segredos (null até o main responder). */
  keychain: KeychainSnapshot | null;
  /** Etapa de cada sessão SSH, por sessionId (chega antes de o renderer saber de qual aba é). */
  sshStates: Record<string, SshSessionState>;
  /** Perguntas do main na ordem em que chegaram; o diálogo mostra a primeira. */
  sshPrompts: SshPromptEvent[];
  /** Host em edição (id vazio = novo). */
  hostDialog: Host | null;
  /** Grupo em edição (id vazio = novo). */
  hostGroupDialog: HostGroup | null;
  /** Keychain aberto: chaves e identidades. */
  keychainOpen: boolean;
}

export const createHostsSlice: StateCreator<HostsSlice, [], [], HostsSlice> = () => ({
  keychain: null,
  sshStates: {},
  sshPrompts: [],
  hostDialog: null,
  hostGroupDialog: null,
  keychainOpen: false,
});

export function newHost(partial: Partial<Host> = {}): Host {
  return { id: '', name: '', address: '', groupId: null, color: null, tags: [], ...partial };
}

export function newHostGroup(partial: Partial<HostGroup> = {}): HostGroup {
  return { id: '', name: '', parentId: null, defaults: {}, ...partial };
}
