import { describe, expect, it } from 'vitest';
import type { Host, HostGroup } from './model/hosts';
import { duplicateHost, findJumpProblem, formatTarget, parseQuickConnect, resolveHost, resolveJumpChain } from './ssh-hosts';

const host = (id: string, extra: Partial<Host> = {}): Host => ({ id, name: id, address: `${id}.interno`, groupId: null, color: null, tags: [], ...extra });
const group = (id: string, extra: Partial<HostGroup> = {}): HostGroup => ({ id, name: id, parentId: null, defaults: {}, ...extra });
const defaults = { keepaliveSec: 30 };

describe('resolveHost', () => {
  it('usa os padrões do app quando nada é definido', () => {
    const r = resolveHost(host('a'), [], defaults);
    expect(r).toMatchObject({ port: 22, username: null, keepaliveSec: 30, agentForward: false });
    expect(r.origin.port).toEqual({ kind: 'default' });
  });

  it('herda do grupo mais próximo que define o campo e informa a origem', () => {
    const groups = [group('raiz', { name: 'Clientes', defaults: { username: 'root', port: 2222 } }), group('prod', { name: 'Produção', parentId: 'raiz', defaults: { username: 'ops' } })];
    const r = resolveHost(host('db', { groupId: 'prod' }), groups, defaults);
    expect(r.username).toBe('ops');
    expect(r.origin.username).toEqual({ kind: 'group', groupId: 'prod', groupName: 'Produção' });
    expect(r.port).toBe(2222);
    expect(r.origin.port).toEqual({ kind: 'group', groupId: 'raiz', groupName: 'Clientes' });
  });

  it('o valor do host vence o do grupo', () => {
    const r = resolveHost(host('db', { groupId: 'g', username: 'deploy' }), [group('g', { defaults: { username: 'ops' } })], defaults);
    expect(r.username).toBe('deploy');
    expect(r.origin.username).toEqual({ kind: 'host' });
  });

  it('não entra em laço com grupos em ciclo', () => {
    const groups = [group('a', { parentId: 'b' }), group('b', { parentId: 'a', defaults: { port: 2200 } })];
    expect(resolveHost(host('x', { groupId: 'a' }), groups, defaults).port).toBe(2200);
  });
});

describe('resolveJumpChain', () => {
  it('ordena do primeiro salto ao host final', () => {
    const hosts = [host('app', { jumpHostId: 'bastion' }), host('bastion', { jumpHostId: 'borda' }), host('borda')];
    expect(resolveJumpChain('app', hosts, [])).toEqual({ ok: true, chain: ['borda', 'bastion', 'app'] });
  });

  it('considera o salto herdado do grupo', () => {
    const hosts = [host('app', { groupId: 'g' }), host('bastion')];
    expect(resolveJumpChain('app', hosts, [group('g', { defaults: { jumpHostId: 'bastion' } })])).toEqual({ ok: true, chain: ['bastion', 'app'] });
  });

  it('recusa ciclos, saltos demais e hosts inexistentes', () => {
    expect(resolveJumpChain('a', [host('a', { jumpHostId: 'b' }), host('b', { jumpHostId: 'a' })], [])).toMatchObject({ ok: false, reason: 'cycle' });
    const long = Array.from({ length: 8 }, (_, i) => host(`h${i}`, i < 7 ? { jumpHostId: `h${i + 1}` } : {}));
    expect(resolveJumpChain('h0', long, [])).toMatchObject({ ok: false, reason: 'too-deep' });
    expect(resolveJumpChain('a', [host('a', { jumpHostId: 'sumiu' })], [])).toEqual({ ok: false, reason: 'missing', hostId: 'sumiu' });
  });

  it('findJumpProblem aponta o ciclo', () => {
    expect(findJumpProblem([host('a', { jumpHostId: 'b' }), host('b', { jumpHostId: 'a' })], [])).toMatchObject({ reason: 'cycle' });
    expect(findJumpProblem([host('a', { jumpHostId: 'b' }), host('b')], [])).toBeNull();
  });

  it('o próprio host como salto é ciclo', () => {
    expect(resolveJumpChain('a', [host('a', { jumpHostId: 'a' })], [])).toMatchObject({ ok: false, reason: 'cycle' });
  });
});

describe('duplicateHost', () => {
  it('copia os campos com novo id e " (cópia)", mantendo a identidade por referência', () => {
    const original = host('hml-1', { identityId: 'deploy', tags: ['hml'] });
    const copy = duplicateHost(original, 'novo');
    expect(copy).toMatchObject({ id: 'novo', name: 'hml-1 (cópia)', identityId: 'deploy', tags: ['hml'] });
    expect(copy.tags).not.toBe(original.tags);
  });
});

describe('parseQuickConnect', () => {
  it.each([
    ['root@192.168.0.50:2222', { username: 'root', address: '192.168.0.50', port: 2222 }],
    ['10.0.0.12', { username: null, address: '10.0.0.12', port: null }],
    ['deploy@homolog.interno', { username: 'deploy', address: 'homolog.interno', port: null }],
    ['[::1]:2222', { username: null, address: '::1', port: 2222 }],
    ['ana@[fe80::1]', { username: 'ana', address: 'fe80::1', port: null }],
    ['2001:db8::1', { username: null, address: '2001:db8::1', port: null }],
    ['me@corp@host', { username: 'me@corp', address: 'host', port: null }],
  ])('lê %s', (text, expected) => expect(parseQuickConnect(text)).toEqual(expected));

  it.each(['', '@host', 'host:', 'host:99999', 'host:abc', 'a b', 'user@', '[::1]:'])('recusa %j', (text) => expect(parseQuickConnect(text)).toBeNull());
});

describe('formatTarget', () => {
  it('omite a porta 22 e põe IPv6 entre colchetes', () => {
    expect(formatTarget('deploy', '10.0.0.12', 22)).toBe('deploy@10.0.0.12');
    expect(formatTarget(null, '::1', 2222)).toBe('[::1]:2222');
  });
});
