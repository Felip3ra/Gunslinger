import type { CustomProfile, ProfileOverride, ShellProfile, ShellType } from '@shared/model';
import type { DetectedShell } from '../platform/types';

export const DEFAULT_COLORS: Record<ShellType, string> = {
  powershell: '#3b78ff',
  pwsh: '#2f6fd6',
  gitbash: '#3fb950',
  cmd: '#8b949e',
  wsl: '#e95420',
  custom: '#a371f7',
};

export const DEFAULT_ICONS: Record<ShellType, string> = {
  powershell: 'builtin:powershell',
  pwsh: 'builtin:powershell',
  gitbash: 'builtin:git',
  cmd: 'builtin:cmd',
  wsl: 'builtin:linux',
  custom: 'builtin:terminal',
};


export function resolveProfiles(
  detected: DetectedShell[],
  overrides: Record<string, ProfileOverride>,
  custom: CustomProfile[],
  customAvailability: ReadonlyMap<string, boolean>,
  pluginProfiles: CustomProfile[] = [],
): ShellProfile[] {
  const fromDetected = detected.map((d): ShellProfile => {
    const o = overrides[d.id] ?? {};
    return {
      id: d.id,
      name: d.name,
      shellType: d.shellType,
      executable: d.executable,
      args: o.args ?? d.args,
      cwd: o.cwd ?? null,
      color: o.color ?? DEFAULT_COLORS[d.shellType],
      icon: o.icon ?? DEFAULT_ICONS[d.shellType],
      source: 'detected',
      hidden: o.hidden ?? false,
      available: true,
      shellIntegration: o.shellIntegration ?? d.supportsIntegration,
      ...(d.wslDistro ? { wslDistro: d.wslDistro } : {}),
    };
  });
  const fromCustom = custom.map(
    (c): ShellProfile => ({
      id: c.id,
      name: c.name,
      shellType: 'custom',
      executable: c.executable,
      args: c.args,
      cwd: c.cwd,
      color: c.color ?? DEFAULT_COLORS.custom,
      icon: c.icon ?? DEFAULT_ICONS.custom,
      source: 'custom',
      hidden: false,
      available: customAvailability.get(c.id) ?? true,
      shellIntegration: c.shellIntegration,
    }),
  );
  const fromPlugins = pluginProfiles.map((c): ShellProfile => {
    const o = overrides[c.id] ?? {};
    return {
      id: c.id,
      name: c.name,
      shellType: 'custom',
      executable: c.executable,
      args: o.args ?? c.args,
      cwd: o.cwd !== undefined ? o.cwd : c.cwd,
      color: o.color ?? c.color ?? DEFAULT_COLORS.custom,
      icon: o.icon ?? c.icon ?? DEFAULT_ICONS.custom,
      source: 'plugin',
      hidden: o.hidden ?? false,
      available: customAvailability.get(c.id) ?? true,
      shellIntegration: o.shellIntegration ?? c.shellIntegration,
    };
  });
  return [...fromDetected, ...fromCustom, ...fromPlugins];
}

export { pickDefaultProfile, type DefaultProfileResult } from '@shared/profiles';
