import { describe, expect, it } from 'vitest';
import { JobTracker, parseReleased, type HelperProcess } from './job-tracker';

function fakeHelper(respond: (line: string) => string | null) {
  const lines: ((l: string) => void)[] = [];
  const exits: (() => void)[] = [];
  const written: string[] = [];
  const helper: HelperProcess = {
    write: (line) => {
      written.push(line);
      const reply = respond(line);
      if (reply !== null) queueMicrotask(() => lines.forEach((l) => l(reply)));
    },
    onLine: (l) => void lines.push(l),
    onExit: (l) => void exits.push(l),
    kill: () => exits.forEach((e) => e()),
  };
  return { helper, written, exit: () => exits.forEach((e) => e()) };
}

describe('parseReleased', () => {
  it('lê pid e nome e esconde processos do console', () => {
    expect(parseReleased('12:PING\t13:conhost\t14:Code')).toEqual([
      { pid: 12, name: 'PING' },
      { pid: 14, name: 'Code' },
    ]);
    expect(parseReleased('')).toEqual([]);
  });
});

describe('JobTracker', () => {
  it('inicia o auxiliar uma vez e associa respostas pelo id', async () => {
    let starts = 0;
    const fake = fakeHelper((line) => {
      const [cmd, id] = line.split(' ');
      return cmd === 'release' ? `${id} 99:node` : `${id} ok`;
    });
    const tracker = new JobTracker(() => {
      starts++;
      return fake.helper;
    });
    tracker.track('s1', 10);
    expect(await tracker.release('s1')).toEqual([{ pid: 99, name: 'node' }]);
    expect(starts).toBe(1);
    expect(fake.written).toEqual(['track 1 s1 10', 'release 2 s1']);
  });

  it('auxiliar que morre devolve lista vazia e é reiniciado na próxima chamada', async () => {
    let starts = 0;
    const fake = fakeHelper(() => null);
    const tracker = new JobTracker(() => {
      starts++;
      return fake.helper;
    });
    const pending = tracker.release('s1');
    fake.exit();
    expect(await pending).toEqual([]);
    tracker.track('s2', 1);
    expect(starts).toBe(2);
  });

  it('falha ao iniciar não quebra', async () => {
    const tracker = new JobTracker(() => {
      throw new Error('sem powershell');
    });
    tracker.track('s1', 1);
    expect(await tracker.release('s1')).toEqual([]);
  });
});
