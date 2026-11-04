import { connect as netConnect, type AddressInfo } from 'node:net';
import { Server, utils, type AuthContext, type Connection, type ServerChannel } from 'ssh2';

/** Servidor SSH de teste (só para testes unitários e e2e). */
export interface TestServerOptions {
  username?: string;
  password?: string;
  /** Chave pública autorizada (linha OpenSSH). */
  authorizedKey?: string;
  /** Pede um código depois da senha (keyboard-interactive). */
  otp?: string;
  /** Usa keyboard-interactive para a senha, como o PAM. */
  passwordViaKeyboard?: boolean;
  hostKey?: string;
  /** Aceita encaminhamento TCP (direct-tcpip), para servir de host de salto. */
  allowForwarding?: boolean;
  /** Algoritmos oferecidos pelo servidor (para testar recusa de algoritmos fracos). */
  algorithms?: ConstructorParameters<typeof Server>[0]['algorithms'];
}

export interface TestServer {
  port: number;
  hostKey: string;
  /** Métodos de autenticação que o cliente tentou (inclui "none"). */
  authAttempts: string[];
  /** Linhas recebidas pelo shell. */
  received: string[];
  /** Encerra todas as conexões abertas (simula queda). */
  dropAll(): void;
  close(): Promise<void>;
}

export async function startTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const username = options.username ?? 'deploy';
  const hostKey = options.hostKey ?? utils.generateKeyPairSync('ed25519').private;
  const authorized = options.authorizedKey ? utils.parseKey(options.authorizedKey) : null;
  const authAttempts: string[] = [];
  const received: string[] = [];
  const clients = new Set<Connection>();

  const server = new Server({ hostKeys: [hostKey], ...(options.algorithms ? { algorithms: options.algorithms } : {}) }, (client) => {
    clients.add(client);
    client.on('close', () => clients.delete(client));
    client.on('error', () => undefined);
    let passwordOk = false;
    client.on('authentication', (ctx: AuthContext) => {
      authAttempts.push(ctx.method);
      if (ctx.username !== username) return ctx.reject();
      const methods: ('password' | 'publickey' | 'keyboard-interactive')[] = [];
      if (options.password && !options.passwordViaKeyboard) methods.push('password');
      if (authorized) methods.push('publickey');
      if (options.otp || options.passwordViaKeyboard) methods.push('keyboard-interactive');
      switch (ctx.method) {
        case 'password':
          if (!options.passwordViaKeyboard && ctx.password === options.password) {
            if (options.otp) {
              passwordOk = true;
              return ctx.reject(['keyboard-interactive'], true);
            }
            return ctx.accept();
          }
          return ctx.reject(methods);
        case 'publickey': {
          const key = Array.isArray(authorized) ? authorized[0] : authorized;
          if (!key || key instanceof Error || ctx.key.algo !== key.type || !ctx.key.data.equals(key.getPublicSSH())) return ctx.reject(methods);
          if (!ctx.signature) return ctx.accept();
          return key.verify(ctx.blob!, ctx.signature, ctx.hashAlgo) ? ctx.accept() : ctx.reject(methods);
        }
        case 'keyboard-interactive': {
          if (options.passwordViaKeyboard && !passwordOk) {
            return ctx.prompt([{ prompt: 'Password: ', echo: false }], (answers) => {
              if (answers[0] !== options.password) return ctx.reject(methods);
              if (!options.otp) return ctx.accept();
              passwordOk = true;
              ctx.prompt([{ prompt: 'Verification code: ', echo: false }], (codes) => (codes[0] === options.otp ? ctx.accept() : ctx.reject(methods)));
            });
          }
          if (options.otp && passwordOk) {
            return ctx.prompt([{ prompt: 'Verification code: ', echo: false }], (codes) => (codes[0] === options.otp ? ctx.accept() : ctx.reject(methods)));
          }
          return ctx.reject(methods);
        }
        default:
          return ctx.reject(methods);
      }
    });
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('pty', (acceptPty) => acceptPty?.());
        session.on('window-change', (acceptChange) => acceptChange?.());
        session.on('shell', (acceptShell) => {
          const stream: ServerChannel = acceptShell();
          stream.write('bem-vindo\r\n$ ');
          let line = '';
          stream.on('data', (chunk: Buffer) => {
            for (const ch of chunk.toString('utf8')) {
              if (ch === '\r') {
                received.push(line);
                if (line === 'exit') {
                  stream.exit(0);
                  stream.end();
                  return;
                }
                stream.write(`\r\nvocê disse: ${line}\r\n$ `);
                line = '';
              } else {
                line += ch;
                stream.write(ch);
              }
            }
          });
        });
      });
      if (options.allowForwarding) {
        client.on('tcpip', (accept, reject, info) => {
          const socket = netConnect(info.destPort, info.destIP);
          socket.on('connect', () => {
            const channel = accept();
            channel.pipe(socket).pipe(channel);
          });
          socket.on('error', () => reject?.());
        });
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    hostKey,
    authAttempts,
    received,
    dropAll: () => {
      for (const c of clients) c.end();
    },
    close: () =>
      new Promise((resolve) => {
        for (const c of clients) c.end();
        server.close(() => resolve());
      }),
  };
}

/** Blob da chave pública do servidor (base64), como o cliente a vê. */
export function hostKeyBlob(privateKey: string): { keyType: string; key: string } {
  const parsed = utils.parseKey(privateKey);
  const key = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!key || key instanceof Error) throw new Error('chave inválida');
  return { keyType: key.type, key: key.getPublicSSH().toString('base64') };
}
