import { describe, expect, it } from 'vitest';
import { fromProcessEnv } from '../env/env-utils';
import { getPlatformAdapter } from '../platform';
import { checkTool } from './check-tool';

describe.runIf(getPlatformAdapter().name === 'win32')('checkTool (máquina real)', () => {
  const env = fromProcessEnv(process.env);
  const platform = getPlatformAdapter();

  it('encontra o node e informa a versão', async () => {
    const status = await checkTool(platform, env, 'node', process.cwd());
    expect(status.found).toBe(true);
    expect(status.version).toMatch(/^v\d+\./);
  });

  it('ferramenta fora do PATH não é encontrada', async () => {
    const status = await checkTool(platform, { ...env, Path: 'C:\nada', PATH: 'C:\nada' }, 'pnpm', process.cwd());
    expect(status.found).toBe(false);
  });

  it('relata o .NET SDK desta máquina (informativo)', async () => {
    const [sdk, ef] = await Promise.all([checkTool(platform, env, 'dotnet', process.cwd()), checkTool(platform, env, 'dotnet-ef', process.cwd())]);
    console.log('dotnet:', JSON.stringify(sdk), 'dotnet-ef:', JSON.stringify(ef));
    expect(typeof sdk.found).toBe('boolean');
  }, 30_000);
});
