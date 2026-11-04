import { randomUUID } from 'node:crypto';
import type { SshAnswer, SshPrompt, SshPromptEvent } from '@shared/ssh';

export const PROMPT_TIMEOUT_MS = 5 * 60 * 1000;

interface Pending {
  group: string;
  prompt: SshPrompt;
  resolve(answer: SshAnswer | null): void;
  timer: NodeJS.Timeout;
}

/** A resposta combina com a pergunta? (o renderer não decide o tipo do que responde). */
function fits(prompt: SshPrompt, answer: SshAnswer): boolean {
  if (answer.kind === 'cancel') return true;
  switch (prompt.kind) {
    case 'hostKey-new':
      return answer.kind === 'hostKey' && (answer.decision === 'trust' || answer.decision === 'once' || answer.decision === 'cancel');
    case 'hostKey-changed':
      return answer.kind === 'hostKey' && (answer.decision === 'replace' || answer.decision === 'cancel');
    case 'hostKey-revoked':
      return answer.kind === 'hostKey' && answer.decision === 'cancel';
    case 'username':
    case 'password':
    case 'passphrase':
      return answer.kind === 'text';
    case 'keyboard-interactive':
      return answer.kind === 'responses' && answer.values.length === prompt.prompts.length;
  }
}

/**
 * Perguntas do main ao renderer durante a conexão. Cada pergunta tem um id de uso único;
 * sem resposta em 5 minutos, vale como cancelada.
 */
export class PromptBroker {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly send: (event: SshPromptEvent) => void,
    private readonly closed: (promptId: string) => void,
    private readonly timeoutMs = PROMPT_TIMEOUT_MS,
  ) {}

  /** Pergunta e espera; null quando cancelada, expirada ou descartada. `group` agrupa as perguntas de uma conexão. */
  ask(group: string, target: string, prompt: SshPrompt): Promise<SshAnswer | null> {
    const promptId = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finish(promptId, null), this.timeoutMs);
      this.pending.set(promptId, { group, prompt, resolve, timer });
      this.send({ promptId, target, prompt });
    });
  }

  /** Resposta do renderer; false se o id não existe (já respondido ou expirado) ou a resposta não combina. */
  answer(promptId: string, answer: SshAnswer): boolean {
    const pending = this.pending.get(promptId);
    if (!pending || !fits(pending.prompt, answer)) return false;
    this.finish(promptId, answer.kind === 'cancel' ? null : answer);
    return true;
  }

  /** Descarta as perguntas de uma conexão (aba fechada, conexão desistida). */
  cancelGroup(group: string): void {
    for (const [id, p] of this.pending) if (p.group === group) this.finish(id, null);
  }

  cancelAll(): void {
    for (const id of [...this.pending.keys()]) this.finish(id, null);
  }

  private finish(promptId: string, answer: SshAnswer | null): void {
    const pending = this.pending.get(promptId);
    if (!pending) return;
    this.pending.delete(promptId);
    clearTimeout(pending.timer);
    this.closed(promptId);
    pending.resolve(answer);
  }
}
