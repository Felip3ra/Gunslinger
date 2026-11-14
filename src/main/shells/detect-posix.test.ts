import { describe, expect, it } from 'vitest';
import { detectPosixShells, parseShellsFile, type PosixDetectDeps } from './detect-posix';

function deps(over: Partial<PosixDetectDeps> & { files?: string[]; onPath?: Record<string, string> } = {}): PosixDetectDeps {
  const files = new Set(over.files ?? []);
  return {
    env: { SHELL: '/bin/zsh' },
    exists: async (p) => files.has(p),
    readShellsFile: async () => null,
    resolveOnPath: async (name) => over.onPath?.[name] ?? null,
    ...over,
  };
}

describe('parseShellsFile', () => {
  it('ignora comentários, linhas vazias e entradas que não são caminhos', () => {
    expect(parseShellsFile('# shells válidos\n/bin/sh\n\n/bin/bash # padrão\nzsh\n/usr/bin/fish\r\n')).toEqual(['/bin/sh', '/bin/bash', '/usr/bin/fish']);
  });
});

describe('detectPosixShells', () => {
  it('põe o shell de login primeiro e acrescenta os outros de /etc/shells', async () => {
    const shells = await detectPosixShells(
      deps({ files: ['/bin/zsh', '/bin/bash', '/usr/bin/fish'], readShellsFile: async () => '/bin/sh\n/bin/bash\n/bin/zsh\n/usr/bin/fish\n' }),
    );
    expect(shells.map((s) => [s.id, s.executable, s.supportsIntegration])).toEqual([
      ['builtin.zsh', '/bin/zsh', true],
      ['builtin.bash', '/bin/bash', true],
      ['builtin.fish', '/usr/bin/fish', false],
    ]);
  });

  it('usa o caminho do shell de login mesmo quando /etc/shells lista outro do mesmo tipo', async () => {
    const shells = await detectPosixShells(
      deps({ env: { SHELL: '/opt/homebrew/bin/bash' }, files: ['/opt/homebrew/bin/bash', '/bin/bash'], readShellsFile: async () => '/bin/bash\n' }),
    );
    expect(shells).toHaveLength(1);
    expect(shells[0]).toMatchObject({ id: 'builtin.bash', executable: '/opt/homebrew/bin/bash' });
  });

  it('sem /etc/shells procura no PATH, e o PowerShell entra depois dos shells nativos', async () => {
    const shells = await detectPosixShells(deps({ env: {}, onPath: { bash: '/usr/bin/bash', pwsh: '/usr/local/bin/pwsh' } }));
    expect(shells.map((s) => [s.id, s.shellType])).toEqual([
      ['builtin.bash', 'bash'],
      ['builtin.pwsh.unix', 'pwsh'],
    ]);
  });

  it('entrada de /etc/shells que não existe no disco é descartada', async () => {
    expect(await detectPosixShells(deps({ env: {}, readShellsFile: async () => '/bin/zsh\n' }))).toEqual([]);
  });
});
