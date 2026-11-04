import type { AnyAuthMethod, AuthenticationType, AuthHandlerMiddleware, Client, ClientChannel, ConnectConfig, KeyboardInteractiveAuthMethod, NextAuthHandler } from 'ssh2';
import type { HostsFile, SaveResult, SshSettings } from '@shared/model';
import { formatTarget, resolveHost } from '@shared/ssh-hosts';
import { isPasswordPrompt, translateSshError, type SshAnswer, type SshPrompt, type SshStage, type SshTarget } from '@shared/ssh';
import { agentPath, SSH_ALGORITHMS } from './algorithms';
import { parsePrivateKey } from './key-codec';
import type { KeychainService } from './keychain-service';
import { fingerprintOfBase64, type KnownHostsService } from './known-hosts-service';
import type { PromptBroker } from './prompt-broker';

const KEEPALIVE_COUNT_MAX = 3;
const MAX_PASSWORD_TRIES = 3;
const MAX_PASSPHRASE_TRIES = 3;

export interface PoolDeps {
  createClient(): Client;
  hostsFile(): HostsFile;
  settings(): SshSettings;
  keychain: Pick<KeychainService, 'loadKeyMaterial' | 'identityCredentials' | 'setKeyPassphrase' | 'rememberPassword'>;
  knownHosts: Pick<KnownHostsService, 'check' | 'accept' | 'replace'>;
  prompts: Pick<PromptBroker, 'ask' | 'cancelGroup'>;
  /** Liga ao host a identidade criada ao salvar a senha. */
  linkIdentity(hostId: string, identityId: string): Promise<SaveResult>;
}

/** Falha ao conectar, com a mensagem já em português. */
export class SshConnectError extends Error {
  constructor(
    message: string,
    readonly cancelled = false,
  ) {
    super(message);
  }
}

export type StageListener = (stage: SshStage, message: string | null) => void;

/** Um uso da conexão (aba, SFTP, túnel). `release` fecha a conexão quando ninguém mais a usa. */
export interface SshHandle {
  readonly client: Client;
  /** `usuário@endereço[:porta]`. */
  readonly label: string;
  readonly key: string;
  onClose(listener: (reason: string | null) => void): () => void;
  release(): void;
}

interface Connection {
  key: string;
  client: Client;
  label: string;
  uses: number;
  jump: SshHandle | null;
  closed: boolean;
  listeners: Set<(reason: string | null) => void>;
}

interface Spec {
  hostId: string | null;
  name: string;
  address: string;
  port: number;
  username: string | null;
  keyId: string | null;
  identityId: string | null;
  jumpHostId: string | null;
  keepaliveSec: number;
  agentForward: boolean;
}

export function targetKey(target: SshTarget): string {
  return target.kind === 'host' ? `host:${target.hostId}` : `quick:${target.username ?? ''}@${target.address}:${target.port}`;
}

/** Tipo da chave do servidor, lido do início do blob (string SSH com prefixo de tamanho). */
export function hostKeyType(blob: Buffer): string {
  if (blob.length < 4) return 'desconhecido';
  const len = blob.readUInt32BE(0);
  return len > 0 && len < 64 && blob.length >= 4 + len ? blob.subarray(4, 4 + len).toString('ascii') : 'desconhecido';
}

function forwardOut(client: Client, address: string, port: number): Promise<ClientChannel> {
  return new Promise((resolve, reject) => client.forwardOut('127.0.0.1', 0, address, port, (err, stream) => (err ? reject(err) : resolve(stream))));
}

/**
 * Uma conexão por host, compartilhada por abas, SFTP e túneis. Pedidos simultâneos ao mesmo host
 * esperam a mesma tentativa (verificação e autenticação uma vez só). Saltos são conexões do pool.
 */
export class SshConnectionPool {
  private readonly live = new Map<string, Connection>();
  private readonly connecting = new Map<string, Promise<Connection>>();

  constructor(private readonly deps: PoolDeps) {}

  async acquire(target: SshTarget, onStage: StageListener = () => {}): Promise<SshHandle> {
    const key = targetKey(target);
    const live = this.live.get(key);
    if (live && !live.closed) return this.handle(live);
    let pending = this.connecting.get(key);
    if (pending) {
      onStage('connecting', null);
    } else {
      pending = this.open(key, target, onStage).finally(() => this.connecting.delete(key));
      this.connecting.set(key, pending);
    }
    return this.handle(await pending);
  }

  /** Quantos usos a conexão do host tem (0 sem conexão). */
  usesOf(target: SshTarget): number {
    const conn = this.live.get(targetKey(target));
    return conn && !conn.closed ? conn.uses : 0;
  }

  closeAll(): void {
    for (const conn of [...this.live.values()]) this.close(conn, null);
  }

