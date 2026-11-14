import { describe, expect, it } from 'vitest';
import { buildCdCommand } from '@shared/cd-command';
import { envCommands } from '@shared/env-profiles';
import type { ShellProfile } from '@shared/model';
import { buildLaunch } from '../integration/launch';
import { agentPath } from '../ssh/algorithms';
import { parseLoginEnvironment, parseLsofListening, parseSsListening } from './posix';

describe('portas em escuta (macOS e Linux)', () => {
  it('lê a saída do lsof, com IPv4, IPv6 e todas as interfaces', () => {
    const out = ['p812', 'cnode', 'f23', 'n127.0.0.1:5270', 'p901', 'cpostgres', 'f6', 'n*:5432', 'f7', 'n[::1]:5432', 'f8', 'n*:5432', ''].join('\n');
    expect(parseLsofListening(out)).toEqual([
      { address: '127.0.0.1', port: 5270, pid: 812, processName: 'node' },
      { address: '0.0.0.0', port: 5432, pid: 901, processName: 'postgres' },
      { address: '::1', port: 5432, pid: 901, processName: 'postgres' },
    ]);
  });

  it('lê a saída do ss, com e sem o processo dono', () => {
    const out = [
      'LISTEN 0      511        127.0.0.1:5270       0.0.0.0:*    users:(("node",pid=812,fd=23))',
      'LISTEN 0      128             [::]:22              [::]:*',
      '',
    ].join('\n');
    expect(parseSsListening(out)).toEqual([
      { address: '127.0.0.1', port: 5270, pid: 812, processName: 'node' },
      { address: '::', port: 22, pid: 0, processName: null },
    ]);
  });
});

describe('ambiente do shell de login', () => {
  it('ignora o que os arquivos de perfil escrevem em volta das marcas', () => {
    const out = `bem-vindo\n__GUNSLINGER_ENV__${JSON.stringify({ PATH: '/opt/homebrew/bin:/usr/bin', N: 1 })}__GUNSLINGER_ENV__\nfim\n`;
    expect(parseLoginEnvironment(out)).toEqual({ PATH: '/opt/homebrew/bin:/usr/bin' });
  });

  it('saída sem as marcas ou com JSON inválido não vale', () => {
    expect(parseLoginEnvironment('nada')).toBeNull();
    expect(parseLoginEnvironment('__GUNSLINGER_ENV__{x__GUNSLINGER_ENV__')).toBeNull();
  });
});

describe('shells nativos', () => {
  const profile = (shellType: ShellProfile['shellType'], args: string[] = []): ShellProfile => ({
    id: `builtin.${shellType}`,
    name: shellType,
    shellType,
    executable: `/bin/${shellType}`,
    args,
    cwd: null,
    color: '#000000',
    icon: 'builtin:terminal',
    source: 'detected',
    hidden: false,
    available: true,
    shellIntegration: true,
  });
  const scripts = { powershell: '', bashPath: '/dados/integration/gunslinger.bash', zshDir: '/dados/integration/zsh' };

  it('bash usa o --rcfile da integração; sem integração, abre como login', () => {
    expect(buildLaunch(profile('bash'), '/src', {}, scripts).args).toEqual(['--rcfile', '/dados/integration/gunslinger.bash', '-i']);
    expect(buildLaunch({ ...profile('bash'), shellIntegration: false }, '/src', {}, scripts).args).toEqual(['--login', '-i']);
  });

  it('zsh recebe o ZDOTDIR do app e guarda o do usuário', () => {
    const launch = buildLaunch(profile('zsh', ['-l']), '/src', { HOME: '/home/ana' }, scripts);
    expect(launch.args).toEqual(['-l']);
    expect(launch.env).toMatchObject({ ZDOTDIR: '/dados/integration/zsh', GUNSLINGER_USER_ZDOTDIR: '/home/ana' });
    const custom = buildLaunch(profile('zsh', ['-l']), '/src', { HOME: '/home/ana', ZDOTDIR: '/home/ana/.config/zsh' }, scripts);
    expect(custom.env['GUNSLINGER_USER_ZDOTDIR']).toBe('/home/ana/.config/zsh');
    expect(buildLaunch({ ...profile('zsh', ['-l']), shellIntegration: false }, '/src', { HOME: '/home/ana' }, scripts).env['ZDOTDIR']).toBeUndefined();
  });

  it('trocar de pasta e aplicar ambiente usam a sintaxe de cada shell', () => {
    expect(buildCdCommand('zsh', "/src/loja do zé's")).toBe(`cd '/src/loja do zé'\\''s'`);
    expect(buildCdCommand('fish', "/src/it's")).toBe(String.raw`cd '/src/it\'s'`);
    expect(envCommands('bash', { A: 'x y' })).toEqual([`export A='x y'`]);
    expect(envCommands('fish', { A: "x'y" })).toEqual([String.raw`set -gx A 'x\'y'`]);
  });
});

describe('agente SSH', () => {
  it('usa o agente do sistema informado; sem agente no sistema, não usa nenhum', () => {
    expect(agentPath('openssh', '/run/user/1000/ssh-agent.sock')).toBe('/run/user/1000/ssh-agent.sock');
    expect(agentPath('openssh', null)).toBeNull();
    expect(agentPath('off', '/tmp/agent')).toBeNull();
    expect(agentPath('openssh')).toContain('openssh-ssh-agent');
  });
});
