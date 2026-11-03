import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal, type ITerminalOptions } from '@xterm/xterm';
import type { HighlightRule, LogHighlightSettings } from '@shared/log-highlight';
import type { Settings } from '@shared/model';
import { api } from '../api';
import { registerFileLinks } from './file-links';
import { handleClipboardKey } from './keyboard';
import { LogHighlighter } from './log-highlighter';
import { ShellIntegrationTracker, type BufferReader, type CommandEvent } from './shell-integration';

export type { CommandEvent } from './shell-integration';
export { parseOsc99 } from './shell-integration';

export interface TerminalCallbacks {
  onInput(data: string): void;
  onResize(cols: number, rows: number): void;
  onTitle(title: string): void;
  onCwd(cwd: string): void;
  onCommandStart(): void;
  onCommandEnd(event: CommandEvent): void;
  onNodeVersion(version: string): void;
}

interface Entry {
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  element: HTMLDivElement;
  integration: ShellIntegrationTracker;
  highlighter: LogHighlighter;
  sessionId: string | null;
  lastDataAt: number;
  disposed: boolean;
}

/** Converte as opções do settings.json no formato do xterm.js. */
export function terminalOptions(settings: Settings): ITerminalOptions {
  const { appearance } = settings;
  const [
    black,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    white,
    bBlack,
    bRed,
    bGreen,
    bYellow,
    bBlue,
    bMagenta,
    bCyan,
    bWhite,
  ] = appearance.theme.ansi;
  return {
    fontFamily: appearance.fontFamily,
    fontSize: appearance.fontSize,
    cursorStyle: appearance.cursorStyle,
    cursorBlink: true,
    scrollback: appearance.scrollback,
    allowProposedApi: true,
    macOptionIsMeta: false,
    altClickMovesCursor: false,
    theme: {
      background: appearance.theme.background,
      foreground: appearance.theme.foreground,
      cursor: appearance.theme.cursor,
      selectionBackground: appearance.theme.selection,
      black,
      red,
      green,
      yellow,
      blue,
      magenta,
      cyan,
      white,
      brightBlack: bBlack,
      brightRed: bRed,
      brightGreen: bGreen,
      brightYellow: bYellow,
      brightBlue: bBlue,
      brightMagenta: bMagenta,
      brightCyan: bCyan,
      brightWhite: bWhite,
    },
  };
}

