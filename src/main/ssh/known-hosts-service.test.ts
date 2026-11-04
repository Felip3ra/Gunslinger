import { describe, expect, it } from 'vitest';
import { defaultKnownHostsFile, type KnownHostsFile } from '@shared/model';
import { hmacSha1, KnownHostsService } from './known-hosts-service';

const KEY_A = 'AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';
const KEY_B = 'AAAAC3NzaC1lZDI1NTE5AAAAIBBBBnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl';

function service(): KnownHostsService {
  let file: KnownHostsFile = structuredClone(defaultKnownHostsFile);
  return new KnownHostsService(
    {
      knownHostsFile: () => structuredClone(file),
      mutateKnownHosts: async (fn) => {
        file = fn(structuredClone(file));
        return { ok: true };
      },
    },
    () => 1000,
  );
}

const target = { host: '10.0.0.12', port: 22, keyType: 'ssh-ed25519', key: KEY_A };

describe('KnownHostsService', () => {
  it('host novo: desconhecido até aceitar, depois conhecido', async () => {
    const s = service();
    expect(s.check(target).status).toBe('unknown');
    await s.accept(target);
    expect(s.check(target).status).toBe('known');
    expect(s.list()).toEqual([{ host: '10.0.0.12', port: 22, keyType: 'ssh-ed25519', fingerprint: expect.stringMatching(/^SHA256:/), addedAt: 1000, revoked: false, hashed: false }]);
  });

  it('chave alterada só passa depois de substituir', async () => {
    const s = service();
    await s.accept(target);
    const changed = { ...target, key: KEY_B };
    expect(s.check(changed).status).toBe('changed');
    await s.replace(changed);
    expect(s.check(changed).status).toBe('known');
    expect(s.check(target).status).toBe('changed');
    expect(s.list()).toHaveLength(1);
  });

  it('chave revogada bloqueia e não pode ser substituída', async () => {
    const s = service();
    await s.importOpenSsh(`@revoked 10.0.0.12 ssh-ed25519 ${KEY_A}`);
    expect(s.check(target).status).toBe('revoked');
    expect(await s.replace(target)).toEqual({ ok: false, error: 'Esta chave do servidor foi revogada.' });
  });

  it('importa do OpenSSH sem duplicar e usa entradas em hash', async () => {
    const s = service();
    const salt = Buffer.from('0123456789abcdefghij').toString('base64');
    const text = `github.com ssh-ed25519 ${KEY_A}\n|1|${salt}|${hmacSha1(salt, '10.0.0.12')} ssh-ed25519 ${KEY_A}\n*.x ssh-ed25519 ${KEY_A}`;
    const first = await s.importOpenSsh(text);
    expect(first).toMatchObject({ ok: true, added: 2, ignored: [{ line: 3 }] });
    expect(await s.importOpenSsh(text)).toMatchObject({ added: 0 });
    expect(s.check(target).status).toBe('known');
    expect(s.check({ ...target, host: 'github.com' }).status).toBe('known');
    expect(s.list()[1]).toMatchObject({ host: 'nome oculto', hashed: true });
  });

  it('exclui pela posição', async () => {
    const s = service();
    await s.accept(target);
    await s.delete(0);
    expect(s.list()).toEqual([]);
  });
});
