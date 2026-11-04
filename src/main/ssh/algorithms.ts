import type { Algorithms } from 'ssh2';

/**
 * Algoritmos oferecidos: os padrões do ssh2 sem os considerados fracos. Os padrões já deixam de fora
 * as cifras CBC e `diffie-hellman-group1-sha1`; a remoção explícita garante isso se o ssh2 mudar.
 * `ssh-rsa` (assinatura RSA com SHA-1) sai das chaves de servidor; RSA continua via rsa-sha2-256/512.
 */
// Os tipos do @types/ssh2 exigem append, prepend e remove juntos; o ssh2 aceita cada um sozinho.
export const SSH_ALGORITHMS = {
  kex: { remove: ['diffie-hellman-group1-sha1', 'diffie-hellman-group-exchange-sha1', 'diffie-hellman-group14-sha1'] },
  serverHostKey: { remove: ['ssh-rsa', 'ssh-dss'] },
  cipher: { remove: ['aes128-cbc', 'aes192-cbc', 'aes256-cbc', '3des-cbc', 'blowfish-cbc', 'cast128-cbc', 'arcfour', 'arcfour128', 'arcfour256'] },
} as unknown as Algorithms;

/** Pipe do agente do OpenSSH para Windows (serviço ssh-agent). */
export const OPENSSH_AGENT_PIPE = '\\\\.\\pipe\\openssh-ssh-agent';

export function agentPath(setting: 'off' | 'openssh' | 'pageant'): string | null {
  if (setting === 'openssh') return OPENSSH_AGENT_PIPE;
  if (setting === 'pageant') return 'pageant';
  return null;
}
