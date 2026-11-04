import { randomUUID } from 'node:crypto';
import { duplicateHost, findJumpProblem } from '@shared/ssh-hosts';
import type { ConfigSnapshot, Host, HostGroup, HostsFile, SaveResult } from '@shared/model';

export interface HostsConfig {
  snapshot(): ConfigSnapshot;
  mutateHosts(fn: (file: HostsFile) => HostsFile): Promise<SaveResult>;
}

const JUMP_MESSAGES = {
  cycle: 'Os hosts de salto formam um ciclo.',
  'too-deep': 'A cadeia de hosts de salto passa de 5 saltos.',
} as const;

/** Cadastro de hosts e grupos (hosts.json). */
export class HostService {
  constructor(
    private readonly config: HostsConfig,
    private readonly newId: () => string = randomUUID,
  ) {}

  private file(): HostsFile {
    return this.config.snapshot().hosts;
  }

  private mutate(fn: (file: HostsFile) => HostsFile): Promise<SaveResult> {
    return this.config.mutateHosts((f) => {
      const next = fn(f);
      const problem = findJumpProblem(next.hosts, next.groups);
      if (problem) throw new Error(JUMP_MESSAGES[problem.reason]);
      return next;
    });
  }

  /** Cria (id vazio) ou atualiza um host. */
  async saveHost(host: Host): Promise<SaveResult & { hostId?: string }> {
    const file = this.file();
    if (host.groupId && !file.groups.some((g) => g.id === host.groupId)) return { ok: false, error: 'Grupo não encontrado.' };
    if (host.jumpHostId === host.id) return { ok: false, error: JUMP_MESSAGES.cycle };
    const exists = file.hosts.some((h) => h.id === host.id);
    const saved = await this.mutate((f) => ({ ...f, hosts: exists ? f.hosts.map((h) => (h.id === host.id ? host : h)) : [...f.hosts, host] }));
    return saved.ok ? { ok: true, hostId: host.id } : saved;
  }

  async duplicateHost(hostId: string): Promise<SaveResult & { hostId?: string }> {
    const original = this.file().hosts.find((h) => h.id === hostId);
    if (!original) return { ok: false, error: 'Host não encontrado.' };
    const copy = duplicateHost(original, this.newId());
    const saved = await this.mutate((f) => {
      const index = f.hosts.findIndex((h) => h.id === hostId);
      const hosts = [...f.hosts];
      hosts.splice(index + 1, 0, copy);
      return { ...f, hosts };
    });
    return saved.ok ? { ok: true, hostId: copy.id } : saved;
  }

  /** Exclui o host; hosts e grupos que o usavam como salto deixam de usá-lo. */
  deleteHost(hostId: string): Promise<SaveResult> {
    return this.mutate((f) => {
      if (!f.hosts.some((h) => h.id === hostId)) throw new Error('Host não encontrado.');
      const unjump = <T extends { jumpHostId?: string }>(o: T): T => {
        if (o.jumpHostId !== hostId) return o;
        const { jumpHostId: _drop, ...rest } = o;
        return rest as T;
      };
      return {
        ...f,
        hosts: f.hosts.filter((h) => h.id !== hostId).map(unjump),
        groups: f.groups.map((g) => ({ ...g, defaults: unjump(g.defaults) })),
      };
    });
  }

  /** Quem usa o host como salto (nomes), para avisar antes de excluir. */
  jumpUsers(hostId: string): string[] {
    const file = this.file();
    return [...file.hosts.filter((h) => h.jumpHostId === hostId).map((h) => h.name), ...file.groups.filter((g) => g.defaults.jumpHostId === hostId).map((g) => g.name)];
  }

  async saveGroup(group: HostGroup): Promise<SaveResult & { groupId?: string }> {
    const file = this.file();
    if (group.parentId) {
      if (!file.groups.some((g) => g.id === group.parentId)) return { ok: false, error: 'Grupo pai não encontrado.' };
      // O novo pai não pode ser o próprio grupo nem estar dentro dele.
      if (this.subtree(group.id, file.groups).has(group.parentId)) {
        return { ok: false, error: 'Um grupo não pode ficar dentro dele mesmo.' };
      }
    }
    const exists = file.groups.some((g) => g.id === group.id);
    const saved = await this.mutate((f) => ({ ...f, groups: exists ? f.groups.map((g) => (g.id === group.id ? group : g)) : [...f.groups, group] }));
    return saved.ok ? { ok: true, groupId: group.id } : saved;
  }

  /** Conteúdo de um grupo (incluindo subgrupos), para a pergunta antes de excluir. */
  groupContents(groupId: string): { hosts: number; groups: number } {
    const file = this.file();
    const ids = this.subtree(groupId, file.groups);
    return { hosts: file.hosts.filter((h) => h.groupId && ids.has(h.groupId)).length, groups: ids.size - 1 };
  }

  /**
   * Exclui o grupo. 'moveUp': hosts e subgrupos sobem para o grupo pai.
   * 'deleteHosts': exclui também os subgrupos e todos os hosts dentro deles.
   */
  deleteGroup(groupId: string, contents: 'moveUp' | 'deleteHosts'): Promise<SaveResult> {
    return this.mutate((f) => {
      const group = f.groups.find((g) => g.id === groupId);
      if (!group) throw new Error('Grupo não encontrado.');
      if (contents === 'moveUp') {
        return {
          ...f,
          groups: f.groups.filter((g) => g.id !== groupId).map((g) => (g.parentId === groupId ? { ...g, parentId: group.parentId } : g)),
          hosts: f.hosts.map((h) => (h.groupId === groupId ? { ...h, groupId: group.parentId } : h)),
        };
      }
      const ids = this.subtree(groupId, f.groups);
      const removed = new Set(f.hosts.filter((h) => h.groupId && ids.has(h.groupId)).map((h) => h.id));
      const unjump = <T extends { jumpHostId?: string }>(o: T): T => {
        if (!o.jumpHostId || !removed.has(o.jumpHostId)) return o;
        const { jumpHostId: _drop, ...rest } = o;
        return rest as T;
      };
      return {
        ...f,
        groups: f.groups.filter((g) => !ids.has(g.id)).map((g) => ({ ...g, defaults: unjump(g.defaults) })),
        hosts: f.hosts.filter((h) => !removed.has(h.id)).map(unjump),
      };
    });
  }

  private subtree(groupId: string, groups: readonly HostGroup[]): Set<string> {
    const ids = new Set([groupId]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const g of groups) {
        if (g.parentId && ids.has(g.parentId) && !ids.has(g.id)) {
          ids.add(g.id);
          grew = true;
        }
      }
    }
    return ids;
  }
}
