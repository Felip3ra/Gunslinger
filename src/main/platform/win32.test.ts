import { describe, expect, it } from 'vitest';
import { fromProcessEnv, getVar } from '../env/env-utils';
import { EnvironmentService } from '../env/environment-service';
import { runTool } from '../tools/run-tool';
import { win32Adapter } from './win32';

const env = fromProcessEnv(process.env);

describe.runIf(process.platform === 'win32')('win32Adapter (integração)', () => {
  it('lê o ambiente do sistema pelo registro', async () => {
    const merged = await win32Adapter.readSystemEnvironment(env);
    expect(getVar(merged, 'Path')?.toLowerCase()).toContain('system32');
    expect(getVar(merged, 'Path')).not.toMatch(/%SystemRoot%/i);
  });

  it('resolve executáveis pelo PATH e PATHEXT', async () => {
    expect((await win32Adapter.resolveExecutable('cmd', env))?.toLowerCase()).toMatch(/cmd\.exe$/);
    expect(await win32Adapter.resolveExecutable('nao-existe-gunslinger', env)).toBeNull();
  });

  it('executa scripts .cmd (npm) via cmd.exe e devolve a saída', async () => {
    const result = await runTool(win32Adapter, 'npm', ['--version'], { cwd: process.cwd(), env });
    expect(result.found).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('recusa argumentos perigosos para scripts .cmd', () => {
    expect(() => win32Adapter.buildSpawn('C:\\x\\code.cmd', ['%PATH%'])).toThrow();
    expect(() => win32Adapter.buildSpawn('C:\\x\\code.cmd', ['a"b'])).toThrow();
    expect(win32Adapter.buildSpawn('C:\\x\\git.exe', ['a"b'])).toEqual({ file: 'C:\\x\\git.exe', args: ['a"b'] });
  });

  it('runTool respeita o timeout', async () => {
    const result = await runTool(win32Adapter, 'ping', ['-n', '10', '127.0.0.1'], {
      cwd: process.cwd(),
      env,
      timeoutMs: 500,
    });
    expect(result.timedOut).toBe(true);
  });

  it('EnvironmentService cria uma nova geração ao recarregar', async () => {
    const service = new EnvironmentService(win32Adapter, env);
    const seen: number[] = [];
    service.onChange((s) => seen.push(s.generation));
    expect(await service.reload()).toEqual({ envGeneration: 1 });
    expect(seen).toEqual([1]);
  });
});

describe('EnvironmentService', () => {
  it('mantém o ambiente anterior quando a leitura falha', async () => {
    const failing = { ...win32Adapter, readSystemEnvironment: () => Promise.reject(new Error('sem acesso')) };
    const service = new EnvironmentService(failing, { A: '1' });
    expect(await service.reload()).toEqual({ error: 'sem acesso' });
    expect(service.current()).toEqual({ env: { A: '1' }, generation: 0 });
  });
});

describe.runIf(process.platform === 'win32')('detecção de shells (máquina real)', () => {
  it('encontra pelo menos CMD e Windows PowerShell', async () => {
    const shells = await win32Adapter.detectShells(env);
    const ids = shells.map((s) => s.id);
    expect(ids).toContain('builtin.cmd');
    expect(ids).toContain('builtin.powershell');
    // Informativo: o que esta máquina tem.
    console.log(shells.map((s) => `${s.id} → ${s.executable} ${s.args.join(' ')}`).join('\n'));
  });
});
