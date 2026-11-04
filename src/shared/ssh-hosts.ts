import { inheritableHostFields, isValidHostAddress, type Host, type HostDefaults, type HostGroup, type InheritableHostField } from './model/hosts';

export const DEFAULT_SSH_PORT = 22;
/** Saltos máximos entre o app e o host final. */
export const MAX_JUMP_DEPTH = 5;

/** De onde veio o valor de um campo: o próprio host, um grupo (id) ou o padrão do app. */
export type FieldOrigin = { kind: 'host' } | { kind: 'group'; groupId: string; groupName: string } | { kind: 'default' };

export interface ResolvedHost {
  id: string;
  name: string;
  address: string;
  port: number;
  username: string | null;
  identityId: string | null;
  keyId: string | null;
  jumpHostId: string | null;
  keepaliveSec: number;
  agentForward: boolean;
  origin: Record<InheritableHostField, FieldOrigin>;
}

/** Grupos do mais próximo ao mais distante (para na primeira repetição, se houver ciclo). */
export function groupChain(groupId: string | null, groups: readonly HostGroup[]): HostGroup[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const chain: HostGroup[] = [];
  const seen = new Set<string>();
  for (let id = groupId; id && !seen.has(id); ) {
    seen.add(id);
    const group = byId.get(id);
    if (!group) break;
    chain.push(group);
    id = group.parentId;
  }
  return chain;
}

/** Valores efetivos do host: cada campo vazio vem do grupo mais próximo que o define. */
export function resolveHost(host: Host, groups: readonly HostGroup[], defaults: { keepaliveSec: number }): ResolvedHost {
  const chain = groupChain(host.groupId, groups);
  const origin = {} as Record<InheritableHostField, FieldOrigin>;
  const values: HostDefaults = {};
  for (const field of inheritableHostFields) {
    if (host[field] !== undefined) {
      (values as Record<string, unknown>)[field] = host[field];
      origin[field] = { kind: 'host' };
      continue;
    }
    const group = chain.find((g) => g.defaults[field] !== undefined);
    if (group) {
      (values as Record<string, unknown>)[field] = group.defaults[field];
      origin[field] = { kind: 'group', groupId: group.id, groupName: group.name };
    } else {
      origin[field] = { kind: 'default' };
    }
  }
  return {
    id: host.id,
    name: host.name,
    address: host.address,
    port: values.port ?? DEFAULT_SSH_PORT,
    username: values.username ?? null,
    identityId: values.identityId ?? null,
    keyId: values.keyId ?? null,
    jumpHostId: values.jumpHostId ?? null,
    keepaliveSec: values.keepaliveSec ?? defaults.keepaliveSec,
    agentForward: values.agentForward ?? false,
    origin,
  };
}

export type JumpChainResult =
  | { ok: true; chain: string[] }
  | { ok: false; reason: 'cycle' | 'too-deep' | 'missing'; hostId: string };

/**
 * Hosts a conectar, do primeiro salto ao host final (H com salto J, e J com salto K: [K, J, H]).
 * O salto pode vir do grupo, como os outros campos.
 */
export function resolveJumpChain(hostId: string, hosts: readonly Host[], groups: readonly HostGroup[]): JumpChainResult {
  const byId = new Map(hosts.map((h) => [h.id, h]));
  const chain: string[] = [];
  const seen = new Set<string>();
  for (let id: string | null = hostId; id; ) {
    if (seen.has(id)) return { ok: false, reason: 'cycle', hostId: id };
    const host = byId.get(id);
    if (!host) return { ok: false, reason: 'missing', hostId: id };
    seen.add(id);
    chain.unshift(id);
    if (chain.length > MAX_JUMP_DEPTH + 1) return { ok: false, reason: 'too-deep', hostId };
    id = resolveHost(host, groups, { keepaliveSec: 0 }).jumpHostId;
  }
  return { ok: true, chain };
}

/** Primeiro host cuja cadeia de saltos tem ciclo ou é longa demais, ou null. */
export function findJumpProblem(hosts: readonly Host[], groups: readonly HostGroup[]): { hostId: string; reason: 'cycle' | 'too-deep' } | null {
  for (const host of hosts) {
    const result = resolveJumpChain(host.id, hosts, groups);
    if (!result.ok && result.reason !== 'missing') return { hostId: host.id, reason: result.reason };
  }
  return null;
}

/** Cópia do host com outro id e " (cópia)" no nome; identidade e chave continuam as mesmas (por referência). */
export function duplicateHost(host: Host, newId: string): Host {
  const suffix = ' (cópia)';
  return { ...host, id: newId, name: host.name.slice(0, 120 - suffix.length) + suffix, tags: [...host.tags] };
}

export interface QuickConnect {
  username: string | null;
  address: string;
  port: number | null;
}

/** Lê `[usuário@]endereço[:porta]`, com IPv6 entre colchetes quando há porta (`[::1]:2222`). */
export function parseQuickConnect(text: string): QuickConnect | null {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  const at = value.lastIndexOf('@');
  const username = at >= 0 ? value.slice(0, at) : null;
  if (username === '') return null;
  const rest = at >= 0 ? value.slice(at + 1) : value;

  let address: string;
  let portText: string | null = null;
  const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(rest);
  if (bracket) {
    address = bracket[1]!;
    portText = bracket[2] ?? null;
  } else if ((rest.match(/:/g) ?? []).length > 1) {
    address = rest; // IPv6 sem colchetes: sem porta
  } else {
    const colon = rest.indexOf(':');
    address = colon >= 0 ? rest.slice(0, colon) : rest;
    portText = colon >= 0 ? rest.slice(colon + 1) : null;
    if (portText === '') return null;
  }
  if (!isValidHostAddress(address)) return null;
  let port: number | null = null;
  if (portText !== null) {
    if (!/^\d{1,5}$/.test(portText)) return null;
    port = Number(portText);
    if (port < 1 || port > 65535) return null;
  }
  return { username, address, port };
}

/** Texto `usuário@endereço:porta` para a barra de status e títulos (IPv6 entre colchetes). */
export function formatTarget(username: string | null, address: string, port: number): string {
  const host = address.includes(':') ? `[${address}]` : address;
  return `${username ? `${username}@` : ''}${host}${port === DEFAULT_SSH_PORT ? '' : `:${port}`}`;
}
