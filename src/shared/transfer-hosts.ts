import type { Host, HostDefaults, HostGroup, HostsFile, Identity, KeychainFile, SshKey } from './model';
import { findJumpProblem, groupChain, resolveHost } from './ssh-hosts';
import type { ConflictAction, ConflictDecision, ExportedIdentity, ExportedKey, ExportFile, ImportItem, ImportResult } from './transfer';

/** Hosts e keychain (metadados) para exportar e importar. Segredos nunca entram aqui. */
export interface HostsData {
  hosts: HostsFile;
  keychain: KeychainFile;
}

export type HostsExport = Pick<ExportFile, 'hostGroups' | 'hosts' | 'identities' | 'sshKeys'>;

const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

function uniqueName(name: string, taken: string[]): string {
  let n = 2;
  let candidate = `${name} (${n})`;
  while (taken.some((t) => sameName(t, candidate))) candidate = `${name} (${++n})`;
  return candidate;
}

/**
 * Hosts escolhidos e o que eles precisam: hosts de salto, grupos (até a raiz), identidades sem senha
 * e chaves que apontam para arquivo (só metadados). Chaves guardadas no keychain não são exportadas.
 */
export function exportHosts(data: HostsData, hostIds: readonly string[]): HostsExport {
  const { hosts, groups } = data.hosts;
  const byId = new Map(hosts.map((h) => [h.id, h]));
  const included = new Set(hostIds.filter((id) => byId.has(id)));
  for (const id of [...included]) {
    // Inclui a cadeia de saltos (o salto pode vir do grupo).
    for (let jump = resolveHost(byId.get(id)!, groups, { keepaliveSec: 0 }).jumpHostId; jump && byId.has(jump) && !included.has(jump); ) {
      included.add(jump);
      jump = resolveHost(byId.get(jump)!, groups, { keepaliveSec: 0 }).jumpHostId;
    }
  }
  const exportedHosts = hosts.filter((h) => included.has(h.id));
  const groupIds = new Set(exportedHosts.flatMap((h) => groupChain(h.groupId, groups).map((g) => g.id)));
  const exportedGroups = groups.filter((g) => groupIds.has(g.id));

  const identityIds = new Set<string>();
  const keyIds = new Set<string>();
  for (const d of [...exportedHosts, ...exportedGroups.map((g) => g.defaults)]) {
    if (d.identityId) identityIds.add(d.identityId);
    if (d.keyId) keyIds.add(d.keyId);
  }
  const identities: ExportedIdentity[] = data.keychain.identities
    .filter((i) => identityIds.has(i.id))
    .map((i) => {
      if (i.keyId) keyIds.add(i.keyId);
      return { id: i.id, name: i.name, username: i.username, ...(i.keyId ? { keyId: i.keyId } : {}) };
    });
  const sshKeys: ExportedKey[] = data.keychain.keys
    .filter((k) => keyIds.has(k.id) && k.source === 'file' && k.filePath)
    .map((k) => ({ id: k.id, name: k.name, type: k.type, fingerprint: k.fingerprint, publicKey: k.publicKey, comment: k.comment, filePath: k.filePath!, encrypted: k.encrypted }));
  return { hostGroups: exportedGroups, hosts: exportedHosts, identities, sshKeys };
}

function hostConflict(existing: readonly Host[], h: Host): Host | undefined {
  return existing.find((e) => e.id === h.id) ?? existing.find((e) => sameName(e.name, h.name));
}
function identityConflict(existing: readonly Identity[], i: ExportedIdentity): Identity | undefined {
  return existing.find((e) => e.id === i.id) ?? existing.find((e) => sameName(e.name, i.name));
}
function keyConflict(existing: readonly SshKey[], k: ExportedKey): SshKey | undefined {
  return existing.find((e) => e.fingerprint === k.fingerprint);
}

