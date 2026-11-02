import { describe, expect, it } from 'vitest';
import { testCommand } from './test-runner';

describe('testCommand', () => {
  it('dotnet test com TRX e filtro', () => {
    expect(testCommand({ kind: 'dotnet', project: 'tests/A.Tests.csproj' }, 'npm', 'C:\\r', 'x.trx', ['t.A.B'])).toEqual({
      tool: 'dotnet',
      args: ['test', 'tests/A.Tests.csproj', '--logger', 'trx;LogFileName=x.trx', '--results-directory', 'C:\\r', '--filter', 'FullyQualifiedName=t.A.B'],
    });
  });

  it('script test do pacote com o reporter do framework', () => {
    const vitest = testCommand({ kind: 'node', dir: 'web', framework: 'vitest' }, 'npm', 'C:\\r', 'x.json', []);
    expect(vitest.tool).toBe('npm');
    expect(vitest.args).toEqual(['run', 'test', '--', '--run', '--reporter=json', expect.stringMatching(/^--outputFile=C:.r.x\.json$/)]);
    const jest = testCommand({ kind: 'node', dir: '', framework: 'jest' }, 'pnpm', 'C:\\r', 'x.json', ['soma']);
    expect(jest.args).toEqual(['run', 'test', '--json', expect.stringMatching(/^--outputFile=/), '-t', '^(soma)$']);
  });
});
