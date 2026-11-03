import { describe, expect, it, vi } from 'vitest';
import { parseOsc633Property, parseOsc99, ShellIntegrationTracker, type BufferReader, type CommandEvent } from './shell-integration';

/** Buffer falso: linhas de texto, cursor ajustável e marcação de linhas quebradas. */
function fakeBuffer() {
  const lines: string[] = [];
  const wrapped = new Set<number>();
  let cursor = { x: 0, y: 0 };
  const reader: BufferReader = {
    cursor: () => cursor,
    lineText: (y, fromX = 0) => (lines[y] === undefined ? null : lines[y]!.slice(fromX)),
    isWrapped: (y) => wrapped.has(y),
  };
  return {
    reader,
    lines,
    wrapped,
    setCursor: (x: number, y: number) => void (cursor = { x, y }),
  };
}

function setup() {
  const buf = fakeBuffer();
  let t = 0;
  const ends: CommandEvent[] = [];
  const events = { onCwd: vi.fn(), onCommandStart: vi.fn(), onCommandEnd: (e: CommandEvent) => void ends.push(e) };
  const tracker = new ShellIntegrationTracker(buf.reader, events, () => t);
  return { buf, tracker, events, ends, advance: (ms: number) => void (t += ms) };
}

describe('parseOsc99', () => {
  it('aceita caminho com e sem aspas', () => {
    expect(parseOsc99('9;"C:\\src"')).toBe('C:\\src');
    expect(parseOsc99('9;C:\\x')).toBe('C:\\x');
    expect(parseOsc99('4;x')).toBeNull();
  });
});

describe('ShellIntegrationTracker', () => {
  it('PowerShell/CMD (sem marca C): Enter inicia, prompt seguinte termina com o código da marca D', () => {
    const { buf, tracker, events, ends, advance } = setup();
    buf.lines[0] = 'PS C:\\> ';
    tracker.osc133('A');
    buf.setCursor(8, 0);
    tracker.osc133('B');
    buf.lines[0] = 'PS C:\\> npm run build';
    buf.setCursor(21, 0);
    tracker.enter();
    expect(events.onCommandStart).toHaveBeenCalledTimes(1);
    advance(2500);
    tracker.osc133('D;2');
    expect(ends).toEqual([{ command: 'npm run build', durationMs: 2500, exitCode: 2 }]);
  });

  it('Enter em linha vazia não é comando', () => {
    const { buf, tracker, events } = setup();
    buf.lines[0] = '> ';
    tracker.osc133('A');
    buf.setCursor(2, 0);
    tracker.osc133('B');
    tracker.enter();
    expect(events.onCommandStart).not.toHaveBeenCalled();
    expect(tracker.isPromptReady).toBe(true);
  });

  it('CMD sem marca D: a volta do prompt encerra com código desconhecido', () => {
    const { buf, tracker, ends } = setup();
    buf.lines[0] = 'C:\\>dir';
    tracker.osc133('A');
    buf.setCursor(4, 0);
    tracker.osc133('B');
    buf.setCursor(7, 0);
    tracker.enter();
    tracker.osc133('A');
    expect(ends[0]).toMatchObject({ command: 'dir', exitCode: null });
  });

  it('bash: marca C inicia (Enter não duplica) e lê linhas quebradas no fim', () => {
    const { buf, tracker, ends } = setup();
    tracker.osc133('A');
    buf.lines[3] = '$ echo um-comando-';
    buf.lines[4] = 'muito-longo';
    buf.wrapped.add(4);
    buf.setCursor(2, 3);
    tracker.osc133('B');
    tracker.osc133('C');
    tracker.enter();
    tracker.osc133('D;0');
    expect(ends).toEqual([{ command: 'echo um-comando-muito-longo', durationMs: 0, exitCode: 0 }]);
    expect(tracker.hasCommandStartMark).toBe(true);
  });

  it('avisa quem espera pelo prompt', () => {
    const { tracker } = setup();
    const waiter = vi.fn();
    tracker.onPromptReady(waiter);
    expect(waiter).not.toHaveBeenCalled();
    tracker.osc133('A');
    expect(waiter).toHaveBeenCalledTimes(1);
  });

  it('OSC 9;9 informa a pasta', () => {
    const { tracker, events } = setup();
    expect(tracker.osc9('9;"D:\\x"')).toBe(true);
    expect(events.onCwd).toHaveBeenCalledWith('D:\\x');
  });
});

describe('OSC 633 (propriedades)', () => {
  it('lê a versão do Node e ignora outras propriedades', () => {
    expect(parseOsc633Property('P;NodeVersion=v20.11.0', 'NodeVersion')).toBe('v20.11.0');
    expect(parseOsc633Property('P;Cwd=C:\\src', 'NodeVersion')).toBeNull();
    expect(parseOsc633Property('P;NodeVersion=', 'NodeVersion')).toBeNull();
  });

  it('avisa a versão do Node ao rastreador', () => {
    const onNodeVersion = vi.fn();
    const buffer: BufferReader = { cursor: () => ({ x: 0, y: 0 }), lineText: () => '', isWrapped: () => false };
    const tracker = new ShellIntegrationTracker(buffer, { onCwd() {}, onCommandStart() {}, onCommandEnd() {}, onNodeVersion });
    expect(tracker.osc633('P;NodeVersion=v18.19.1')).toBe(true);
    expect(onNodeVersion).toHaveBeenCalledWith('v18.19.1');
  });
});
