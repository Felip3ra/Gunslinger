import { isValidHostAddress, type Host, type HostDefaults, type HostGroup } from './model/hosts';
import type { SshKeyType } from './model/keychain';
import { parseQuickConnect } from './ssh-hosts';
import { EXPORT_FORMAT, type ExportedKey, type ExportFile } from './transfer';

/** Host lido do `~/.ssh/config` (por alias). */
export interface ImportedSshHost {
  alias: string;
  hostName: string;
  user?: string;
  port?: number;
  identityFile?: string;
  /** Alias do host de salto (pode ser um host criado a partir do próprio ProxyJump). */
  jump?: string;
  keepaliveSec?: number;
  agentForward?: boolean;
}

export type ImportedSshDefaults = Omit<ImportedSshHost, 'alias' | 'hostName' | 'jump'>;

export interface IgnoredSshLine {
  line: number;
  text: string;
  reason: string;
}

export interface SshConfigImport {
  hosts: ImportedSshHost[];
  /** Valores de `Host *` e das linhas antes do primeiro `Host`: viram padrões do grupo de importação. */
  defaults: ImportedSshDefaults;
  ignored: IgnoredSshLine[];
}

export interface SshConfigContext {
  /** Pasta do usuário (expande `~` e `%d`). */
  home: string;
  /** Usuário local (expande `%u`). */
  localUser: string;
}

const SUPPORTED = new Set(['host', 'hostname', 'user', 'port', 'identityfile', 'proxyjump', 'serveraliveinterval', 'forwardagent']);

interface Block {
  patterns: string[];
  line: number;
  values: Map<string, { value: string; line: number }>;
}

/** Separa `Chave valor`, `Chave=valor` e `Chave = "valor com espaço"`. */
function splitDirective(raw: string): [string, string] | null {
  // `raw` já vem sem espaços nas pontas.
  const m = /^([A-Za-z]+)(?:[ \t]*=[ \t]*|[ \t]+)(.*)$/.exec(raw);
  if (!m) return null;
  let value = m[2]!.trim();
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) value = value.slice(1, -1);
  return [m[1]!.toLowerCase(), value];
}

function hasWildcard(pattern: string): boolean {
  return /[*?!]/.test(pattern);
}

function expandPath(value: string, ctx: SshConfigContext, hostName: string, user: string | undefined, ignored: IgnoredSshLine[], line: number): string {
  let out = value.replace(/^~(?=[\\/]|$)/, ctx.home);
  out = out.replace(/%([%dDuhr])/g, (token, ch: string) => {
    switch (ch) {
      case '%':
        return '%';
      case 'd':
        return ctx.home;
      case 'u':
        return ctx.localUser;
      case 'h':
        return hostName;
      case 'r':
        return user ?? ctx.localUser;
      default:
        return token;
    }
  });
  if (/%[^%]/.test(out)) ignored.push({ line, text: value, reason: 'token não suportado no caminho da chave' });
  return out;
}

function toValues(block: Block, ctx: SshConfigContext, hostName: string, ignored: IgnoredSshLine[]): ImportedSshDefaults & { jump?: string } {
  const out: ImportedSshDefaults & { jump?: string } = {};
  const user = block.values.get('user');
  if (user) out.user = user.value;
  const port = block.values.get('port');
  if (port) {
    const n = Number(port.value);
    if (Number.isInteger(n) && n >= 1 && n <= 65535) out.port = n;
    else ignored.push({ line: port.line, text: `Port ${port.value}`, reason: 'porta inválida' });
  }
  const identity = block.values.get('identityfile');
  if (identity) out.identityFile = expandPath(identity.value, ctx, hostName, out.user, ignored, identity.line);
  const alive = block.values.get('serveraliveinterval');
  if (alive) {
    const n = Number(alive.value);
    if (Number.isInteger(n) && n >= 0 && n <= 3600) out.keepaliveSec = n;
    else ignored.push({ line: alive.line, text: `ServerAliveInterval ${alive.value}`, reason: 'valor inválido' });
  }
  const forward = block.values.get('forwardagent');
  if (forward) out.agentForward = /^yes$/i.test(forward.value);
  const jump = block.values.get('proxyjump');
  if (jump && !/^none$/i.test(jump.value)) out.jump = jump.value;
  return out;
}

