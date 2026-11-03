import { describe, expect, it } from 'vitest';
import { posixAdapter } from '../platform/posix';
import type { Env } from './env-utils';
import { EnvironmentService } from './environment-service';

function service(next: () => Env) {
  const svc = new EnvironmentService({ ...posixAdapter, readSystemEnvironment: async () => next() }, { PATH: 'a' });
  const generations: number[] = [];
  svc.onChange((s) => generations.push(s.generation));
  return { svc, generations };
}

describe('EnvironmentService.reloadIfChanged', () => {
  it('não cria geração nova quando o ambiente é o mesmo', async () => {
    const { svc, generations } = service(() => ({ PATH: 'a' }));
    expect(await svc.reloadIfChanged()).toBe(false);
    expect(svc.current().generation).toBe(0);
    expect(generations).toEqual([]);
  });

  it('cria geração nova quando uma variável mudou ou surgiu', async () => {
    let env: Env = { PATH: 'a;b' };
    const { svc, generations } = service(() => env);
    expect(await svc.reloadIfChanged()).toBe(true);
    env = { PATH: 'a;b', JAVA_HOME: 'C:\\jdk' };
    expect(await svc.reloadIfChanged()).toBe(true);
    expect(generations).toEqual([1, 2]);
    expect(svc.current().env).toEqual(env);
  });

  it('falha na leitura mantém o ambiente', async () => {
    const { svc } = service(() => {
      throw new Error('reg falhou');
    });
    expect(await svc.reloadIfChanged()).toBe(false);
    expect(svc.current().env).toEqual({ PATH: 'a' });
  });
});
