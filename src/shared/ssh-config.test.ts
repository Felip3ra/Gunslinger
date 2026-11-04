import { describe, expect, it } from 'vitest';
import { parseSshConfig } from './ssh-config';

const ctx = { home: 'C:\\Users\\ana', localUser: 'ana' };

describe('parseSshConfig', () => {
  it('lê hosts, usuários, portas, chaves e keepalive', () => {
    const text = [
      '# servidores',
      'Host homolog',
      '  HostName 10.0.0.12',
      '  User deploy',
      '  Port 2222',
      '  IdentityFile ~/.ssh/deploy_ed25519',
      '  ServerAliveInterval 15',
      '  ForwardAgent yes',
    ].join('\n');
    const r = parseSshConfig(text, ctx);
    expect(r.hosts).toEqual([
      { alias: 'homolog', hostName: '10.0.0.12', user: 'deploy', port: 2222, identityFile: 'C:\\Users\\ana/.ssh/deploy_ed25519', keepaliveSec: 15, agentForward: true },
    ]);
    expect(r.ignored).toEqual([]);
  });

  it('aceita "Chave=valor", aspas e diretivas sem diferenciar maiúsculas', () => {
    const r = parseSshConfig('host app\n  hostname=app.interno\n  IDENTITYFILE "%d/.ssh/minha chave"', ctx);
    expect(r.hosts[0]).toMatchObject({ hostName: 'app.interno', identityFile: 'C:\\Users\\ana/.ssh/minha chave' });
  });

  it('usa o alias como endereço quando não há HostName e cria um host por nome da linha', () => {
    const r = parseSshConfig('Host web1 web2\n  User ops', ctx);
    expect(r.hosts.map((h) => [h.alias, h.hostName, h.user])).toEqual([
      ['web1', 'web1', 'ops'],
      ['web2', 'web2', 'ops'],
    ]);
  });

  it('Host * e linhas antes do primeiro Host viram padrões, não hosts', () => {
    const r = parseSshConfig('User global\nHost app\n  HostName app.interno\nHost *\n  Port 2200\n  ServerAliveInterval 60', ctx);
    expect(r.hosts).toHaveLength(1);
    expect(r.defaults).toEqual({ user: 'global', port: 2200, keepaliveSec: 60 });
  });

  it('transforma ProxyJump num host de salto', () => {
    const r = parseSshConfig('Host bastion\n  HostName 200.1.1.1\nHost app\n  HostName 10.0.0.5\n  ProxyJump bastion', ctx);
    expect(r.hosts.find((h) => h.alias === 'app')?.jump).toBe('bastion');
  });

  it('ProxyJump com vários saltos vira cadeia e cria hosts que não são aliases', () => {
    const r = parseSshConfig('Host app\n  HostName 10.0.0.5\n  ProxyJump borda@200.1.1.1:2222,bastion\nHost bastion\n  HostName 10.0.0.1', ctx);
    const byAlias = Object.fromEntries(r.hosts.map((h) => [h.alias, h]));
    expect(byAlias['app']!.jump).toBe('bastion');
    expect(byAlias['bastion']!.jump).toBe('borda@200.1.1.1:2222');
    expect(byAlias['borda@200.1.1.1:2222']).toMatchObject({ hostName: '200.1.1.1', user: 'borda', port: 2222 });
  });

  it('ProxyJump none não define salto', () => {
    expect(parseSshConfig('Host app\n  ProxyJump none', ctx).hosts[0]!.jump).toBeUndefined();
  });

  it('lista Match, Include, curingas e diretivas não suportadas como ignoradas', () => {
    const r = parseSshConfig('Include config.d/*\nHost *.corp\n  User x\nHost app\n  Compression yes\nMatch host foo\n  User y\nHost ok', ctx);
    expect(r.ignored.map((i) => i.reason)).toEqual([
      'Include não é suportado',
      'diretiva não suportada',
      'Match não é suportado (o bloco inteiro foi ignorado)',
      'padrões com curinga não viram hosts',
    ]);
    expect(r.hosts.map((h) => h.alias)).toEqual(['app', 'ok']);
  });

  it('vale o primeiro valor de cada diretiva e o primeiro bloco de cada alias', () => {
    const r = parseSshConfig('Host app\n  User a\n  User b\nHost app\n  User c', ctx);
    expect(r.hosts).toEqual([{ alias: 'app', hostName: 'app', user: 'a' }]);
  });

  it('ignora hosts com endereço inválido e portas inválidas', () => {
    const r = parseSshConfig('Host ruim\n  HostName "com espaço"\nHost app\n  Port 70000', ctx);
    expect(r.hosts).toEqual([{ alias: 'app', hostName: 'app' }]);
    expect(r.ignored.map((i) => i.reason)).toEqual(['endereço inválido: com espaço', 'porta inválida']);
  });
});
