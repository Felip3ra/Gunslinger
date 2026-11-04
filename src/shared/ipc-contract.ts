import type {
  ConfigSnapshot,
  CustomProfile,
  OpenResult,
  Project,
  ProjectAnalysis,
  ProfileOverride,
  SavedCommand,
  SaveResult,
  ShellProfile,
  StatusInfo,
  ToolStatus,
  UiState,
  NodePackage,
  Workspace,
  KeychainResult,
  KeychainSnapshot,
  KeychainUsage,
  KnownHostView,
  SecretChange,
  Host,
  HostGroup,
} from './model';
import type { SshAnswer, SshPromptEvent, SshSessionState, SshTarget } from './ssh';
import type { ElevationInfo } from './elevation';
import type { TestRunResult, TestTarget } from './test-results';
import type { DockerAction, DockerListResult } from './docker';
import type { ListeningPort } from './ports';
import type { HistoryEntry } from './history';
import type { PluginsSnapshot } from './plugins';
import type { UpdateStatus } from './update';
import type { WorkspaceLayout } from './model';
import type { ConflictDecision, ExportSelection, ImportPreview, ImportResult } from './transfer';

export type ToolName = 'dotnet' | 'dotnet-ef' | 'node' | 'npm' | 'yarn' | 'pnpm' | 'bun';

/** Processo iniciado pela aba que continua rodando fora da árvore dela. */
export interface DetachedProcess {
  pid: number;
  name: string;
}