/** Itens da prévia para hosts, identidades e chaves. */
export function previewHostItems(data: HostsData, file: ExportFile): ImportItem[] {
  const items: ImportItem[] = [];
  const fileKeyIds = new Set(file.sshKeys.map((k) => k.id));
  const localKeyIds = new Set(data.keychain.keys.map((k) => k.id));
  const knownHostIds = new Set([...file.hosts.map((h) => h.id), ...data.hosts.hosts.map((h) => h.id)]);
  for (const k of file.sshKeys) {
    items.push({
      key: `key:${k.id}`,
      kind: 'key',
      name: k.name,
      detail: k.fingerprint,
      conflictWith: keyConflict(data.keychain.keys, k)?.name ?? null,
      notes: [`A chave é lida de ${k.filePath}; o arquivo precisa existir nesta máquina.`],
    });
  }
  for (const i of file.identities) {
    items.push({
      key: `identity:${i.id}`,
      kind: 'identity',
      name: i.name,
      detail: i.username,
      conflictWith: identityConflict(data.keychain.identities, i)?.name ?? null,
      notes: ['Senhas não são exportadas: será pedida ao conectar.'],
    });
  }
  for (const h of file.hosts) {
    const notes: string[] = [];
    if (h.keyId && !fileKeyIds.has(h.keyId) && !localKeyIds.has(h.keyId)) notes.push('A chave privada não vai no arquivo: o host fica sem chave até você importá-la.');
    if (h.jumpHostId && !knownHostIds.has(h.jumpHostId)) notes.push('O host de salto não está no arquivo: o host fica sem salto.');
    items.push({
      key: `host:${h.id}`,
      kind: 'host',
      name: h.name,
      detail: `${h.username ? `${h.username}@` : ''}${h.address}${h.port ? `:${h.port}` : ''}`,
      conflictWith: hostConflict(data.hosts.hosts, h)?.name ?? null,
      notes,
    });
  }
  return items;
}

/** Grupos do arquivo em ordem: pais antes dos filhos. */
function parentsFirst(groups: readonly HostGroup[]): HostGroup[] {
  const ids = new Set(groups.map((g) => g.id));
  const done = new Set<string>();
  const out: HostGroup[] = [];
  let progress = true;
  while (out.length < groups.length && progress) {
    progress = false;
    for (const g of groups) {
      if (done.has(g.id)) continue;
      if (g.parentId && ids.has(g.parentId) && !done.has(g.parentId)) continue;
      done.add(g.id);
      out.push(g);
      progress = true;
    }
  }
  // Ciclo no arquivo: o que sobrou entra na raiz.
  for (const g of groups) if (!done.has(g.id)) out.push({ ...g, parentId: null });
  return out;
}

