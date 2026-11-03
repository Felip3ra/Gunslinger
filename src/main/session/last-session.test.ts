import { describe, expect, it } from 'vitest';
import type { WorkspaceLayout } from '@shared/model';
import { LastSession } from './last-session';

const pane = (cwd: string): WorkspaceLayout => ({ type: 'pane', pane: { profileId: 'builtin.cmd', cwd, projectId: null, command: null } });

describe('LastSession', () => {
  it('grava até ser congelada', async () => {
    const writes: WorkspaceLayout[][] = [];
    const session = new LastSession(async (tabs) => void writes.push(tabs));
    await session.save([pane('C:\\api'), pane('C:\\web')]);
    session.freeze();
    await session.save([]);
    expect(writes).toEqual([[pane('C:\\api'), pane('C:\\web')]]);
  });
});
