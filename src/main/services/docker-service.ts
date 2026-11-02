import { dockerErrorReason, parseDockerPs, type DockerAction, type DockerListResult } from '@shared/docker';
import type { SaveResult } from '@shared/model';
import type { Env } from '../env/env-utils';
import type { PlatformAdapter } from '../platform/types';
import { runTool } from '../tools/run-tool';

const TIMEOUT_MS = 30_000;

/** Containers via CLI do Docker (`docker ps`, `start`, `stop`, `restart`, `rm`). */
export class DockerService {
  constructor(
    private readonly platform: PlatformAdapter,
    private readonly env: () => Env,
  ) {}

  private run(args: string[]) {
    return runTool(this.platform, 'docker', args, { cwd: process.cwd(), env: this.env(), timeoutMs: TIMEOUT_MS });
  }

  async list(): Promise<DockerListResult> {
    const r = await this.run(['ps', '-a', '--format', '{{json .}}']);
    if (!r.found) return { available: false, reason: 'Docker não encontrado no PATH.' };
    if (r.timedOut) return { available: false, reason: 'O Docker não respondeu a tempo.' };
    if (r.exitCode !== 0) return { available: false, reason: dockerErrorReason(r.stderr) };
    return { available: true, containers: parseDockerPs(r.stdout) };
  }

  async act(id: string, action: DockerAction): Promise<SaveResult> {
    const r = await this.run(action === 'rm' ? ['rm', '-f', id] : [action, id]);
    if (!r.found) return { ok: false, error: 'Docker não encontrado no PATH.' };
    return r.exitCode === 0 ? { ok: true } : { ok: false, error: dockerErrorReason(r.stderr) };
  }
}
