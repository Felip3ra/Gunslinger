import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigStore } from '../config/config-store';
import { EnvironmentService } from '../env/environment-service';
import type { DetectedShell, PlatformAdapter } from '../platform/types';
import { posixAdapter } from '../platform/posix';
import { ShellService } from './shell-service';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gunslinger-shells-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const cmd: DetectedShell = { id: 'builtin.cmd', name: 'CMD', shellType: 'cmd', executable: 'cmd.exe', args: [], supportsIntegration: true };
const gitbash: DetectedShell = { id: 'builtin.gitbash', name: 'Git Bash', shellType: 'gitbash', executable: 'bash.exe', args: [], supportsIntegration: true };

function fakePlatform(detected: DetectedShell[], executables: string[]): PlatformAdapter {
  return {
    ...posixAdapter,
    detectShells: async () => detected,
    resolveExecutable: async (name) => (executables.includes(name) ? `/bin/${name}` : null),
    fallbackShell: () => cmd,
  };
}

async function setup(detected: DetectedShell[], executables: string[] = []) {
  const config = new ConfigStore(dir);
  await config.load();
  const platform = fakePlatform(detected, executables);
  const service = new ShellService(platform, new EnvironmentService(platform, {}), config);
  return { config, service };
}

describe('ShellService', () => {
  it('guarda a detecção em state.json e a reutiliza na próxima abertura', async () => {
    const first = await setup([cmd, gitbash]);
    await first.service.redetect();
    expect(first.config.getState().detectedProfiles).toHaveLength(2);

    const second = await setup([]); // detecção nova ainda não terminou
    second.service.init();
    expect(second.service.list().map((p) => p.id)).toEqual(['builtin.cmd', 'builtin.gitbash']);
  });

  it('valida o executável ao salvar perfil customizado', async () => {
    const { service, config } = await setup([cmd], ['node.exe']);
    const base = { args: [], cwd: null, color: null, icon: null, shellIntegration: false };
    expect(await service.saveCustom({ id: 'x', name: 'X', executable: 'C:\\nao\\existe.exe', ...base })).toEqual({
      ok: false,
      error: 'Executável não encontrado',
    });
    expect(await service.saveCustom({ id: 'node', name: 'Node REPL', executable: 'node.exe', ...base })).toEqual({ ok: true });
    expect(config.snapshot().settings.profiles.custom.map((c) => c.id)).toEqual(['node']);
    expect(service.get('node')).toMatchObject({ available: true, source: 'custom' });
  });

  it('ocultar perfil detectado persiste em settings.json', async () => {
    const { service } = await setup([cmd, gitbash]);
    await service.redetect();
    await service.setOverride('builtin.gitbash', { hidden: true });
    expect(service.get('builtin.gitbash')?.hidden).toBe(true);
  });
});
