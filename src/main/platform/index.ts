import { posixAdapter } from './posix';
import type { PlatformAdapter } from './types';
import { win32Adapter } from './win32';

export type { DetectedShell, PlatformAdapter, SpawnSpec } from './types';

export function getPlatformAdapter(): PlatformAdapter {
  return process.platform === 'win32' ? win32Adapter : posixAdapter;
}
