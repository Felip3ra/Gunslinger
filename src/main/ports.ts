/**
 * Portas: o que os serviços precisam do mundo externo (Electron, SO), sem depender dele.
 * As implementações ficam em `adapters/`; nos testes, objetos simples cumprem o contrato.
 */

export interface FileFilter {
  name: string;
  extensions: string[];
}

export interface DialogPort {
  /** Caminho escolhido para salvar, ou null se o usuário cancelar. */
  saveFile(options: { title: string; defaultPath: string; filters: FileFilter[] }): Promise<string | null>;
  /** Arquivo escolhido para abrir, ou null. */
  openFile(options: { title: string; filters: FileFilter[] }): Promise<string | null>;
  /** Pasta escolhida, ou null. */
  openFolder(): Promise<string | null>;
  /** Pergunta com botões; devolve o índice do botão escolhido. */
  ask(options: { title: string; message: string; detail?: string; buttons: string[]; defaultId: number; cancelId: number }): Promise<number>;
}

export interface NotificationHandle {
  onClick(listener: () => void): void;
}

export interface NotifierPort {
  isSupported(): boolean;
  show(options: { title: string; body: string }): NotificationHandle;
}

export interface ClipboardPort {
  readText(): string;
  writeText(text: string): void;
}

export interface DesktopPort {
  /** Abre um arquivo com o programa padrão do SO; devolve mensagem de erro ou ''. */
  openPath(path: string): Promise<string>;
  /** Abre uma URL http(s) no navegador. */
  openExternal(url: string): Promise<void>;
}

/**
 * Cofre do sistema (DPAPI no Windows): cifra segredos ligados ao usuário do SO.
 * O texto cifrado só pode ser decifrado pela mesma conta, na mesma máquina.
 */
export interface SecretPort {
  isAvailable(): boolean;
  /** Texto cifrado em base64. */
  encrypt(plain: string): string;
  /** Lança se o texto não puder ser decifrado (outra conta, arquivo corrompido). */
  decrypt(cipherBase64: string): string;
}

/** A janela principal, vista pelos serviços. */
export interface WindowPort {
  isFocused(): boolean;
  /** Traz a janela para a frente (restaura se minimizada). */
  reveal(): void;
}
