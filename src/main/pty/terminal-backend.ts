import type { IPty } from 'node-pty';

/**
 * O que o PtyManager precisa de um terminal: um processo local (PTY) ou um canal remoto (SSH).
 * Buffer, controle de fluxo e ciclo de vida ficam no PtyManager; o backend só move bytes.
 */
export interface TerminalBackend {
  /** PID do processo local; null quando não há processo local (sessão remota). */
  readonly pid: number | null;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  pause(): void;
  resume(): void;
  kill(): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (exitCode: number) => void): void;
}

/** Backend local sobre o node-pty. */
export function ptyBackend(pty: IPty): TerminalBackend {
  return {
    pid: pty.pid,
    write: (data) => pty.write(data),
    resize: (cols, rows) => pty.resize(cols, rows),
    pause: () => pty.pause(),
    resume: () => pty.resume(),
    kill: () => pty.kill(),
    onData: (listener) => void pty.onData(listener),
    onExit: (listener) => void pty.onExit(({ exitCode }) => listener(exitCode)),
  };
}
