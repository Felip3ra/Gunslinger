import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SecretPort } from '../ports';
import { SecretStore } from './secret-store';

/** Cofre falso: "cifra" invertendo e marcando com a conta; outra conta não decifra. */
function fakePort(account = 'ana', available = true): SecretPort {
  return {
    isAvailable: () => available,
    encrypt: (plain) => Buffer.from(`${account}:${[...plain].reverse().join('')}`).toString('base64'),
    decrypt: (cipher) => {
      const text = Buffer.from(cipher, 'base64').toString();
      if (!text.startsWith(`${account}:`)) throw new Error('outra conta');
      return [...text.slice(account.length + 1)].reverse().join('');
    },
  };
}

let dir: string;
beforeEach(async () => (dir = await mkdtemp(join(tmpdir(), 'gs-secrets-'))));
afterEach(async () => rm(dir, { recursive: true, force: true }));

describe('SecretStore', () => {
  it('grava cifrado e lê de volta depois de recarregar', async () => {
    const store = new SecretStore(dir, fakePort());
    await store.load();
    const id = await store.add('s3nh4');
    expect(await readFile(store.path, 'utf8')).not.toContain('s3nh4');
    const again = new SecretStore(dir, fakePort());
    await again.load();
    expect(again.get(id)).toBe('s3nh4');
    expect(again.state(id)).toBe('saved');
    expect(again.state(undefined)).toBe('none');
  });

  it('recusa gravar com o cofre indisponível e explica o motivo', async () => {
    const store = new SecretStore(dir, fakePort('ana', false));
    await store.load();
    expect(store.canStore()).toBe(false);
    await expect(store.add('x')).rejects.toThrow('cofre do sistema não está disponível');
  });

  it('marca como indisponível o que outra conta cifrou', async () => {
    const mine = new SecretStore(dir, fakePort('ana'));
    await mine.load();
    const id = await mine.add('segredo');
    const other = new SecretStore(dir, fakePort('bruno'));
    await other.load();
    expect(other.state(id)).toBe('unavailable');
    expect(other.get(id)).toBeNull();
  });

  it('não sobrescreve um arquivo ilegível', async () => {
    await writeFile(join(dir, 'secrets.json'), '{ quebrado');
    const store = new SecretStore(dir, fakePort());
    await store.load();
    expect(store.canStore()).toBe(false);
    await expect(store.add('x')).rejects.toThrow('ilegível');
    expect(await readFile(join(dir, 'secrets.json'), 'utf8')).toBe('{ quebrado');
  });

  it('remove segredos e apaga órfãos', async () => {
    const store = new SecretStore(dir, fakePort());
    await store.load();
    const keep = await store.add('a');
    const drop = await store.add('b');
    const orphan = await store.add('c');
    await store.remove([drop]);
    expect(await store.retainOnly(new Set([keep]))).toBe(1);
    expect(store.ids()).toEqual([keep]);
    expect(store.state(orphan)).toBe('unavailable');
  });
});
