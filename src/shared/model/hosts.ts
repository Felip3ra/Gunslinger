import { z } from 'zod';
import { hexColor } from './profiles';

const HOSTNAME_LABEL = /^[A-Za-z0-9_](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9_])?$/;

function isIPv4(value: string): boolean {
  const parts = value.split('.');
  return parts.length === 4 && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255 && (p === '0' || !p.startsWith('0')));
}

function isIPv6(value: string): boolean {
  if (value.includes('%')) value = value.slice(0, value.indexOf('%')); // zona (fe80::1%eth0)
  let groups = value.split(':');
  // Último grupo pode ser um IPv4 embutido (::ffff:10.0.0.1), que conta como dois grupos.
  let extra = 0;
  const last = groups[groups.length - 1]!;
  if (last.includes('.')) {
    if (!isIPv4(last)) return false;
    groups = groups.slice(0, -1);
    extra = 2;
  }
  const doubleColon = value.indexOf('::');
  if (doubleColon !== value.lastIndexOf('::')) return false;
  const filled = groups.filter((g) => g !== '');
  if (!filled.every((g) => /^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
  const count = filled.length + extra;
  return doubleColon >= 0 ? count < 8 : count === 8 && groups.every((g) => g !== '');
}

/** Nome DNS, IPv4 ou IPv6 (sem colchetes). */
export function isValidHostAddress(value: string): boolean {
  if (value.length === 0 || value.length > 253) return false;
  if (value.includes(':')) return isIPv6(value);
  if (/^[\d.]+$/.test(value)) return isIPv4(value);
  return value.replace(/\.$/, '').split('.').every((label) => HOSTNAME_LABEL.test(label));
}

export const hostAddressSchema = z
  .string()
  .trim()
  .refine(isValidHostAddress, 'endereço inválido (use um nome DNS, IPv4 ou IPv6)');
export const portSchema = z.number().int().min(1, 'porta fora de 1–65535').max(65535, 'porta fora de 1–65535');
export const keepaliveSchema = z.number().int().min(0).max(3600);

/** Campos que um host pode deixar vazios para herdar do grupo (e um grupo pode definir). */
export const hostDefaultsSchema = z.object({
  port: portSchema.optional(),
  username: z.string().trim().min(1).max(256).optional(),
  identityId: z.string().min(1).optional(),
  keyId: z.string().min(1).optional(),
  jumpHostId: z.string().min(1).optional(),
  keepaliveSec: keepaliveSchema.optional(),
  agentForward: z.boolean().optional(),
});
export type HostDefaults = z.infer<typeof hostDefaultsSchema>;
export const inheritableHostFields = ['port', 'username', 'identityId', 'keyId', 'jumpHostId', 'keepaliveSec', 'agentForward'] as const;
export type InheritableHostField = (typeof inheritableHostFields)[number];

export const hostGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  parentId: z.string().min(1).nullable(),
  defaults: hostDefaultsSchema,
});
export type HostGroup = z.infer<typeof hostGroupSchema>;

export const hostSchema = hostDefaultsSchema.extend({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  address: hostAddressSchema,
  groupId: z.string().min(1).nullable(),
  color: hexColor.nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
});
export type Host = z.infer<typeof hostSchema>;

export const hostsFileSchema = z.object({
  version: z.literal(1),
  groups: z.array(hostGroupSchema),
  hosts: z.array(hostSchema),
});
export type HostsFile = z.infer<typeof hostsFileSchema>;
export const defaultHostsFile: HostsFile = { version: 1, groups: [], hosts: [] };

/** Configurações gerais de SSH (settings.json, seção `ssh`). */
export const sshSettingsSchema = z.object({
  /** Agente usado para tentar chaves antes de pedir senha. */
  agent: z.enum(['off', 'openssh', 'pageant']),
  /** Intervalo padrão de keepalive (0 desliga); hosts e grupos podem sobrescrever. */
  keepaliveSec: keepaliveSchema,
  connectTimeoutSec: z.number().int().min(5).max(120),
});
export type SshSettings = z.infer<typeof sshSettingsSchema>;
export const defaultSshSettings: SshSettings = { agent: 'openssh', keepaliveSec: 30, connectTimeoutSec: 20 };
