import { StringDecoder } from 'node:string_decoder';
import type { ClientChannel } from 'ssh2';
import type { SshStage, SshTarget } from '@shared/ssh';
import type { TerminalBackend } from '../pty/terminal-backend';
import type { SshConnectionPool, SshHandle } from './connection-pool';

/** Código de saída de uma sessão SSH que não terminou pelo `exit` do shell remoto. */
export const SSH_EXIT_DISCONNECTED = -1;
/** Espera pelo motivo da queda (chega pela conexão, depois do fim do canal). */
const DROP_REASON_WAIT_MS = 100;

/**
 * Shell remoto como backend de terminal. Conecta ao chamar `start` (pelo pool, que pode pedir
 * credenciais); enquanto isso, escritas são descartadas e o tamanho fica guardado.
 */
export class SshShellBackend implements TerminalBackend {
  readonly pid = null;
  private dataListener: (data: string) => void = () => {};
  private exitListener: (code: number) => void = () => {};
  private channel: ClientChannel | null = null;
  private handle: SshHandle | null = null;
  private killed = false;
  private exited = false;
  private exitCode: number | null = null;

  constructor(
    private readonly pool: Pick<SshConnectionPool, 'acquire'>,
    private readonly target: SshTarget,
    private cols: number,
    private rows: number,
    private readonly onState: (stage: SshStage, message: string | null) => void,
    /** Fechar a aba durante a conexão descarta as perguntas pendentes (fingerprint, senha). */
    private readonly onCancelConnecting: () => void = () => {},
  ) {}

  async start(): Promise<void> {
    let handle: SshHandle;
    try {
      handle = await this.pool.acquire(this.target, (stage, message) => {
        if (!this.killed && stage !== 'connected') this.onState(stage, message);
      });
    } catch (err) {
      this.onState('failed', err instanceof Error ? err.message : String(err));
      this.finish(SSH_EXIT_DISCONNECTED);
      return;
    }
    if (this.killed) {
      handle.release();
      return;
    }
    this.handle = handle;
    let channel: ClientChannel;
    try {
      channel = await new Promise<ClientChannel>((resolve, reject) =>
        handle.client.shell({ term: 'xterm-256color', cols: this.cols, rows: this.rows }, (err, stream) => (err ? reject(err) : resolve(stream))),
      );
    } catch (err) {
      handle.release();
      this.onState('failed', `O servidor recusou abrir o shell: ${err instanceof Error ? err.message : String(err)}`);
      this.finish(SSH_EXIT_DISCONNECTED);
      return;
    }
    if (this.killed) {
      channel.close();
      handle.release();
      return;
    }
    this.channel = channel;
    this.onState('connected', null);

    const out = new StringDecoder('utf8');
    const err = new StringDecoder('utf8');
    channel.on('data', (chunk: Buffer) => this.emit(out.write(chunk)));
    channel.stderr.on('data', (chunk: Buffer) => this.emit(err.write(chunk)));
    channel.on('exit', (code: number | null) => {
      if (typeof code === 'number') this.exitCode = code;
    });
    // Queda da conexão (keepalive, rede): o motivo vem do pool, às vezes logo depois do fim do canal.
    let dropReason: string | null = null;
    handle.onClose((reason) => {
      dropReason = reason;
    });
    channel.on('close', () => {
      this.emit(out.end() + err.end());
      if (this.exitCode !== null || this.killed) {
        handle.release();
        this.finish(this.exitCode ?? SSH_EXIT_DISCONNECTED);
        return;
      }
      setTimeout(() => {
        handle.release();
        this.onState('closed', dropReason ?? 'a conexão foi encerrada');
        this.finish(SSH_EXIT_DISCONNECTED);
      }, DROP_REASON_WAIT_MS);
    });
  }

  write(data: string): void {
    this.channel?.write(data);
  }

  resize(cols: number, rows: number): void {
    this.cols = cols;
    this.rows = rows;
    this.channel?.setWindow(rows, cols, 0, 0);
  }

  pause(): void {
    this.channel?.pause();
  }

  resume(): void {
    this.channel?.resume();
  }

  kill(): void {
    if (this.killed) return;
    this.killed = true;
    if (this.channel) {
      this.channel.close();
    } else {
      // Ainda conectando: a sessão some agora; o uso da conexão é devolvido quando o acquire terminar.
      this.onCancelConnecting();
      this.finish(SSH_EXIT_DISCONNECTED);
    }
  }

  onData(listener: (data: string) => void): void {
    this.dataListener = listener;
  }

  onExit(listener: (code: number) => void): void {
    this.exitListener = listener;
  }

  private emit(text: string): void {
    if (text) this.dataListener(text);
  }

  private finish(code: number): void {
    if (this.exited) return;
    this.exited = true;
    this.exitListener(code);
  }
}
