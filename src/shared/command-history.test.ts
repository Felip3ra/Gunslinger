import { describe, expect, it } from 'vitest';
import { recordCommand, type CommandHistoryEntry } from './command-history';

const run = (command: string, at = 1, exitCode: number | null = 0) => ({ command, cwd: 'C:\\src', at, exitCode });

describe('recordCommand', () => {
  it('coloca o comando no topo', () => {
    const list = recordCommand(recordCommand([], run('npm test', 1)), run('dotnet build', 2));
    expect(list.map((e) => e.command)).toEqual(['dotnet build', 'npm test']);
  });

  it('repetição sobe para o topo e soma a contagem', () => {
    let list: CommandHistoryEntry[] = [];
    for (const [cmd, at] of [['a', 1], ['b', 2], ['a', 3]] as const) list = recordCommand(list, run(cmd, at, at === 3 ? 1 : 0));
    expect(list).toEqual([
      { command: 'a', cwd: 'C:\\src', at: 3, exitCode: 1, count: 2 },
      { command: 'b', cwd: 'C:\\src', at: 2, exitCode: 0, count: 1 },
    ]);
  });

  it('ignora vazio e comandos começados por espaço', () => {
    expect(recordCommand([], run('   '))).toEqual([]);
    expect(recordCommand([], run(' export TOKEN=x'))).toEqual([]);
  });

  it('respeita o limite', () => {
    let list: CommandHistoryEntry[] = [];
    for (let i = 0; i < 5; i++) list = recordCommand(list, run(`c${i}`, i), 3);
    expect(list.map((e) => e.command)).toEqual(['c4', 'c3', 'c2']);
  });
});