/**
 * Lê as diretivas suportadas do `~/.ssh/config`. Cada nome concreto de `Host` vira um host;
 * `Host *` (e o que vem antes do primeiro `Host`) vira padrão; o resto é listado como ignorado.
 * Diferente do OpenSSH, os valores do próprio host sempre vencem os de `Host *`.
 */
export function parseSshConfig(text: string, ctx: SshConfigContext): SshConfigImport {
  const ignored: IgnoredSshLine[] = [];
  const blocks: Block[] = [{ patterns: ['*'], line: 0, values: new Map() }];
  let skipping = false;

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const content = rawLine.replace(/(^|\s)#.*$/, '').trim();
    if (!content) return;
    const parsed = splitDirective(content);
    if (!parsed) {
      ignored.push({ line, text: content, reason: 'linha não reconhecida' });
      return;
    }
    const [key, value] = parsed;
    if (key === 'match') {
      skipping = true;
      ignored.push({ line, text: content, reason: 'Match não é suportado (o bloco inteiro foi ignorado)' });
      return;
    }
    if (key === 'host') {
      skipping = false;
      blocks.push({ patterns: value.split(/\s+/).filter(Boolean), line, values: new Map() });
      return;
    }
    if (skipping) return;
    if (key === 'include') {
      ignored.push({ line, text: content, reason: 'Include não é suportado' });
      return;
    }
    if (!SUPPORTED.has(key)) {
      ignored.push({ line, text: content, reason: 'diretiva não suportada' });
      return;
    }
    const block = blocks[blocks.length - 1]!;
    // Como no OpenSSH, o primeiro valor de cada diretiva vale.
    if (!block.values.has(key)) block.values.set(key, { value, line });
  });

  const defaults: ImportedSshDefaults = {};
  const hosts = new Map<string, ImportedSshHost>();
  for (const block of blocks) {
    const concrete = block.patterns.filter((p) => !hasWildcard(p));
    const wildcards = block.patterns.filter(hasWildcard);
    if (wildcards.includes('*') && concrete.length === 0) {
      const { jump, ...values } = toValues(block, ctx, '%h', ignored);
      if (jump) ignored.push({ line: block.values.get('proxyjump')!.line, text: `ProxyJump ${jump}`, reason: 'ProxyJump em Host * não é importado' });
      for (const [k, v] of Object.entries(values)) if (!(k in defaults)) (defaults as Record<string, unknown>)[k] = v;
      continue;
    }
    for (const w of wildcards) ignored.push({ line: block.line, text: `Host ${w}`, reason: 'padrões com curinga não viram hosts' });
    for (const alias of concrete) {
      if (hosts.has(alias)) continue; // o primeiro bloco do alias vale
      const hostName = block.values.get('hostname')?.value ?? alias;
      if (!isValidHostAddress(hostName)) {
        ignored.push({ line: block.line, text: `Host ${alias}`, reason: `endereço inválido: ${hostName}` });
        continue;
      }
      hosts.set(alias, { alias, hostName, ...toValues(block, ctx, hostName, ignored) });
    }
  }

  linkJumps(hosts, ignored, blocks);
  return { hosts: [...hosts.values()], defaults, ignored };
}