  private handle(conn: Connection): SshHandle {
    conn.uses++;
    let released = false;
    return {
      client: conn.client,
      label: conn.label,
      key: conn.key,
      onClose: (listener) => {
        conn.listeners.add(listener);
        return () => conn.listeners.delete(listener);
      },
      release: () => {
        if (released) return;
        released = true;
        conn.uses--;
        if (conn.uses <= 0) this.close(conn, null);
      },
    };
  }

  private close(conn: Connection, reason: string | null): void {
    if (conn.closed) return;
    conn.closed = true;
    if (this.live.get(conn.key) === conn) this.live.delete(conn.key);
    try {
      conn.client.end();
    } catch {
      // já encerrado
    }
    conn.jump?.release();
    for (const l of [...conn.listeners]) l(reason);
  }

  private resolve(target: SshTarget): Spec {
    if (target.kind === 'quick') {
      return {
        hostId: null,
        name: formatTarget(target.username, target.address, target.port),
        address: target.address,
        port: target.port,
        username: target.username,
        keyId: null,
        identityId: null,
        jumpHostId: null,
        keepaliveSec: this.deps.settings().keepaliveSec,
        agentForward: false,
      };
    }
    const file = this.deps.hostsFile();
    const host = file.hosts.find((h) => h.id === target.hostId);
    if (!host) throw new SshConnectError('Host não encontrado.');
    const r = resolveHost(host, file.groups, { keepaliveSec: this.deps.settings().keepaliveSec });
    return { hostId: host.id, ...r };
  }

  private async open(key: string, target: SshTarget, onStage: StageListener): Promise<Connection> {
    const spec = this.resolve(target);
    let jump: SshHandle | null = null;
    try {
      let sock: ClientChannel | undefined;
      if (spec.jumpHostId) {
        const jumpHost = this.deps.hostsFile().hosts.find((h) => h.id === spec.jumpHostId);
        if (!jumpHost) throw new SshConnectError('O host de salto não existe mais.');
        onStage('jump', `Conectando pelo host de salto ${jumpHost.name}`);
        jump = await this.acquire({ kind: 'host', hostId: jumpHost.id }, (stage, message) => {
          if (stage !== 'connected') onStage('jump', message ?? `Conectando pelo host de salto ${jumpHost.name}`);
        });
        try {
          sock = await forwardOut(jump.client, spec.address, spec.port);
        } catch (err) {
          throw new SshConnectError(translateSshError({ message: err instanceof Error ? err.message : String(err) }, spec));
        }
      }
      const conn = await new ConnectAttempt(this.deps, key, spec, onStage, sock).run();
      conn.jump = jump;
      this.live.set(key, conn);
      conn.client.on('close', () => this.close(conn, conn.closeReason()));
      onStage('connected', null);
      return conn;
    } catch (err) {
      jump?.release();
      this.deps.prompts.cancelGroup(key);
      throw err instanceof SshConnectError ? err : new SshConnectError(err instanceof Error ? err.message : String(err));
    }
  }
}

type LiveConnection = Connection & { closeReason(): string | null };

/** Uma tentativa de conexão: verificação do servidor, ordem de autenticação e perguntas ao usuário. */
class ConnectAttempt {
  private failure: SshConnectError | null = null;
  private lastError: { code?: string; level?: string; message: string } | null = null;
  private pendingPassphrase: { keyId: string; value: string } | null = null;
  private pendingPassword: string | null = null;
  private username = '';
  private label: string;

  constructor(
    private readonly deps: PoolDeps,
    private readonly group: string,
    private readonly spec: Spec,
    private readonly onStage: StageListener,
    private readonly sock: ClientChannel | undefined,
  ) {
    this.label = spec.name;
  }

  private ask(prompt: SshPrompt): Promise<SshAnswer | null> {
    return this.deps.prompts.ask(this.group, this.label, prompt);
  }

  private cancel(message = 'Conexão cancelada'): void {
    this.failure ??= new SshConnectError(message, true);
  }

