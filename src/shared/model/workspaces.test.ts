import { describe, expect, it } from 'vitest';
import { workspaceSchema } from './workspaces';

describe('workspaceSchema', () => {
  it('aceita workspaces antigos, sem hostId, como painéis locais', () => {
    const old = { id: 'w1', name: 'Loja', tabs: [{ type: 'pane', pane: { profileId: 'builtin.pwsh', cwd: 'C:\\src\\loja', projectId: null, command: null } }] };
    const parsed = workspaceSchema.parse(old);
    expect(parsed.tabs[0]).toEqual({ type: 'pane', pane: { profileId: 'builtin.pwsh', cwd: 'C:\\src\\loja', projectId: null, command: null, hostId: null } });
  });

  it('guarda painéis SSH pelo host, com comando inicial', () => {
    const ws = { id: 'w2', name: 'Homolog', tabs: [{ type: 'pane', pane: { hostId: 'h1', command: 'tail -f /var/log/app.log' } }] };
    const parsed = workspaceSchema.parse(ws);
    expect(parsed.tabs[0]).toMatchObject({ pane: { hostId: 'h1', profileId: null, command: 'tail -f /var/log/app.log' } });
  });
});
