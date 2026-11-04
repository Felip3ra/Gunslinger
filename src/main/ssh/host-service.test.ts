import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Host, HostGroup } from '@shared/model';
import { ConfigStore } from '../config/config-store';
import { HostService } from './host-service';

let dir: string;
let config: ConfigStore;
let service: HostService;
let counter = 0;

const host = (id: string, extra: Partial<Host> = {}): Host => ({ id, name: id, address: `${id}.interno`, groupId: null, color: null, tags: [], ...extra });
const group = (id: string, extra: Partial<HostGroup> = {}): HostGroup => ({ id, name: id, parentId: null, defaults: {}, ...extra });

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gs-hosts-'));
  config = new ConfigStore(dir);
  await config.load();
  service = new HostService(config, () => `novo-${++counter}`);
});
afterEach(async () => rm(dir, { recursive: true, force: true }));

const hosts = () => config.snapshot().hosts;

describe('HostService', () => {
  it('cria, atualiza e persiste hosts', async () => {
    expect(await service.saveHost(host('api', { username: 'deploy' }))).toEqual({ ok: true, hostId: 'api' });
    await service.saveHost(host('api', { username: 'ops' }));
    const reloaded = new ConfigStore(dir);
    await reloaded.load();
    expect(reloaded.snapshot().hosts.hosts).toEqual([host('api', { username: 'ops' })]);
  });

  it('recusa endereço inválido (schema) e grupo inexistente', async () => {
    expect((await service.saveHost(host('x', { address: 'com espaço' }))).ok).toBe(false);
    expect(await service.saveHost(host('x', { groupId: 'sumiu' }))).toEqual({ ok: false, error: 'Grupo não encontrado.' });
  });

  it('recusa ciclos de salto, inclusive herdados do grupo', async () => {
    await service.saveHost(host('a', { jumpHostId: 'b' }));
    expect(await service.saveHost(host('b', { jumpHostId: 'a' }))).toEqual({ ok: false, error: 'Os hosts de salto formam um ciclo.' });
    await service.saveGroup(group('g', { defaults: { jumpHostId: 'a' } }));
    expect(await service.saveHost(host('b', { groupId: 'g' }))).toEqual({ ok: false, error: 'Os hosts de salto formam um ciclo.' });
    expect(hosts().hosts.map((h) => h.id)).toEqual(['a']);
  });

  it('duplica logo depois do original', async () => {
    await service.saveHost(host('hml-1', { identityId: 'deploy' }));
    await service.saveHost(host('hml-2'));
    const r = await service.duplicateHost('hml-1');
    expect(r).toEqual({ ok: true, hostId: 'novo-1' });
    expect(hosts().hosts.map((h) => h.name)).toEqual(['hml-1', 'hml-1 (cópia)', 'hml-2']);
    expect(hosts().hosts[1]!.identityId).toBe('deploy');
  });

  it('excluir um host tira-o como salto de quem o usava', async () => {
    await service.saveHost(host('bastion'));
    await service.saveHost(host('app', { jumpHostId: 'bastion' }));
    expect(service.jumpUsers('bastion')).toEqual(['app']);
    await service.deleteHost('bastion');
    expect(hosts().hosts).toEqual([host('app')]);
  });

  it('não deixa um grupo dentro dele mesmo', async () => {
    await service.saveGroup(group('a'));
    await service.saveGroup(group('b', { parentId: 'a' }));
    expect(await service.saveGroup(group('a', { parentId: 'b' }))).toEqual({ ok: false, error: 'Um grupo não pode ficar dentro dele mesmo.' });
    expect(await service.saveGroup(group('a', { parentId: 'a' }))).toEqual({ ok: false, error: 'Um grupo não pode ficar dentro dele mesmo.' });
  });

  it('excluir grupo movendo os hosts para o grupo acima', async () => {
    await service.saveGroup(group('clientes'));
    await service.saveGroup(group('acme', { parentId: 'clientes' }));
    await service.saveGroup(group('acme-prod', { parentId: 'acme' }));
    await service.saveHost(host('h1', { groupId: 'acme' }));
    await service.saveHost(host('h2', { groupId: 'acme-prod' }));
    expect(service.groupContents('acme')).toEqual({ hosts: 2, groups: 1 });
    await service.deleteGroup('acme', 'moveUp');
    expect(hosts().hosts.find((h) => h.id === 'h1')!.groupId).toBe('clientes');
    expect(hosts().groups.find((g) => g.id === 'acme-prod')!.parentId).toBe('clientes');
  });

  it('excluir grupo com os hosts remove subgrupos, hosts e saltos para eles', async () => {
    await service.saveGroup(group('acme'));
    await service.saveGroup(group('acme-prod', { parentId: 'acme' }));
    await service.saveHost(host('bastion', { groupId: 'acme-prod' }));
    await service.saveHost(host('fora', { jumpHostId: 'bastion' }));
    await service.deleteGroup('acme', 'deleteHosts');
    expect(hosts()).toMatchObject({ groups: [], hosts: [host('fora')] });
  });
});
