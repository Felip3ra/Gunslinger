/** Tipos das conexões SSH compartilhados entre main e renderer (prompts, respostas, etapas). */

/** Pergunta que o main precisa fazer ao usuário durante a conexão. */
export type SshPrompt =
  | { kind: 'hostKey-new'; host: string; port: number; keyType: string; fingerprint: string }
  | { kind: 'hostKey-changed'; host: string; port: number; keyType: string; fingerprint: string; previous: string[] }
  | { kind: 'hostKey-revoked'; host: string; port: number; keyType: string; fingerprint: string }
  | { kind: 'username' }
  | { kind: 'password'; username: string; canSave: boolean; retry: boolean }
  | { kind: 'passphrase'; keyName: string; canSave: boolean; retry: boolean }
  | {
      kind: 'keyboard-interactive';
      username: string;
      name: string;
      instructions: string;
      prompts: { prompt: string; echo: boolean }[];
      /** Só quando a pergunta é a senha (um campo oculto que pede senha). */
      canSave: boolean;
    };

export type SshPromptKind = SshPrompt['kind'];

export type SshAnswer =
  | { kind: 'hostKey'; decision: 'trust' | 'once' | 'replace' | 'cancel' }
  | { kind: 'text'; value: string; save: boolean }
  | { kind: 'responses'; values: string[]; save: boolean }
  | { kind: 'cancel' };

export interface SshPromptEvent {
  promptId: string;
  /** `usuário@endereço` ou o nome do host, para o título do diálogo. */
  target: string;
  prompt: SshPrompt;
}

export type SshStage = 'connecting' | 'jump' | 'verifying' | 'authenticating' | 'connected' | 'failed' | 'closed';

export interface SshSessionState {
  sessionId: string;
  stage: SshStage;
  /** Mensagem em português (erro, motivo da queda, salto atual). */
  message: string | null;
}

/** Destino de uma conexão: host cadastrado ou conexão rápida. */
export type SshTarget = { kind: 'host'; hostId: string } | { kind: 'quick'; username: string | null; address: string; port: number };

/** Pergunta de keyboard-interactive que é a senha (e por isso pode ser salva). */
export function isPasswordPrompt(prompts: readonly { prompt: string; echo: boolean }[]): boolean {
  return prompts.length === 1 && !prompts[0]!.echo && /password|senha|passwort|contrase/i.test(prompts[0]!.prompt);
}

export interface SshErrorInfo {
  code?: string;
  level?: string;
  message: string;
}

/** Mensagem em português para um erro de conexão do cliente SSH. */
export function translateSshError(err: SshErrorInfo, target: { address: string; port: number }): string {
  const where = target.address.includes(':') ? `[${target.address}]:${target.port}` : `${target.address}:${target.port}`;
  const message = err.message ?? '';
  switch (err.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return `Endereço não encontrado: ${target.address}`;
    case 'ECONNREFUSED':
      return `Conexão recusada por ${where}`;
    case 'ETIMEDOUT':
      return `Tempo esgotado ao conectar a ${where}`;
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `Rede inacessível para ${where}`;
    case 'ECONNRESET':
      return 'A conexão foi interrompida pelo servidor';
  }
  if (err.level === 'client-dns') return `Endereço não encontrado: ${target.address}`;
  if (/keepalive timeout/i.test(message)) return 'o servidor não respondeu';
  if (err.level === 'client-timeout') return `Tempo esgotado ao conectar a ${where}`;
  if (err.level === 'client-authentication' || /all configured authentication methods failed/i.test(message)) return 'Autenticação recusada pelo servidor';
  if (/no matching/i.test(message)) return 'Nenhum algoritmo em comum com o servidor';
  if (/administratively prohibited|open failed|connect failed/i.test(message)) return `Não foi possível alcançar ${where} pelo host de salto`;
  return `Falha na conexão com ${where}: ${message || 'erro desconhecido'}`;
}
