import { execFile } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { getVar } from '../env/env-utils';
import type { PlatformAdapter } from './types';

// Fallback mínimo para o app abrir fora do Windows; a detecção de shells não está implementada.
export const posixAdapter: PlatformAdapter = {
  name: 'posix',
  pathDelimiter: ':',

  async detectShells() {
    return [];
  },

  fallbackShell(env) {
    const shell = getVar(env, 'SHELL') ?? '/bin/sh';
    return { id: 'builtin.default', name: shell, shellType: 'custom', executable: shell, args: ['-l'], supportsIntegration: false };
  },

  async exportRegistryKey() {
    return null;
  },

  async readSystemEnvironment(current) {
    return { ...current };
  },

  async resolveExecutable(name, env) {
    const candidates = isAbsolute(name) || name.includes('/')
      ? [name]
      : (getVar(env, 'PATH') ?? '').split(':').filter(Boolean).map((d) => join(d, name));
    for (const c of candidates) {
      try {
        await access(c, constants.X_OK);
        return c;
      } catch {
        // tenta o próximo
      }
    }
    return null;
  },

  buildSpawn(file, args) {
    return { file, args };
  },

  createProcessTracker() {
    return null;
  },

  async listListeningPorts() {
    return [];
  },

  async listDescendants(pid) {
    return new Promise((resolve) => {
      execFile('pgrep', ['-P', String(pid)], (err, stdout) => {
        resolve(err ? [] : stdout.split('\n').filter(Boolean).map(Number));
      });
    });
  },

  async killTree(pid, descendants) {
    for (const p of [pid, ...descendants]) {
      try {
        process.kill(p, 'SIGKILL');
      } catch {
        // já encerrado
      }
    }
  },
};