/** Só http(s): URLs com outros esquemas nunca são abertas. */
function openUrl(event: MouseEvent, uri: string): void {
  if (!event.ctrlKey) return;
  if (!/^https?:\/\//i.test(uri)) return;
  void api.invoke('shell:openExternal', { url: uri });
}

function bufferReader(term: Terminal): BufferReader {
  return {
    cursor: () => ({
      x: term.buffer.active.cursorX,
      y: term.buffer.active.baseY + term.buffer.active.cursorY,
    }),
    lineText: (y, fromX = 0) => term.buffer.active.getLine(y)?.translateToString(true, fromX) ?? null,
    isWrapped: (y) => term.buffer.active.getLine(y)?.isWrapped ?? false,
  };
}

/** Instâncias do xterm.js por aba, fora da árvore React: ciclo de vida, saída do PTY e montagem no DOM. */
class TerminalRegistry {
  private readonly entries = new Map<string, Entry>();
  private copyOnCtrlC = true;
  private logHighlight: LogHighlightSettings | null = null;
  /** Regras de destaque contribuídas por plugins (somadas às do usuário). */
  private pluginRules: HighlightRule[] = [];

  private highlightConfig(): LogHighlightSettings {
    const base = this.logHighlight ?? { enabled: true, rules: [] };
    return { ...base, rules: [...base.rules, ...this.pluginRules] };
  }

  setPluginHighlightRules(rules: HighlightRule[]): void {
    this.pluginRules = rules;
    for (const entry of this.entries.values()) entry.highlighter.configure(this.highlightConfig());
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  create(key: string, settings: Settings, callbacks: TerminalCallbacks): Terminal {
    this.copyOnCtrlC = settings.terminal.copyOnCtrlCWithSelection;
    const term = new Terminal({
      ...terminalOptions(settings),
      linkHandler: { activate: openUrl, allowNonHttpProtocols: false },
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new Unicode11Addon());
    term.unicode.activeVersion = '11';
    term.loadAddon(new WebLinksAddon(openUrl));
    registerFileLinks(term, key);

    const element = document.createElement('div');
    element.className = 'terminal-instance';
    element.dataset['tabKey'] = key;

    const integration = new ShellIntegrationTracker(bufferReader(term), callbacks);
    const highlighter = new LogHighlighter(term);
    this.logHighlight = settings.logHighlight;
    highlighter.configure(this.highlightConfig());
    const entry: Entry = {
      term,
      fit,
      search,
      element,
      integration,
      highlighter,
      sessionId: null,
      lastDataAt: 0,
      disposed: false,
    };
    this.entries.set(key, entry);

    term.onData((data) => {
      if (data.includes('\r')) integration.enter();
      callbacks.onInput(data);
    });
    term.onResize(({ cols, rows }) => callbacks.onResize(cols, rows));
    term.onTitleChange((title) => callbacks.onTitle(title));
    term.attachCustomKeyEventHandler((e) => handleClipboardKey(term, e, this.copyOnCtrlC));
    term.parser.registerOscHandler(9, (data) => integration.osc9(data));
    term.parser.registerOscHandler(133, (data) => integration.osc133(data));
    term.parser.registerOscHandler(633, (data) => integration.osc633(data));
    return term;
  }

  /** Coloca o terminal no DOM (uma única vez) e liga o renderizador WebGL, com fallback para o DOM. */
  mount(key: string, host: HTMLElement): void {
    const entry = this.entries.get(key);
    if (!entry || entry.element.parentElement === host) return;
    host.appendChild(entry.element);
    if (!entry.term.element) {
      entry.term.open(entry.element);
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        entry.term.loadAddon(webgl);
      } catch {
        // sem WebGL: o renderizador DOM continua funcionando
      }
    }
  }

  setSession(key: string, sessionId: string | null): void {
    const entry = this.entries.get(key);
    if (entry) entry.sessionId = sessionId;
  }

  /** Escreve a saída do PTY e confirma os bytes processados (controle de fluxo). */
  write(key: string, data: string): void {
    const entry = this.entries.get(key);
    if (!entry || entry.disposed) return;
    entry.lastDataAt = performance.now();
    const sessionId = entry.sessionId;
    entry.term.write(data, () => {
      if (sessionId) api.send('pty:ack', { sessionId, bytes: data.length });
      entry.highlighter.schedule();
    });
  }

  fit(key: string): { cols: number; rows: number } | null {
    const entry = this.entries.get(key);
    if (!entry || !entry.term.element || entry.element.offsetParent === null) return null;
    try {
      entry.fit.fit();
    } catch {
      return null;
    }
    return { cols: entry.term.cols, rows: entry.term.rows };
  }

  dimensions(key: string): { cols: number; rows: number } {
    const entry = this.entries.get(key);
    return entry ? { cols: entry.term.cols, rows: entry.term.rows } : { cols: 80, rows: 24 };
  }

  focus(key: string): void {
    this.entries.get(key)?.term.focus();
  }

  reset(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.term.reset();
    entry.integration.reset();
  }

  paste(key: string, text: string): void {
    this.entries.get(key)?.term.paste(text);
  }

  /** Envia dados como se fossem digitados (passa pelo onData, inclusive a detecção de Enter). */
  input(key: string, data: string): void {
    this.entries.get(key)?.term.input(data, true);
  }

  /**
   * Espera o shell ficar pronto para receber um comando: marca 133;A da integração ou,
   * sem integração, 300 ms sem saída depois da primeira saída. Desiste após `timeoutMs`.
   */
  waitForPrompt(key: string, expectMarks: boolean, timeoutMs = 5000): Promise<void> {
    const entry = this.entries.get(key);
    if (!entry || entry.integration.isPromptReady) return Promise.resolve();
    return new Promise((resolve) => {
      const started = performance.now();
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearInterval(timer);
        resolve();
      };
      entry.integration.onPromptReady(finish);
      const timer = setInterval(() => {
        const now = performance.now();
        const quiet =
          entry.lastDataAt > 0 && now - entry.lastDataAt > 300 && !entry.integration.hasCommandStartMark;
        if (now - started > timeoutMs || (quiet && !expectMarks)) finish();
      }, 50);
    });
  }

  isPromptReady(key: string): boolean {
    return this.entries.get(key)?.integration.isPromptReady ?? false;
  }

  get(key: string): Terminal | undefined {
    return this.entries.get(key)?.term;
  }

  searchAddon(key: string): SearchAddon | undefined {
    return this.entries.get(key)?.search;
  }

  applySettings(settings: Settings): void {
    this.copyOnCtrlC = settings.terminal.copyOnCtrlCWithSelection;
    this.logHighlight = settings.logHighlight;
    const opts = terminalOptions(settings);
    for (const entry of this.entries.values()) {
      entry.term.options.fontFamily = opts.fontFamily!;
      entry.term.options.fontSize = opts.fontSize!;
      entry.term.options.cursorStyle = opts.cursorStyle!;
      entry.term.options.scrollback = opts.scrollback!;
      entry.term.options.theme = opts.theme!;
      entry.highlighter.configure(this.highlightConfig());
    }
  }

  dispose(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.disposed = true;
    entry.highlighter.dispose();
    entry.term.dispose();
    entry.element.remove();
    this.entries.delete(key);
  }
}

export const terminals = new TerminalRegistry();
