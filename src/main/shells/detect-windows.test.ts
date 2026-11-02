import { describe, expect, it } from 'vitest';
import { detectGitBash, detectPwsh, detectWindowsShells, detectWsl, gitRootFromGitExe, type DetectDeps } from './detect-windows';

const baseEnv = {
  SystemRoot: 'C:\\Windows',
  ComSpec: 'C:\\Windows\\system32\\cmd.exe',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\ana\\AppData\\Local',
  USERPROFILE: 'C:\\Users\\ana',
};

function fakeDeps(opts: {
  files?: string[];
  dirs?: Record<string, string[]>;
  reg?: Record<string, string>;
  onPath?: Record<string, string>;
  wslList?: string | null;
}): DetectDeps {
  const files = new Set((opts.files ?? []).map((f) => f.toLowerCase()));
  return {
    env: baseEnv,
    exists: async (p) => files.has(p.toLowerCase()),
    readdir: async (p) => {
      const d = opts.dirs?.[p];
      if (!d) throw new Error('ENOENT');
      return d;
    },
    regExport: async (key) => opts.reg?.[key] ?? null,
    resolveOnPath: async (name) => opts.onPath?.[name] ?? null,
    wslListQuiet: async () => opts.wslList ?? null,
  };
}

const reg = (key: string, values: Record<string, string>): string =>
  ['Windows Registry Editor Version 5.00', '', `[${key}]`, ...Object.entries(values).map(([k, v]) => `"${k}"="${v.replace(/\\/g, '\\\\')}"`)].join('\r\n');

describe('detectPwsh', () => {
  it('escolhe a maior versão instalada em Program Files', async () => {
    const deps = fakeDeps({
      dirs: { 'C:\\Program Files\\PowerShell': ['7', '7-preview', '6'] },
      files: ['C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'C:\\Program Files\\PowerShell\\7-preview\\pwsh.exe', 'C:\\Program Files\\PowerShell\\6\\pwsh.exe'],
    });
    expect((await detectPwsh(deps))?.executable).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe');
  });

  it('usa a instalação da Store ou o PATH como alternativa', async () => {
    const store = fakeDeps({ files: ['C:\\Users\\ana\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe'] });
    expect((await detectPwsh(store))?.executable).toContain('WindowsApps');
    const onPath = fakeDeps({ onPath: { 'pwsh.exe': 'D:\\tools\\pwsh\\pwsh.exe' } });
    expect((await detectPwsh(onPath))?.executable).toBe('D:\\tools\\pwsh\\pwsh.exe');
    expect(await detectPwsh(fakeDeps({}))).toBeNull();
  });
});

describe('detectGitBash', () => {
  it('usa o InstallPath do registro', async () => {
    const deps = fakeDeps({
      reg: { 'HKLM\\SOFTWARE\\GitForWindows': reg('HKEY_LOCAL_MACHINE\\SOFTWARE\\GitForWindows', { InstallPath: 'D:\\Ferramentas\\Git' }) },
      files: ['D:\\Ferramentas\\Git\\bin\\bash.exe'],
    });
    const shell = await detectGitBash(deps);
    expect(shell).toMatchObject({ id: 'builtin.gitbash', executable: 'D:\\Ferramentas\\Git\\bin\\bash.exe', args: [] });
  });

  it('deriva a raiz a partir do git.exe no PATH', async () => {
    expect(gitRootFromGitExe('E:\\Git\\cmd\\git.exe')).toBe('E:\\Git');
    expect(gitRootFromGitExe('E:\\Git\\mingw64\\bin\\git.exe')).toBe('E:\\Git');
    const deps = fakeDeps({ onPath: { 'git.exe': 'E:\\Git\\cmd\\git.exe' }, files: ['E:\\Git\\bin\\bash.exe'] });
    expect((await detectGitBash(deps))?.executable).toBe('E:\\Git\\bin\\bash.exe');
  });

  it('não lista Git Bash quando o Git não está instalado', async () => {
    expect(await detectGitBash(fakeDeps({}))).toBeNull();
  });
});

describe('detectWsl', () => {
  const wslFile = 'C:\\Windows\\System32\\wsl.exe';
  const lxss = [
    'Windows Registry Editor Version 5.00',
    '',
    '[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss]',
    '"DefaultDistribution"="{a}"',
    '',
    '[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss\\{a}]',
    '"DistributionName"="Ubuntu"',
    '',
    '[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss\\{b}]',
    '"DistributionName"="docker-desktop-data"',
    '',
    '[HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss\\{c}]',
    '"DistributionName"="Debian"',
  ].join('\r\n');

  it('cria um perfil por distribuição e ignora docker-desktop', async () => {
    const deps = fakeDeps({ files: [wslFile], reg: { 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss': lxss } });
    const shells = await detectWsl(deps);
    expect(shells.map((s) => [s.id, s.name, s.args])).toEqual([
      ['builtin.wsl.Ubuntu', 'WSL: Ubuntu', ['-d', 'Ubuntu']],
      ['builtin.wsl.Debian', 'WSL: Debian', ['-d', 'Debian']],
    ]);
  });

  it('usa wsl -l -q quando o registro não tem distribuições', async () => {
    const deps = fakeDeps({ files: [wslFile], wslList: 'Ubuntu-22.04\r\n\0docker-desktop\r\n' });
    expect((await detectWsl(deps)).map((s) => s.wslDistro)).toEqual(['Ubuntu-22.04']);
  });

  it('wsl.exe sem distribuição não gera perfil', async () => {
    expect(await detectWsl(fakeDeps({ files: [wslFile], wslList: '' }))).toEqual([]);
  });
});

describe('detectWindowsShells', () => {
  it('sempre inclui o CMD e isola falhas de detectores', async () => {
    const deps = fakeDeps({});
    deps.regExport = async () => {
      throw new Error('reg falhou');
    };
    const shells = await detectWindowsShells(deps);
    expect(shells.map((s) => s.id)).toEqual(['builtin.cmd']);
  });
});
