import type { SshAnswer, SshSessionState, SshStage } from '@shared/ssh';
import { api } from './api';
import { useStore } from './store';

/** Liga os eventos de SSH do main ao store. Chamado uma vez na inicialização. */
export function wireSshEvents(): void {
  api.on('ssh:state', (state) => useStore.setState((s) => ({ sshStates: { ...s.sshStates, [state.sessionId]: state } })));
  api.on('ssh:prompt', (event) => useStore.setState((s) => ({ sshPrompts: [...s.sshPrompts, event] })));
  api.on('ssh:promptClosed', ({ promptId }) => useStore.setState((s) => ({ sshPrompts: s.sshPrompts.filter((p) => p.promptId !== promptId) })));
  api.on('keychain:changed', (keychain) => useStore.setState({ keychain }));
}

/** Responde a primeira pergunta pendente (o diálogo some quando o main confirma com ssh:promptClosed). */
export async function answerSshPrompt(promptId: string, answer: SshAnswer): Promise<void> {
  // Tira da fila já: o main fecha a pergunta de qualquer jeito (resposta aceita ou id inválido).
  useStore.setState((s) => ({ sshPrompts: s.sshPrompts.filter((p) => p.promptId !== promptId) }));
  await api.invoke('ssh:answer', { promptId, answer }).catch(() => false);
}

const STAGE_TEXT: Record<SshStage, string> = {
  connecting: 'Conectando',
  jump: 'Conectando pelo host de salto',
  verifying: 'Verificando o servidor',
  authenticating: 'Autenticando',
  connected: 'Conectado',
  failed: 'Falha na conexão',
  closed: 'Conexão encerrada',
};

/** Texto da etapa para a aba (com o detalhe que o main mandou, quando houver). */
export function stageText(state: SshSessionState | undefined, label: string): string {
  if (!state) return `Conectando a ${label}…`;
  if (state.stage === 'jump' && state.message) return `${state.message}…`;
  if (state.stage === 'connecting') return `Conectando a ${label}…`;
  const base = STAGE_TEXT[state.stage];
  return state.message ? `${base}: ${state.message}` : `${base}…`;
}
