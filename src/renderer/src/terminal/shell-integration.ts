export interface CommandEvent {
  command: string;
  durationMs: number;
  exitCode: number | null;
}

export interface Position {
  x: number;
  /** Linha absoluta no buffer (inclui o histórico). */
  y: number;
}

/** O pouco que o rastreador precisa do buffer do terminal (permite testar sem xterm). */
export interface BufferReader {
  cursor(): Position;
  lineText(y: number, fromX?: number): string | null;
  isWrapped(y: number): boolean;
}

export interface IntegrationEvents {
  onCwd(cwd: string): void;
  onCommandStart(): void;
  onCommandEnd(event: CommandEvent): void;
}

/** Texto de uma OSC 9;9: o caminho pode vir entre aspas. */
export function parseOsc99(data: string): string | null {
  if (!data.startsWith('9;')) return null;
  const path = data.slice(2).trim().replace(/^"(.*)"$/, '$1');
  return path.length > 0 ? path : null;
}

/**
 * Interpreta as marcas da integração com o shell (OSC 9;9 e 133;A/B/C/D) e o Enter digitado,
 * e deriva pasta atual, início/fim de comando e prontidão do prompt.
 */
export class ShellIntegrationTracker {
  private promptReady = false;
  private sawCommandStartMark = false;
  private startedAt: number | null = null;
  private inputLineStart: Position | null = null;
  private commandLineStart: Position | null = null;
  private commandText = '';
  private readonly promptWaiters: (() => void)[] = [];

  constructor(
    private readonly buffer: BufferReader,
    private readonly events: IntegrationEvents,
    private readonly now: () => number = () => performance.now(),
  ) {}

  get isPromptReady(): boolean {
    return this.promptReady;
  }

  /** true quando o shell emite a marca C (bash); sem ela, o Enter marca o início do comando. */
  get hasCommandStartMark(): boolean {
    return this.sawCommandStartMark;
  }

  osc9(data: string): boolean {
    const cwd = parseOsc99(data);
    if (cwd) this.events.onCwd(cwd);
    return cwd !== null;
  }

  osc133(data: string): boolean {
    const [mark, arg] = data.split(';');
    switch (mark) {
      case 'A':
        // Sem marca D (CMD), a volta do prompt é o fim do comando.
        if (this.startedAt !== null) this.finish(null);
        this.promptReady = true;
        for (const waiter of this.promptWaiters.splice(0)) waiter();
        break;
      case 'B':
        this.inputLineStart = this.buffer.cursor();
        break;
      case 'C':
        this.sawCommandStartMark = true;
        this.start();
        break;
      case 'D':
        if (this.startedAt !== null) this.finish(arg !== undefined && /^-?\d+$/.test(arg) ? Number(arg) : null);
        break;
    }
    return true;
  }

  /** Enter digitado pelo usuário. */
  enter(): void {
    // Shells sem marca C (PowerShell, CMD): o Enter no prompt marca o início do comando.
    if (!this.sawCommandStartMark && this.promptReady && this.startedAt === null) this.start();
  }

  onPromptReady(waiter: () => void): void {
    if (this.promptReady) waiter();
    else this.promptWaiters.push(waiter);
  }

  reset(): void {
    this.promptReady = false;
    this.sawCommandStartMark = false;
    this.startedAt = null;
  }

  private start(): void {
    if (this.startedAt !== null) return;
    this.commandText = this.readInputLine();
    this.promptReady = false;
    // Enter em linha vazia não é comando.
    if (!this.commandText.trim() && !this.sawCommandStartMark) {
      this.promptReady = true;
      return;
    }
    this.startedAt = this.now();
    this.commandLineStart = this.inputLineStart;
    this.events.onCommandStart();
  }

  private finish(exitCode: number | null): void {
    const started = this.startedAt;
    this.startedAt = null;
    if (started === null) return;
    // Relê a linha agora: no Enter, o eco das últimas teclas podia ainda não ter chegado do shell.
    const text = this.commandLineStart ? this.readCommandLine(this.commandLineStart) : '';
    this.events.onCommandEnd({ command: (text || this.commandText).trim(), durationMs: this.now() - started, exitCode });
  }

  /** Texto digitado no prompt até o cursor (usado no Enter, para descartar linhas vazias). */
  private readInputLine(): string {
    const start = this.inputLineStart;
    if (!start) return '';
    const last = this.buffer.cursor().y;
    let text = '';
    for (let y = start.y; y <= last; y++) text += this.buffer.lineText(y, y === start.y ? start.x : 0) ?? '';
    return text;
  }

  /** Linha do comando a partir do fim do prompt, incluindo continuações quebradas pela largura. */
  private readCommandLine(start: Position): string {
    let text = this.buffer.lineText(start.y, start.x) ?? '';
    for (let y = start.y + 1; this.buffer.isWrapped(y); y++) text += this.buffer.lineText(y) ?? '';
    return text;
  }
}
