import { describe, expect, it } from 'vitest';
import { buildCdCommand, samePath, toMsysPath, toWslPath } from './cd-command';

describe('buildCdCommand', () => {
  it('PowerShell usa -LiteralPath e dobra aspas simples', () => {
    expect(buildCdCommand('pwsh', "C:\\Projetos\\D'Ávila")).toBe("Set-Location -LiteralPath 'C:\\Projetos\\D''Ávila'");
  });

  it('CMD usa /d para trocar de drive', () => {
    expect(buildCdCommand('cmd', 'D:\\src\\api')).toBe('cd /d "D:\\src\\api"');
  });

  it('Git Bash converte para /c/... com aspas simples', () => {
    expect(buildCdCommand('gitbash', 'C:\\Meus Projetos\\api')).toBe("cd '/c/Meus Projetos/api'");
    expect(buildCdCommand('gitbash', "C:\\it's")).toBe("cd '/c/it'\\''s'");
  });

  it('WSL usa a raiz de montagem e caminhos nativos', () => {
    expect(buildCdCommand('wsl', 'C:\\src\\app')).toBe("cd '/mnt/c/src/app'");
    expect(buildCdCommand('wsl', 'C:\\src', { mountRoot: '/' })).toBe("cd '/c/src'");
    expect(buildCdCommand('wsl', '\\\\wsl.localhost\\Ubuntu\\home\\ana')).toBe("cd '/home/ana'");
  });

  it('perfil customizado não recebe comando de troca de pasta', () => {
    expect(buildCdCommand('custom', 'C:\\x')).toBeNull();
  });
});

describe('conversões e comparação', () => {
  it('converte raízes de drive', () => {
    expect(toMsysPath('C:\\')).toBe('/c');
    expect(toWslPath('D:\\')).toBe('/mnt/d');
  });

  it('compara pastas ignorando caixa e barra final', () => {
    expect(samePath('C:\\Src\\', 'c:/src')).toBe(true);
    expect(samePath('C:\\src', 'C:\\src2')).toBe(false);
    expect(samePath(null, 'C:\\')).toBe(false);
  });
});
