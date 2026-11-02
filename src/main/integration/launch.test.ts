import { describe, expect, it } from 'vitest';
import type { ShellProfile } from '@shared/model';
import { buildLaunch, encodePowerShellCommand } from './launch';

const base = { cwd: null, color: '#000000', icon: 'x', source: 'detected', hidden: false, available: true, shellIntegration: true } as const;
const profile = (p: Partial<ShellProfile> & Pick<ShellProfile, 'shellType' | 'executable' | 'args'>): ShellProfile => ({
  id: 'p',
  name: 'p',
  ...base,
  ...p,
});
const scripts = { powershell: 'Write-Host oi', bashPath: 'C:\\Users\\Zé\\AppData\\Roaming\\Gunslinger\\integration\\gunslinger.bash' };

describe('buildLaunch', () => {
  it('PowerShell: script embutido em -EncodedCommand (não depende da política de execução)', () => {
    const spec = buildLaunch(profile({ shellType: 'powershell', executable: 'powershell.exe', args: ['-NoLogo'] }), 'C:\\src', {}, scripts);
    expect(spec.args).toEqual(['-NoLogo', '-NoExit', '-EncodedCommand', encodePowerShellCommand('Write-Host oi')]);
    expect(Buffer.from(spec.args[3]!, 'base64').toString('utf16le')).toBe('Write-Host oi');
    expect(spec.cwd).toBe('C:\\src');
  });

  it('CMD: injeta marcas no PROMPT preservando o prompt do usuário', () => {
    const spec = buildLaunch(profile({ shellType: 'cmd', executable: 'cmd.exe', args: [] }), 'C:\\', { PROMPT: '[$T] $P$G' }, scripts);
    expect(spec.env['PROMPT']).toBe('$e]9;9;$P$e\\$e]133;A$e\\[$T] $P$G$e]133;B$e\\');
  });

  it('Git Bash: rcfile com barras normais; sem integração usa --login', () => {
    const p = profile({ shellType: 'gitbash', executable: 'bash.exe', args: [] });
    expect(buildLaunch(p, 'C:\\', {}, scripts).args).toEqual([
      '--rcfile',
      'C:/Users/Zé/AppData/Roaming/Gunslinger/integration/gunslinger.bash',
      '-i',
    ]);
    expect(buildLaunch({ ...p, shellIntegration: false }, 'C:\\', {}, scripts).args).toEqual(['--login', '-i']);
  });

  it('WSL: --cd e caminho do script convertido dentro da distribuição', () => {
    const p = profile({ shellType: 'wsl', executable: 'C:\\Windows\\System32\\wsl.exe', args: ['-d', 'Ubuntu'] });
    const spec = buildLaunch(p, 'C:\\src\\app', {}, scripts);
    expect(spec.args.slice(0, 6)).toEqual(['-d', 'Ubuntu', '--cd', 'C:\\src\\app', '--', 'bash']);
    expect(spec.args[7]).toBe(
      `exec bash --rcfile "$(wslpath -u 'C:\\Users\\Zé\\AppData\\Roaming\\Gunslinger\\integration\\gunslinger.bash')" -i`,
    );
    expect(spec.cwd).toBe('C:\\Windows\\System32');
  });

  it('perfil customizado roda como está e define variáveis do terminal', () => {
    const spec = buildLaunch(profile({ shellType: 'custom', executable: 'node.exe', args: ['-i'] }), 'C:\\', {}, scripts);
    expect(spec).toMatchObject({ file: 'node.exe', args: ['-i'] });
    expect(spec.env['TERM_PROGRAM']).toBe('Gunslinger');
  });
});
