import { describe, expect, it } from 'vitest';
import { isPasswordPrompt, translateSshError } from './ssh';

const target = { address: '10.0.0.12', port: 22 };

describe('translateSshError', () => {
  it.each([
    [{ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' }, 'Endereço não encontrado: 10.0.0.12'],
    [{ level: 'client-dns', message: 'x' }, 'Endereço não encontrado: 10.0.0.12'],
    [{ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }, 'Conexão recusada por 10.0.0.12:22'],
    [{ level: 'client-timeout', message: 'Timed out while waiting for handshake' }, 'Tempo esgotado ao conectar a 10.0.0.12:22'],
    [{ level: 'client-timeout', message: 'Keepalive timeout' }, 'o servidor não respondeu'],
    [{ level: 'client-authentication', message: 'All configured authentication methods failed' }, 'Autenticação recusada pelo servidor'],
    [{ level: 'handshake', message: 'Handshake failed: no matching key exchange algorithm' }, 'Nenhum algoritmo em comum com o servidor'],
    [{ code: 'ECONNRESET', message: 'read ECONNRESET' }, 'A conexão foi interrompida pelo servidor'],
    [{ message: 'algo estranho' }, 'Falha na conexão com 10.0.0.12:22: algo estranho'],
  ])('%j', (err, expected) => expect(translateSshError(err, target)).toBe(expected));

  it('põe IPv6 entre colchetes', () => {
    expect(translateSshError({ code: 'ECONNREFUSED', message: '' }, { address: '::1', port: 2222 })).toBe('Conexão recusada por [::1]:2222');
  });
});

describe('isPasswordPrompt', () => {
  it('só a senha (um campo oculto) pode ser salva', () => {
    expect(isPasswordPrompt([{ prompt: 'Password: ', echo: false }])).toBe(true);
    expect(isPasswordPrompt([{ prompt: 'Verification code: ', echo: false }])).toBe(false);
    expect(isPasswordPrompt([{ prompt: 'Password: ', echo: true }])).toBe(false);
    expect(isPasswordPrompt([{ prompt: 'Password: ', echo: false }, { prompt: 'Code: ', echo: false }])).toBe(false);
  });
});
