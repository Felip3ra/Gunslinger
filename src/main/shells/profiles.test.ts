import { describe, expect, it } from 'vitest';
import type { DetectedShell } from '../platform/types';
import { pickDefaultProfile, resolveProfiles } from './profiles';

const detected: DetectedShell[] = [
  { id: 'builtin.powershell', name: 'Windows PowerShell', shellType: 'powershell', executable: 'powershell.exe', args: ['-NoLogo'], supportsIntegration: true },
  { id: 'builtin.cmd', name: 'Prompt de Comando', shellType: 'cmd', executable: 'cmd.exe', args: [], supportsIntegration: true },
  { id: 'builtin.gitbash', name: 'Git Bash', shellType: 'gitbash', executable: 'bash.exe', args: [], supportsIntegration: true },
];

describe('resolveProfiles', () => {
  it('aplica cores padrão por tipo e os ajustes do usuário', () => {
    const profiles = resolveProfiles(
      detected,
      { 'builtin.powershell': { hidden: true }, 'builtin.cmd': { color: '#ffffff', args: ['/k', 'echo oi'] } },
      [{ id: 'c1', name: 'Node REPL', executable: 'node.exe', args: [], cwd: null, color: '#43853d', icon: null, shellIntegration: false }],
      new Map([['c1', false]]),
    );
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
    expect(byId['builtin.gitbash']!.color).toBe('#3fb950');
    expect(byId['builtin.powershell']!.hidden).toBe(true);
    expect(byId['builtin.cmd']).toMatchObject({ color: '#ffffff', args: ['/k', 'echo oi'] });
    expect(byId['c1']).toMatchObject({ source: 'custom', color: '#43853d', available: false, shellType: 'custom' });
  });

  it('ajustes de perfis que deixaram de existir são ignorados', () => {
    const profiles = resolveProfiles(detected, { 'builtin.wsl.Antiga': { color: '#000000' } }, [], new Map());
    expect(profiles.map((p) => p.id)).not.toContain('builtin.wsl.Antiga');
  });
});

describe('pickDefaultProfile', () => {
  const profiles = resolveProfiles(detected, {}, [], new Map());

  it('usa o perfil configurado quando existe', () => {
    expect(pickDefaultProfile(profiles, 'builtin.gitbash')).toEqual({ profile: profiles[2], warning: null });
  });

  it('cai para PowerShell 7 → 5.1 → CMD e avisa', () => {
    const result = pickDefaultProfile(profiles, 'builtin.pwsh');
    expect(result.profile?.id).toBe('builtin.powershell');
    expect(result.warning).toMatch(/não encontrado/);
  });
});

it('perfis de plugins: source plugin, overrides do usuário e disponibilidade', () => {
  const plugin = { id: 'plugin.kit.node', name: 'Node REPL', executable: 'node.exe', args: [], cwd: null, color: '#123456', icon: null, shellIntegration: false };
  const profiles = resolveProfiles([], { 'plugin.kit.node': { hidden: true } }, [], new Map([['plugin.kit.node', false]]), [plugin]);
  expect(profiles).toEqual([
    expect.objectContaining({ id: 'plugin.kit.node', source: 'plugin', hidden: true, available: false, color: '#123456', icon: 'builtin:terminal' }),
  ]);
});