/** Requisição/resposta: ipcRenderer.invoke ↔ ipcMain.handle. */
export interface InvokeMap {
  'profiles:list': { req: void; res: ShellProfile[] };
  'profiles:save': { req: CustomProfile; res: SaveResult };
  'profiles:delete': { req: { id: string }; res: SaveResult };
  'profiles:setOverride': { req: { id: string; override: ProfileOverride }; res: SaveResult };
  'pty:create': {
    req: { profileId: string; cwd?: string; projectId?: string; cols: number; rows: number; elevated?: boolean; envProfileId?: string };
    res: { sessionId: string; profileId: string; envGeneration: number; cwd: string; elevated: boolean };
  };
  'pty:restart': { req: { sessionId: string; cols: number; rows: number }; res: { sessionId: string; envGeneration: number } };
  'elevation:info': { req: void; res: ElevationInfo };
  /** Abre o shell elevado numa janela separada do Windows (UAC). */
  'elevation:openExternal': { req: { profileId: string; cwd?: string }; res: OpenResult };
  'pty:isBusy': { req: { sessionId: string }; res: boolean };
  /**
   * Encerra o shell e a árvore. `detached`: processos iniciados pela aba que saíram da árvore e
   * continuam rodando (com `detachedProcesses: 'ask'`); `pty:killDetached` com o token os encerra.
   */
  'pty:kill': { req: { sessionId: string }; res: { token: string | null; detached: DetachedProcess[] } };
  'pty:killDetached': { req: { token: string }; res: void };
  /** Abas e painéis abertos, gravados para a próxima abertura (ignorado durante o fechamento do app). */
  'session:save': { req: { tabs: WorkspaceLayout[] }; res: void };
  'profiles:pickIcon': { req: void; res: string | null };
  'update:status': { req: void; res: UpdateStatus };
  'update:check': { req: void; res: UpdateStatus };
  /** Fecha o app (com a confirmação de abas ocupadas) e instala a versão baixada. */
  'update:install': { req: void; res: void };
  'config:get': { req: void; res: ConfigSnapshot };
  'settings:update': { req: { path: (string | number)[]; value: unknown }; res: SaveResult };
  'settings:openFile': { req: void; res: OpenResult };
  'commands:save': { req: SavedCommand; res: SaveResult };
  'commands:delete': { req: { id: string }; res: SaveResult };
  'commands:renameCategory': { req: { from: string; to: string }; res: SaveResult };
  'workspaces:save': { req: Workspace; res: SaveResult };
  'workspaces:delete': { req: { id: string }; res: SaveResult };
  'projects:save': { req: Project; res: SaveResult };
  'projects:delete': { req: { id: string; linkedCommands: 'delete' | 'makeGlobal' }; res: SaveResult };
  /** Com projectId, o main passa a observar os package.json do projeto (evento project:packagesChanged). */
  'projects:analyze': { req: { root: string; projectId?: string }; res: ProjectAnalysis };
  'projects:pickFolder': { req: void; res: string | null };
  'tests:run': { req: { projectId: string; target: TestTarget; filter?: string[] }; res: { runId: string } };
  'tests:cancel': { req: { runId: string }; res: void };
  'plugins:get': { req: void; res: PluginsSnapshot };
  'plugins:reload': { req: void; res: PluginsSnapshot };
  'plugins:setEnabled': { req: { id: string; enabled: boolean }; res: SaveResult };
  'plugins:openFolder': { req: void; res: SaveResult };
  'history:list': { req: void; res: HistoryEntry[] };
  'history:create': { req: { label: string }; res: SaveResult };
  'history:restore': { req: { id: string }; res: SaveResult };
  'history:delete': { req: { id: string }; res: SaveResult };
  'ports:list': { req: void; res: ListeningPort[] };
  'ports:kill': { req: { pid: number }; res: SaveResult };
  'docker:list': { req: void; res: DockerListResult };
  'docker:action': { req: { id: string; action: DockerAction }; res: SaveResult };
  'tools:check': { req: { tool: ToolName; cwd: string }; res: ToolStatus };
  'env:reload': { req: void; res: { envGeneration: number } | { error: string } };
  'state:get': { req: void; res: UiState };
  'state:patch': { req: Partial<Omit<UiState, 'version'>>; res: void };
  'fs:statMany': { req: { paths: string[] }; res: boolean[] };
  /** useDefaultApp: abre com o programa padrão do Windows (alternativa quando o editor falha). */
  'editor:open': { req: { file: string; line?: number; column?: number; useDefaultApp?: boolean }; res: OpenResult };
  'shell:openExternal': { req: { url: string }; res: OpenResult };
  'clipboard:read': { req: void; res: string };
  'clipboard:write': { req: { text: string }; res: void };
  'notify:longCommand': {
    req: { sessionId: string; command: string; durationMs: number; exitCode?: number | null };
    res: void;
  };
  'transfer:export': { req: ExportSelection; res: { path: string } | null };
  'transfer:previewImport': { req: void; res: ImportPreview | { error: string } | null };
  'transfer:applyImport': { req: { previewId: string; decisions: ConflictDecision[] }; res: ImportResult };
  /** Keychain: só metadados e o estado dos segredos (nunca o segredo nem o id dele). */
  'keychain:get': { req: void; res: KeychainSnapshot };
  /** Escolhe um arquivo de chave privada (diálogo do sistema); null se cancelado. */
  'keychain:pickKeyFile': { req: void; res: string | null };
  'keychain:importKey': {
    req: { name: string; source: { kind: 'file'; path: string; mode: 'copy' | 'reference' } | { kind: 'text'; text: string }; passphrase?: string; savePassphrase: boolean };
    res: KeychainResult<{ keyId: string }>;
  };
  'keychain:generateKey': {
    req: { name: string; type: 'ed25519' | 'rsa'; comment?: string; passphrase?: string; savePassphrase: boolean };
    res: KeychainResult<{ keyId: string }>;
  };
  'keychain:renameKey': { req: { keyId: string; name: string }; res: SaveResult };
  'keychain:setKeyPassphrase': { req: { keyId: string; passphrase: string | null }; res: SaveResult };
  'keychain:saveIdentity': {
    req: { id?: string; name: string; username: string; keyId: string | null; password: SecretChange };
    res: KeychainResult<{ identityId: string }>;
  };
  'keychain:usage': { req: { kind: 'key' | 'identity'; id: string }; res: KeychainUsage };
  'keychain:delete': { req: { kind: 'key' | 'identity'; id: string }; res: SaveResult };
  'keychain:copyPublicKey': { req: { keyId: string }; res: SaveResult };
  /** Grava a chave num arquivo escolhido no diálogo; null se cancelado. */
  'keychain:exportKey': { req: { keyId: string; which: 'private' | 'public' }; res: SaveResult | null };
  'knownHosts:list': { req: void; res: KnownHostView[] };
  'knownHosts:delete': { req: { index: number }; res: SaveResult };
  /** Importa o ~/.ssh/known_hosts do usuário. */
  'knownHosts:importOpenSsh': { req: void; res: { ok: true; added: number; ignored: number } | { ok: false; error: string } };
  /** Hosts e grupos (a lista vem no snapshot da configuração, em `hosts`). */
  'hosts:save': { req: Host; res: SaveResult & { hostId?: string } };
  'hosts:duplicate': { req: { hostId: string }; res: SaveResult & { hostId?: string } };
  'hosts:delete': { req: { hostId: string }; res: SaveResult };
  /** Hosts e grupos que usam o host como salto (para avisar antes de excluir). */
  'hosts:jumpUsers': { req: { hostId: string }; res: string[] };
  'hosts:saveGroup': { req: HostGroup; res: SaveResult & { groupId?: string } };
  'hosts:groupContents': { req: { groupId: string }; res: { hosts: number; groups: number } };
  'hosts:deleteGroup': { req: { groupId: string; contents: 'moveUp' | 'deleteHosts' }; res: SaveResult };
  /** Prévia da importação do ~/.ssh/config (aplicada com transfer:applyImport). */
  'transfer:previewOpenSsh': { req: void; res: ImportPreview | { error: string } };
  /** Abre uma aba SSH: a sessão existe na hora; as etapas chegam por `ssh:state` e os dados por `pty:data`. */
  'ssh:connect': { req: { target: SshTarget; cols: number; rows: number }; res: { sessionId: string; label: string } };
  'ssh:reconnect': { req: { sessionId: string; cols: number; rows: number }; res: { sessionId: string; label: string } };
  /** Resposta a um `ssh:prompt`; false se a pergunta já não existe (respondida, expirada ou cancelada). */
  'ssh:answer': { req: { promptId: string; answer: SshAnswer }; res: boolean };
  'ssh:state': { req: { sessionId: string }; res: SshSessionState | null };
}

