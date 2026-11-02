import type { NotifierPort, WindowPort } from '../ports';

export interface LongCommand {
  sessionId: string;
  command: string;
  durationMs: number;
  exitCode?: number | null | undefined;
}

export interface LongCommandSettings {
  enabled: boolean;
  thresholdSeconds: number;
}

/** Notifica comandos demorados que terminaram com a janela fora de foco. */
export class LongCommandNotifier {
  constructor(
    private readonly notifier: NotifierPort,
    private readonly window: WindowPort,
    private readonly settings: () => LongCommandSettings,
    private readonly onActivate: (sessionId: string) => void,
  ) {}

  /** Devolve true quando uma notificação foi mostrada. */
  notify(cmd: LongCommand): boolean {
    const { enabled, thresholdSeconds } = this.settings();
    if (!enabled || cmd.durationMs < thresholdSeconds * 1000 || this.window.isFocused() || !this.notifier.isSupported()) return false;
    const seconds = Math.round(cmd.durationMs / 1000);
    const short = cmd.command.length > 60 ? cmd.command.slice(0, 57) + '…' : cmd.command || 'Comando';
    const failed = cmd.exitCode !== undefined && cmd.exitCode !== null && cmd.exitCode !== 0;
    const handle = this.notifier.show({
      title: failed ? `${short} falhou (código ${cmd.exitCode})` : `${short} concluído em ${seconds} s`,
      body: failed ? `Duração: ${seconds} s` : 'Clique para abrir a aba.',
    });
    handle.onClick(() => {
      this.window.reveal();
      this.onActivate(cmd.sessionId);
    });
    return true;
  }
}