  async run(): Promise<LiveConnection> {
    const { spec, deps } = this;
    const identity = spec.identityId ? deps.keychain.identityCredentials(spec.identityId) : null;
    let username = spec.username ?? identity?.username ?? null;
    if (!username) {
      const answer = await this.ask({ kind: 'username' });
      if (!answer || answer.kind !== 'text' || !answer.value.trim()) throw new SshConnectError('Conexão cancelada', true);
      username = answer.value.trim();
    }
    this.username = username;
    this.label = formatTarget(username, spec.address, spec.port);
    const keyId = spec.keyId ?? identity?.keyId ?? null;
    const settings = deps.settings();
    const agent = agentPath(settings.agent);

    const client = deps.createClient();
    this.onStage('connecting', null);
    const config: ConnectConfig = {
      host: spec.address,
      port: spec.port,
      username,
      ...(this.sock ? { sock: this.sock } : {}),
      readyTimeout: settings.connectTimeoutSec * 1000,
      keepaliveInterval: spec.keepaliveSec * 1000,
      keepaliveCountMax: KEEPALIVE_COUNT_MAX,
      algorithms: SSH_ALGORITHMS,
      hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
        this.onStage('verifying', null);
        void this.verifyHostKey(key).then(verify, () => verify(false));
      },
      authHandler: this.authHandler(keyId, identity?.password ?? null, agent),
      ...(agent && spec.agentForward ? { agent, agentForward: true } : {}),
    };

    await new Promise<void>((resolve, reject) => {
      client.on('ready', () => resolve());
      client.on('error', (err: Error & { level?: string; code?: string }) => {
        // Falha do agente: o ssh2 segue para o próximo método.
        if (err.level === 'agent') return;
        this.lastError = { message: err.message, ...(err.code ? { code: err.code } : {}), ...(err.level ? { level: err.level } : {}) };
        reject(err);
      });
      client.on('close', () => reject(new Error('A conexão foi encerrada antes de ficar pronta.')));
      try {
        client.connect(config);
      } catch (err) {
        reject(err);
      }
    }).catch((err: unknown) => {
      try {
        client.end();
      } catch {
        // já encerrado
      }
      if (this.failure) throw this.failure;
      const info = this.lastError ?? { message: err instanceof Error ? err.message : String(err) };
      throw new SshConnectError(translateSshError(info, spec));
    });

