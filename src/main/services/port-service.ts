import type { ListeningPort } from '@shared/ports';
import type { SaveResult } from '@shared/model';
import type { PlatformAdapter } from '../platform/types';
import type { SessionInfo } from '../pty/pty-manager';

/** Portas em escuta, com a aba dona do processo quando ele descende do shell de uma aba. */
export class PortService {
  constructor(
    private readonly platform: PlatformAdapter,
    private readonly sessions: () => SessionInfo[],
  ) {}

  async list(): Promise<ListeningPort[]> {
    const [ports, owners] = await Promise.all([this.platform.listListeningPorts(), this.sessionOwners()]);
    return ports.map((p) => ({ ...p, sessionId: owners.get(p.pid) ?? null }));
  }

  private async sessionOwners(): Promise<Map<number, string>> {
    const owners = new Map<number, string>();
    await Promise.all(
      this.sessions().map(async (s) => {
        owners.set(s.pid, s.id);
        for (const pid of await this.platform.listDescendants(s.pid).catch(() => [] as number[])) owners.set(pid, s.id);
      }),
    );
    return owners;
  }

  async kill(pid: number): Promise<SaveResult> {
    const descendants = await this.platform.listDescendants(pid).catch(() => [] as number[]);
    await this.platform.killTree(pid, descendants);
    const stillThere = (await this.platform.listListeningPorts()).some((p) => p.pid === pid);
    return stillThere ? { ok: false, error: 'O processo não pôde ser encerrado (protegido ou elevado).' } : { ok: true };
  }
}
