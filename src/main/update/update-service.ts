import { UPDATE_FIRST_CHECK_MS, UPDATE_INTERVAL_MS, type UpdateStatus } from '@shared/update';

/** O que o serviço precisa do atualizador (electron-updater no app instalado). */
export interface UpdaterPort {
  currentVersion(): string;
  /** Versão nova disponível, ou null se a atual já é a mais recente. */
  check(): Promise<string | null>;
  download(onProgress: (percent: number) => void): Promise<void>;
  /** Fecha o app e roda o instalador baixado. */
  quitAndInstall(): void;
}

export interface UpdateServiceDeps {
  /** null quando o app não foi instalado pelo instalador (dev, testes). */
  updater: UpdaterPort | null;
  currentVersion: string;
  auto(): boolean;
  onChange(status: UpdateStatus): void;
  now?: () => number;
}

/**
 * Verifica e baixa atualizações. Com `auto`, verifica 15 s depois de abrir e a cada 4 h;
 * a verificação manual sempre baixa o que encontrar. A instalação acontece ao reiniciar ou fechar.
 */
export class UpdateService {
  private current: UpdateStatus;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(private readonly deps: UpdateServiceDeps) {
    const currentVersion = deps.currentVersion;
    this.current = deps.updater ? { state: 'idle', currentVersion, checkedAt: null } : { state: 'unsupported', currentVersion };
  }

  status(): UpdateStatus {
    return this.current;
  }

  start(): void {
    if (!this.deps.updater) return;
    this.schedule(UPDATE_FIRST_CHECK_MS);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Verifica agora (botão "Procurar atualizações"). Não repete uma verificação em andamento. */
  check(): Promise<void> {
    if (!this.deps.updater || this.current.state === 'ready') return Promise.resolve();
    this.running ??= this.run(this.deps.updater).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  /** Reinicia instalando a versão baixada. */
  install(): void {
    if (this.current.state === 'ready') this.deps.updater?.quitAndInstall();
  }

  private schedule(delay: number): void {
    this.stop();
    this.timer = setTimeout(() => {
      this.timer = null;
      const next = (): void => this.schedule(UPDATE_INTERVAL_MS);
      if (this.deps.auto()) void this.check().then(next);
      else next();
    }, delay);
  }

  private async run(updater: UpdaterPort): Promise<void> {
    const currentVersion = this.deps.currentVersion;
    this.set({ state: 'checking', currentVersion });
    try {
      const version = await updater.check();
      if (!version) {
        this.set({ state: 'idle', currentVersion, checkedAt: (this.deps.now ?? Date.now)() });
        return;
      }
      this.set({ state: 'downloading', currentVersion, version, percent: 0 });
      await updater.download((percent) => this.set({ state: 'downloading', currentVersion, version, percent: Math.round(percent) }));
      this.set({ state: 'ready', currentVersion, version });
    } catch (err) {
      this.set({ state: 'error', currentVersion, message: describeError(err) });
    }
  }

  private set(status: UpdateStatus): void {
    this.current = status;
    this.deps.onChange(status);
  }
}

/** Mensagem curta: o electron-updater devolve o corpo inteiro da resposta HTTP nos erros. */
export function describeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|net::ERR_/i.test(message)) return 'Sem conexão com o GitHub.';
  if (/\b404\b/.test(message)) return 'Nenhuma versão publicada encontrada.';
  const first = message.split('\n')[0]!.trim();
  return first.length > 160 ? first.slice(0, 157) + '…' : first;
}