/** Converte `ProxyJump a,b` em cadeia: o host usa b, e b usa a (hosts criados quando não são aliases). */
function linkJumps(hosts: Map<string, ImportedSshHost>, ignored: IgnoredSshLine[], blocks: Block[]): void {
  const lineOf = (alias: string): number => blocks.find((b) => b.patterns.includes(alias))?.values.get('proxyjump')?.line ?? 0;
  for (const host of [...hosts.values()]) {
    if (!host.jump) continue;
    const hops = host.jump.split(',').map((h) => h.trim()).filter(Boolean);
    const aliases: string[] = [];
    let failed = false;
    for (const hop of hops) {
      if (hosts.has(hop)) {
        aliases.push(hop);
        continue;
      }
      const spec = parseQuickConnect(hop.replace(/^ssh:\/\//, ''));
      if (!spec) {
        ignored.push({ line: lineOf(host.alias), text: `ProxyJump ${host.jump}`, reason: `salto inválido: ${hop}` });
        failed = true;
        break;
      }
      hosts.set(hop, { alias: hop, hostName: spec.address, ...(spec.username ? { user: spec.username } : {}), ...(spec.port ? { port: spec.port } : {}) });
      aliases.push(hop);
    }
    if (failed) {
      delete host.jump;
      continue;
    }
    host.jump = aliases[aliases.length - 1];
    for (let i = aliases.length - 1; i > 0; i--) {
      const hop = hosts.get(aliases[i]!)!;
      if (!hop.jump) hop.jump = aliases[i - 1];
    }
  }
}


/** Metadados de uma chave do `IdentityFile` (lidos do `.pub`, ou da privada se ela não tiver frase-senha). */
export interface OpenSshKeyInfo {
  type: SshKeyType;
  publicKey: string;
  fingerprint: string;
  comment: string;
  encrypted: boolean;
}

export const OPENSSH_GROUP_NAME = 'Importados do OpenSSH';

const baseName = (path: string): string => path.split(/[\\/]/).pop() || path;

/**
 * Converte o `~/.ssh/config` lido num arquivo de importação: um grupo "Importados do OpenSSH" com os
 * padrões de `Host *`, um host por alias e as chaves de `IdentityFile` como referência ao arquivo.
 * `keys` traz os metadados de cada caminho de chave (null quando não foi possível ler).
 */
export function openSshToImport(
  parsed: SshConfigImport,
  keys: ReadonlyMap<string, OpenSshKeyInfo | null>,
  newId: () => string,
  now = new Date(),
): { file: ExportFile; warnings: string[] } {
  const warnings = parsed.ignored.map((i) => `Linha ${i.line}: ${i.text} (${i.reason})`);
  const sshKeys: ExportedKey[] = [];
  const keyIds = new Map<string, string>();
  const keyFor = (path: string | undefined): string | undefined => {
    if (!path) return undefined;
    if (keyIds.has(path)) return keyIds.get(path);
    const info = keys.get(path);
    if (!info) {
      warnings.push(`Chave ${path} não importada: não há ${baseName(path)}.pub e a chave não pôde ser lida (frase-senha ou arquivo inexistente).`);
      keyIds.set(path, '');
      return undefined;
    }
    const id = newId();
    keyIds.set(path, id);
    sshKeys.push({ id, name: baseName(path), ...info, filePath: path });
    return id;
  };
  const toDefaults = (v: ImportedSshDefaults): HostDefaults => {
    const out: HostDefaults = {};
    if (v.user) out.username = v.user;
    if (v.port) out.port = v.port;
    if (v.keepaliveSec !== undefined) out.keepaliveSec = v.keepaliveSec;
    if (v.agentForward !== undefined) out.agentForward = v.agentForward;
    const keyId = keyFor(v.identityFile);
    if (keyId) out.keyId = keyId;
    return out;
  };

  const group: HostGroup = { id: newId(), name: OPENSSH_GROUP_NAME, parentId: null, defaults: toDefaults(parsed.defaults) };
  const hostIds = new Map(parsed.hosts.map((h) => [h.alias, newId()]));
  const hosts: Host[] = parsed.hosts.map((h) => {
    const jumpHostId = h.jump ? hostIds.get(h.jump) : undefined;
    return {
      id: hostIds.get(h.alias)!,
      name: h.alias,
      address: h.hostName,
      groupId: group.id,
      color: null,
      tags: [],
      ...toDefaults(h),
      ...(jumpHostId ? { jumpHostId } : {}),
    };
  });
  return {
    file: {
      format: EXPORT_FORMAT,
      version: 1,
      exportedAt: now.toISOString(),
      commands: [],
      profiles: [],
      projects: [],
      hostGroups: hosts.length > 0 ? [group] : [],
      hosts,
      identities: [],
      sshKeys,
    },
    warnings,
  };
}