export function applyHostImport(
  data: HostsData,
  file: ExportFile,
  decisions: readonly ConflictDecision[],
  newId: () => string,
): { hosts: HostsFile; keychain: KeychainFile; result: ImportResult } {
  const decisionOf = (key: string): ConflictAction => decisions.find((d) => d.key === key)?.action ?? 'keepBoth';
  const result: ImportResult = { added: 0, replaced: 0, skipped: 0 };
  const keys = [...data.keychain.keys];
  const identities = [...data.keychain.identities];
  const groups = [...data.hosts.groups];
  const hosts = [...data.hosts.hosts];
  const freeId = (id: string, taken: { id: string }[]): string => (taken.some((t) => t.id === id) ? newId() : id);

  // Chaves: a mesma chave (fingerprint) é reaproveitada; as outras entram como referência ao arquivo.
  const keyIds = new Map<string, string>();
  for (const k of file.sshKeys) {
    const existing = keyConflict(keys, k);
    if (existing) {
      keyIds.set(k.id, existing.id);
      result.skipped++;
      continue;
    }
    const id = freeId(k.id, keys);
    keys.push({ ...k, id, source: 'file', createdAt: Date.now() });
    keyIds.set(k.id, id);
    result.added++;
  }
  const mapKey = (id: string | undefined): string | undefined => (id ? (keyIds.get(id) ?? (data.keychain.keys.some((k) => k.id === id) ? id : undefined)) : undefined);

  const identityIds = new Map<string, string>();
  for (const i of file.identities) {
    const conflict = identityConflict(identities, i);
    const action = conflict ? decisionOf(`identity:${i.id}`) : 'keepBoth';
    const keyId = mapKey(i.keyId);
    if (conflict && action === 'skip') {
      identityIds.set(i.id, conflict.id);
      result.skipped++;
    } else if (conflict && action === 'replace') {
      // Mantém a senha salva da identidade existente.
      const { keyId: _old, ...rest } = conflict;
      identities[identities.indexOf(conflict)] = { ...rest, name: i.name, username: i.username, ...(keyId ? { keyId } : {}) };
      identityIds.set(i.id, conflict.id);
      result.replaced++;
    } else {
      const id = freeId(i.id, identities);
      identities.push({ id, name: conflict ? uniqueName(i.name, identities.map((e) => e.name)) : i.name, username: i.username, ...(keyId ? { keyId } : {}) });
      identityIds.set(i.id, id);
      result.added++;
    }
  }
  const mapIdentity = (id: string | undefined): string | undefined =>
    id ? (identityIds.get(id) ?? (data.keychain.identities.some((i) => i.id === id) ? id : undefined)) : undefined;

  // Hosts: decide os ids antes, para os saltos poderem apontar para hosts importados.
  const hostIds = new Map<string, string>();
  const plans: { host: Host; action: 'replace' | 'add'; targetId: string; name: string }[] = [];
  for (const h of file.hosts) {
    const conflict = hostConflict(hosts, h);
    const action = conflict ? decisionOf(`host:${h.id}`) : 'keepBoth';
    if (conflict && action === 'skip') {
      hostIds.set(h.id, conflict.id);
      result.skipped++;
    } else if (conflict && action === 'replace') {
      hostIds.set(h.id, conflict.id);
      plans.push({ host: h, action: 'replace', targetId: conflict.id, name: h.name });
    } else {
      const id = freeId(h.id, [...hosts, ...plans.map((p) => ({ id: p.targetId }))]);
      hostIds.set(h.id, id);
      plans.push({ host: h, action: 'add', targetId: id, name: conflict ? uniqueName(h.name, hosts.map((e) => e.name)) : h.name });
    }
  }
  const mapHost = (id: string | undefined): string | undefined => (id ? (hostIds.get(id) ?? (data.hosts.hosts.some((h) => h.id === id) ? id : undefined)) : undefined);
  const mapDefaults = (d: HostDefaults): HostDefaults => {
    const { identityId, keyId, jumpHostId, ...rest } = d;
    const out: HostDefaults = { ...rest };
    const i = mapIdentity(identityId);
    const k = mapKey(keyId);
    const j = mapHost(jumpHostId);
    if (i) out.identityId = i;
    if (k) out.keyId = k;
    if (j) out.jumpHostId = j;
    return out;
  };

  // Grupos: mesmo id ou mesmo nome sob o mesmo pai são o mesmo grupo.
  const groupIds = new Map<string, string>();
  for (const g of parentsFirst(file.hostGroups)) {
    const parentId = g.parentId ? (groupIds.get(g.parentId) ?? null) : null;
    const existing = groups.find((e) => e.id === g.id) ?? groups.find((e) => sameName(e.name, g.name) && e.parentId === parentId);
    if (existing) {
      groupIds.set(g.id, existing.id);
      continue;
    }
    const id = freeId(g.id, groups);
    groups.push({ id, name: g.name, parentId, defaults: mapDefaults(g.defaults) });
    groupIds.set(g.id, id);
  }

  for (const plan of plans) {
    const { identityId, keyId, jumpHostId, groupId, ...rest } = plan.host;
    const mapped: Host = { ...rest, ...mapDefaults({ identityId, keyId, jumpHostId }), id: plan.targetId, name: plan.name, groupId: groupId ? (groupIds.get(groupId) ?? null) : null };
    if (plan.action === 'replace') {
      hosts[hosts.findIndex((h) => h.id === plan.targetId)] = mapped;
      result.replaced++;
    } else {
      hosts.push(mapped);
      result.added++;
    }
  }

  // Saltos que formam ciclo depois da importação são retirados.
  for (let problem = findJumpProblem(hosts, groups); problem; problem = findJumpProblem(hosts, groups)) {
    const index = hosts.findIndex((h) => h.id === problem!.hostId);
    const { jumpHostId: _drop, ...rest } = hosts[index]!;
    if (_drop === undefined) break;
    hosts[index] = rest;
  }

  return {
    hosts: { ...data.hosts, groups, hosts },
    keychain: { ...data.keychain, keys, identities },
    result,
  };
}