    await this.persistSaves();
    let lastRuntimeError: string | null = null;
    client.on('error', (err: Error & { level?: string; code?: string }) => {
      if (err.level === 'agent') return;
      lastRuntimeError = translateSshError({ message: err.message, ...(err.code ? { code: err.code } : {}), ...(err.level ? { level: err.level } : {}) }, spec);
    });
    return {
      key: this.group,
      client,
      label: this.label,
      uses: 0,
      jump: null,
      closed: false,
      listeners: new Set(),
      closeReason: () => lastRuntimeError,
    };
  }

  private async verifyHostKey(blob: Buffer): Promise<boolean> {
    const { spec, deps } = this;
    const presented = { host: spec.address, port: spec.port, keyType: hostKeyType(blob), key: blob.toString('base64') };
    const fingerprint = fingerprintOfBase64(presented.key);
    const check = deps.knownHosts.check(presented);
    switch (check.status) {
      case 'known':
        return true;
      case 'unknown': {
        const answer = await this.ask({ kind: 'hostKey-new', host: spec.address, port: spec.port, keyType: presented.keyType, fingerprint });
        if (answer?.kind === 'hostKey' && answer.decision === 'trust') {
          const saved = await deps.knownHosts.accept(presented);
          if (!saved.ok) {
            this.cancel(`Não foi possível gravar a chave do servidor: ${saved.error}`);
            return false;
          }
          return true;
        }
        if (answer?.kind === 'hostKey' && answer.decision === 'once') return true;
        this.cancel();
        return false;
      }
      case 'changed': {
        const previous = check.entries.map((e) => fingerprintOfBase64(e.key));
        const answer = await this.ask({ kind: 'hostKey-changed', host: spec.address, port: spec.port, keyType: presented.keyType, fingerprint, previous });
        if (answer?.kind === 'hostKey' && answer.decision === 'replace') {
          const saved = await deps.knownHosts.replace(presented);
          if (saved.ok) return true;
          this.cancel(saved.error);
          return false;
        }
        this.cancel('A chave do servidor mudou; conexão bloqueada.');
        return false;
      }
      case 'revoked':
        void this.ask({ kind: 'hostKey-revoked', host: spec.address, port: spec.port, keyType: presented.keyType, fingerprint });
        this.cancel('Esta chave do servidor foi revogada; conexão bloqueada.');
        return false;
    }
  }

  /** Ordem: chave configurada → agente → senha salva → senha pedida → keyboard-interactive. */
  private authHandler(keyId: string | null, savedPassword: string | null, agent: string | null): AuthHandlerMiddleware {
    type Attempt = { method: 'publickey' | 'password' | 'keyboard-interactive'; build(): Promise<AnyAuthMethod | null> };
    const username = (): string => this.username;
    const attempts: Attempt[] = [];
    if (keyId) attempts.push({ method: 'publickey', build: () => this.keyAuth(keyId) });
    if (agent) attempts.push({ method: 'publickey', build: async () => ({ type: 'agent', username: username(), agent }) });
    if (savedPassword) attempts.push({ method: 'password', build: async () => ({ type: 'password', username: username(), password: savedPassword }) });
    for (let i = 0; i < MAX_PASSWORD_TRIES; i++) {
      attempts.push({ method: 'password', build: () => this.passwordAuth(i > 0 || savedPassword !== null) });
    }
    attempts.push({ method: 'keyboard-interactive', build: async () => ({ type: 'keyboard-interactive', username: username(), prompt: this.keyboardInteractive(savedPassword) }) });

    let index = 0;
    let started = false;
    // O ssh2 chama com authsLeft null na primeira vez (os tipos dizem o contrário).
    return ((methodsLeft: AuthenticationType[] | null, _partial: boolean | null, next: NextAuthHandler) => {
      if (!started) {
        started = true;
        this.onStage('authenticating', null);
        // Primeiro "none", como o OpenSSH: a resposta diz quais métodos o servidor aceita.
        if (methodsLeft === null) return next({ type: 'none', username: username() });
      }
      void (async () => {
        while (index < attempts.length && !this.failure) {
          const attempt = attempts[index++]!;
          if (methodsLeft && !methodsLeft.includes(attempt.method)) continue;
          const auth = await attempt.build();
          if (this.failure) break;
          if (auth) return next(auth);
        }
        // false: sem mais métodos (o ssh2 encerra com falha de autenticação).
        next(false as unknown as AuthenticationType);
      })();
    }) as AuthHandlerMiddleware;
  }

  private async keyAuth(keyId: string): Promise<AnyAuthMethod | null> {
    const material = await this.deps.keychain.loadKeyMaterial(keyId);
    if (!material.ok) {
      this.onStage('authenticating', material.error);
      return null;
    }
    let passphrase = material.passphrase ?? undefined;
    if (material.encrypted && (!passphrase || !parsePrivateKey(material.privateKey, passphrase).ok)) {
      passphrase = undefined;
      for (let i = 0; i < MAX_PASSPHRASE_TRIES && passphrase === undefined; i++) {
        const answer = await this.ask({ kind: 'passphrase', keyName: material.name, canSave: true, retry: i > 0 });
        if (!answer || answer.kind !== 'text') {
          this.cancel();
          return null;
        }
        if (parsePrivateKey(material.privateKey, answer.value).ok) {
          passphrase = answer.value;
          if (answer.save) this.pendingPassphrase = { keyId, value: answer.value };
        }
      }
      if (passphrase === undefined) return null;
    }
    return { type: 'publickey', username: this.username, key: material.privateKey, ...(passphrase ? { passphrase } : {}) };
  }

  private async passwordAuth(retry: boolean): Promise<AnyAuthMethod | null> {
    const answer = await this.ask({ kind: 'password', username: this.username, canSave: this.spec.hostId !== null, retry });
    if (!answer || answer.kind !== 'text') {
      this.cancel();
      return null;
    }
    this.pendingPassword = answer.save && this.spec.hostId ? answer.value : null;
    return { type: 'password', username: this.username, password: answer.value };
  }

  private keyboardInteractive(savedPassword: string | null): KeyboardInteractiveAuthMethod['prompt'] {
    let usedSaved = false;
    return (name, instructions, _lang, prompts, finish) => {
      if (prompts.length === 0) return finish([]);
      const list = prompts.map((p) => ({ prompt: p.prompt, echo: p.echo ?? false }));
      // Senha via keyboard-interactive (PAM): usa a salva uma vez antes de perguntar.
      if (savedPassword && !usedSaved && isPasswordPrompt(list)) {
        usedSaved = true;
        return finish([savedPassword]);
      }
      const canSave = this.spec.hostId !== null && isPasswordPrompt(list);
      void this.ask({ kind: 'keyboard-interactive', username: this.username, name, instructions, prompts: list, canSave }).then((answer) => {
        if (!answer || answer.kind !== 'responses') {
          this.cancel();
          return finish([]);
        }
        if (canSave && answer.save) this.pendingPassword = answer.values[0] ?? null;
        finish(answer.values);
      });
    };
  }

  /** Grava o que o usuário pediu para salvar, só depois de a conexão dar certo. */
  private async persistSaves(): Promise<void> {
    const { deps, spec } = this;
    if (this.pendingPassphrase) await deps.keychain.setKeyPassphrase(this.pendingPassphrase.keyId, this.pendingPassphrase.value).catch(() => undefined);
    if (this.pendingPassword && spec.hostId) {
      const r = await deps.keychain
        .rememberPassword({ identityId: spec.identityId, username: this.username, name: this.label, password: this.pendingPassword })
        .catch(() => null);
      if (r?.ok && r.created) await deps.linkIdentity(spec.hostId, r.identityId).catch(() => undefined);
    }
  }
}