/** Fire-and-forget renderer → main (baixa latência). */
export interface SendMap {
  'pty:write': { sessionId: string; data: string };
  'pty:resize': { sessionId: string; cols: number; rows: number };
  'pty:ack': { sessionId: string; bytes: number };
  'session:state': {
    sessionId: string;
    cwd?: string;
    commandRunning?: boolean;
    lastExitCode?: number | null;
    commandFinished?: boolean;
  };
  'session:activate': { sessionId: string | null };
}

/** Eventos main → renderer. */
export interface EventMap {
  'pty:data': { sessionId: string; data: string };
  'pty:exit': { sessionId: string; exitCode: number };
  'config:changed': ConfigSnapshot;
  'profiles:changed': ShellProfile[];
  'status:changed': { sessionId: string; status: StatusInfo };
  'project:packagesChanged': { projectId: string; packages: NodePackage[] };
  'env:changed': { envGeneration: number };
  'notification:clicked': { sessionId: string };
  'tests:output': { runId: string; data: string };
  'plugins:changed': PluginsSnapshot;
  'update:changed': UpdateStatus;
  'tests:finished': { runId: string; result: TestRunResult | null; error: string | null; cancelled: boolean };
  'keychain:changed': KeychainSnapshot;
  'ssh:prompt': SshPromptEvent;
  /** A pergunta foi respondida, expirou ou foi cancelada pelo main: o diálogo fecha. */
  'ssh:promptClosed': { promptId: string };
  'ssh:state': SshSessionState;
}

export type InvokeChannel = keyof InvokeMap;
export type SendChannel = keyof SendMap;
export type EventChannel = keyof EventMap;
export type InvokeReq<K extends InvokeChannel> = InvokeMap[K]['req'];
export type InvokeRes<K extends InvokeChannel> = InvokeMap[K]['res'];

/** Erro tipado devolvido pelo main quando a requisição é rejeitada. */
export interface IpcError {
  code: 'invalid-args' | 'not-found' | 'failed';
  message: string;
}

/** API exposta em window.gunslinger pelo preload. */
export interface GunslingerApi {
  invoke<K extends InvokeChannel>(channel: K, ...req: InvokeReq<K> extends void ? [] : [InvokeReq<K>]): Promise<InvokeRes<K>>;
  send<K extends SendChannel>(channel: K, payload: SendMap[K]): void;
  on<K extends EventChannel>(channel: K, listener: (payload: EventMap[K]) => void): () => void;
}
