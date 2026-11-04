import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SshPromptEvent } from '@shared/ssh';
import { PromptBroker } from './prompt-broker';

let sent: SshPromptEvent[];
let closed: string[];
let broker: PromptBroker;

beforeEach(() => {
  vi.useFakeTimers();
  sent = [];
  closed = [];
  broker = new PromptBroker((e) => void sent.push(e), (id) => void closed.push(id), 1000);
});
afterEach(() => vi.useRealTimers());

describe('PromptBroker', () => {
  it('entrega a resposta uma vez só', async () => {
    const answer = broker.ask('c1', 'deploy@10.0.0.12', { kind: 'password', username: 'deploy', canSave: true, retry: false });
    const { promptId } = sent[0]!;
    expect(broker.answer(promptId, { kind: 'text', value: 'x', save: false })).toBe(true);
    expect(broker.answer(promptId, { kind: 'text', value: 'y', save: false })).toBe(false);
    expect(await answer).toEqual({ kind: 'text', value: 'x', save: false });
    expect(closed).toEqual([promptId]);
  });

  it('recusa resposta que não combina com a pergunta', async () => {
    void broker.ask('c1', 't', { kind: 'hostKey-changed', host: 'h', port: 22, keyType: 'ssh-ed25519', fingerprint: 'f', previous: [] });
    const { promptId } = sent[0]!;
    // "Conectar só desta vez" não vale para chave alterada.
    expect(broker.answer(promptId, { kind: 'hostKey', decision: 'once' })).toBe(false);
    expect(broker.answer(promptId, { kind: 'text', value: 'x', save: false })).toBe(false);
    expect(broker.answer(promptId, { kind: 'hostKey', decision: 'replace' })).toBe(true);
  });

  it('keyboard-interactive exige uma resposta por pergunta', () => {
    void broker.ask('c1', 't', { kind: 'keyboard-interactive', username: 'u', name: '', instructions: '', prompts: [{ prompt: 'Code:', echo: false }], canSave: false });
    const { promptId } = sent[0]!;
    expect(broker.answer(promptId, { kind: 'responses', values: [], save: false })).toBe(false);
    expect(broker.answer(promptId, { kind: 'responses', values: ['123456'], save: false })).toBe(true);
  });

  it('sem resposta no prazo vale como cancelada', async () => {
    const answer = broker.ask('c1', 't', { kind: 'username' });
    vi.advanceTimersByTime(1000);
    expect(await answer).toBeNull();
    expect(broker.answer(sent[0]!.promptId, { kind: 'text', value: 'x', save: false })).toBe(false);
  });

  it('cancelar resolve com null e descarta só as do grupo', async () => {
    const a = broker.ask('c1', 't', { kind: 'username' });
    const b = broker.ask('c2', 't', { kind: 'username' });
    broker.cancelGroup('c1');
    expect(await a).toBeNull();
    expect(broker.answer(sent[1]!.promptId, { kind: 'cancel' })).toBe(true);
    expect(await b).toBeNull();
  });
});
