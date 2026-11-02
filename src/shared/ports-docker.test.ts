import { describe, expect, it } from 'vitest';
import { dockerErrorReason, parseDockerPs } from './docker';
import { parseNetstat, parseTasklist } from './ports';

describe('netstat e tasklist', () => {
  it('lê portas em escuta (IPv4 e IPv6) sem repetir', () => {
    const out = [
      '  Proto  Endereço local          Endereço externo       Estado          PID',
      '  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       4120',
      '  TCP    127.0.0.1:5173         127.0.0.1:50000        ESTABLISHED     4120',
      '  TCP    [::]:135               [::]:0                 LISTENING       1756',
      '  TCP    [::1]:5173             [::]:0                 LISTENING       4120',
      '  TCP    0.0.0.0:5173           0.0.0.0:0              LISTENING       4120',
    ].join('\r\n');
    expect(parseNetstat(out)).toEqual([
      { address: '::', port: 135, pid: 1756 },
      { address: '0.0.0.0', port: 5173, pid: 4120 },
      { address: '::1', port: 5173, pid: 4120 },
    ]);
  });

  it('lê nomes de processos do tasklist em CSV', () => {
    const map = parseTasklist('"System","4","Services","0","10.880 K"\r\n"node.exe","4120","Console","1","50.000 K"');
    expect(map.get(4120)).toBe('node.exe');
  });
});

describe('docker ps', () => {
  it('lê uma linha JSON por container', () => {
    const out = '{"ID":"abc","Image":"postgres:16","Names":"loja-db","State":"running","Status":"Up 2 hours","Ports":"0.0.0.0:5432->5432/tcp"}\nlixo';
    expect(parseDockerPs(out)).toEqual([
      { id: 'abc', name: 'loja-db', image: 'postgres:16', state: 'running', status: 'Up 2 hours', ports: '0.0.0.0:5432->5432/tcp' },
    ]);
  });

  it('daemon parado vira mensagem clara', () => {
    expect(dockerErrorReason('error during connect: ... open //./pipe/dockerDesktopLinuxEngine')).toMatch(/daemon do Docker não está rodando/);
  });
});
