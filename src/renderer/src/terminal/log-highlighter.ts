import type { Terminal } from '@xterm/xterm';
import { compileRules, findMatches, type CompiledRule, type LogHighlightSettings } from '@shared/log-highlight';

const SCAN_DEBOUNCE_MS = 50;
/** Linhas examinadas no máximo por varredura (saídas enormes não travam a UI). */
const MAX_LINES_PER_SCAN = 2000;

/**
 * Destaca padrões nas linhas concluídas usando decorations do xterm.js: camada visual por cima do
 * texto, sem alterar o buffer (cópia e busca continuam vendo o texto original).
 */
export class LogHighlighter {
  private rules: CompiledRule[] = [];
  private enabled = false;
  private nextLine = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly term: Terminal) {}

  configure(settings: LogHighlightSettings): void {
    this.enabled = settings.enabled;
    this.rules = compileRules(settings.rules).compiled;
    // Ao religar, só a saída nova é destacada.
    const buf = this.term.buffer.active;
    if (this.enabled) this.nextLine = buf.baseY + buf.cursorY;
  }

  schedule(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scan();
    }, SCAN_DEBOUNCE_MS);
  }

  private scan(): void {
    const buf = this.term.buffer.active;
    // Programas de tela cheia usam a tela alternativa: não é log.
    if (!this.enabled || buf.type !== 'normal') return;
    const cursorLine = buf.baseY + buf.cursorY;
    // Linha atual ainda pode crescer; buffer limpo (cls/reset) volta o contador.
    if (this.nextLine > cursorLine) this.nextLine = cursorLine;
    const from = Math.max(this.nextLine, cursorLine - MAX_LINES_PER_SCAN);
    for (let y = from; y < cursorLine; y++) {
      const text = buf.getLine(y)?.translateToString(true) ?? '';
      if (!text) continue;
      for (const m of findMatches(text, this.rules)) {
        const marker = this.term.registerMarker(y - cursorLine);
        if (!marker) continue;
        this.term.registerDecoration({
          marker,
          x: m.start,
          width: m.end - m.start,
          layer: 'top',
          ...(m.foreground ? { foregroundColor: m.foreground } : {}),
          ...(m.background ? { backgroundColor: m.background } : {}),
        });
      }
    }
    this.nextLine = cursorLine;
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
