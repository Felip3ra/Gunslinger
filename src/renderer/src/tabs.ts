import { pickDefaultProfile } from '@shared/profiles';
import { rememberCommand } from './command-history';
import { nextPane, panesOf, type SplitDirection } from './layout/layout';
import { api } from './api';
import type { DetachedProcess } from '@shared/ipc-contract';
import type { SshTarget } from '@shared/ssh';
import { askDialog, confirmDialog, groupOf, profileOf, useStore, type Tab, type TabGroup } from './store';
import { terminals, type CommandEvent } from './terminal/terminal-registry';

let tabCounter = 0;
const ELEVATION_CANCEL_WINDOW_MS = 3000;
/** Saída que chegou antes de o renderer saber de qual aba é a sessão. */
const earlyData = new Map<string, string[]>();
/** Fim de sessão que chegou antes de o renderer saber de qual aba ela é (conexão SSH recusada na hora). */
const earlyExit = new Map<string, number>();
const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

function tabBySession(sessionId: string): Tab | undefined {
  return useStore.getState().tabs.find((t) => t.sessionId === sessionId);
}

function sendState(tab: Tab | undefined, state: { cwd?: string; commandRunning?: boolean; lastExitCode?: number | null; commandFinished?: boolean }): void {
  if (tab?.sessionId) api.send('session:state', { sessionId: tab.sessionId, ...state });
}

function onCommandEnd(key: string, event: CommandEvent): void {
  const store = useStore.getState();
  store.updateTab(key, { commandRunning: false });
  const tab = store.tabs.find((t) => t.key === key);
  sendState(tab, { commandRunning: false, lastExitCode: event.exitCode, commandFinished: true });
  rememberCommand(event.command, tab?.cwd ?? null, event.exitCode);
  const settings = store.config?.settings.notifications.longCommand;
  if (tab?.sessionId && settings?.enabled && event.durationMs >= settings.thresholdSeconds * 1000) {
    // O main só mostra a notificação se a janela estiver fora de foco.
    api
      .invoke('notify:longCommand', {
        sessionId: tab.sessionId,
        command: event.command,
        durationMs: event.durationMs,
        exitCode: event.exitCode,
      })
      .catch(() => undefined);
  }
}

/** Liga a sessão à aba e entrega o que chegou antes (saída e, em SSH, o fim da sessão). */
function adoptSession(key: string, sessionId: string): void {
  terminals.setSession(key, sessionId);
  for (const chunk of earlyData.get(sessionId) ?? []) terminals.write(key, chunk);
  earlyData.delete(sessionId);
  const exit = earlyExit.get(sessionId);
  if (exit !== undefined) {
    earlyExit.delete(sessionId);
    handleExit(sessionId, exit);
  }
}

async function startSession(key: string, profileId: string, cwd?: string, projectId?: string | null, elevated = false, envProfileId?: string | null): Promise<void> {
  const store = useStore.getState();
  await nextFrame();
  const dims = terminals.fit(key) ?? terminals.dimensions(key);
  try {
    const res = await api.invoke('pty:create', {
      profileId,
      cols: dims.cols,
      rows: dims.rows,
      ...(cwd ? { cwd } : {}),
      ...(projectId ? { projectId } : {}),
      ...(elevated ? { elevated } : {}),
      ...(envProfileId ? { envProfileId } : {}),
    });
    store.updateTab(key, { sessionId: res.sessionId, status: 'running', cwd: res.cwd, envGeneration: res.envGeneration, error: null, startedAt: Date.now() });
    adoptSession(key, res.sessionId);
  } catch (err) {
    store.updateTab(key, { status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}

export interface OpenTabOptions {
  profileId?: string;
  cwd?: string;
  projectId?: string | null;
  elevated?: boolean;
  /** Perfil de ambiente cujas variáveis entram no processo do shell. */
  envProfileId?: string;
  /** Abre como painel ao lado de `target` (na mesma aba), em vez de uma aba nova. */
  splitFrom?: { target: string; direction: SplitDirection };
  /** Cria o painel sem aba: quem chama monta o grupo depois (workspaces). */
  detached?: boolean;
}

export async function openTab(options: OpenTabOptions = {}): Promise<string | null> {
  const store = useStore.getState();
  const { config, profiles } = store;
  if (!config) return null;

  let profileId = options.profileId;
  if (!profileId) {
    const picked = pickDefaultProfile(profiles, config.settings.defaultProfile);
    if (picked.warning) store.pushNotice('warning', picked.warning);
    if (!picked.profile) {
      store.pushNotice('error', 'Nenhum shell disponível.');
      return null;
    }
    profileId = picked.profile.id;
  }

  const key = `tab-${++tabCounter}`;
  terminals.create(key, config.settings, {
    onInput: (data) => {
      const sessionId = useStore.getState().tabs.find((t) => t.key === key)?.sessionId;
      if (sessionId) api.send('pty:write', { sessionId, data });
    },
    onResize: (cols, rows) => {
      const sessionId = useStore.getState().tabs.find((t) => t.key === key)?.sessionId;
      if (sessionId) api.send('pty:resize', { sessionId, cols, rows });
    },
    onTitle: (title) => useStore.getState().updateTab(key, { shellTitle: title || null }),
    onCwd: (cwd) => {
      useStore.getState().updateTab(key, { cwd });
      sendState(useStore.getState().tabs.find((t) => t.key === key), { cwd });
    },
    onCommandStart: () => {
      useStore.getState().updateTab(key, { commandRunning: true });
      sendState(useStore.getState().tabs.find((t) => t.key === key), { commandRunning: true });
    },
    onCommandEnd: (event) => onCommandEnd(key, event),
    onNodeVersion: (nodeVersion) => useStore.getState().updateTab(key, { nodeVersion }),
  });

  store.addTab({
    key,
    sessionId: null,
    kind: 'local',
    profileId,
    sshTarget: null,
    sshLabel: null,
    projectId: options.projectId ?? null,
    shellTitle: null,
    cwd: options.cwd ?? null,
    envGeneration: store.envGeneration,
    status: 'starting',
    exitCode: null,
    error: null,
    commandRunning: false,
    elevated: !!options.elevated,
    envProfileId: options.envProfileId ?? null,
    startedAt: Date.now(),
    nodeVersion: null,
  });
  if (options.detached) {
    // o grupo é montado por quem chamou
  } else if (options.splitFrom && groupOf(useStore.getState().groups, options.splitFrom.target)) {
    store.addPaneToGroup(options.splitFrom.target, key, options.splitFrom.direction);
  } else {
    store.addGroup(key);
  }
  await startSession(key, profileId, options.cwd, options.projectId, options.elevated, options.envProfileId);
  terminals.focus(key);
  return key;
}

function disposeTab(key: string): void {
  const store = useStore.getState();
  const before = store.groups;
  const group = groupOf(before, key);
  const groupIndex = group ? before.indexOf(group) : -1;
  terminals.dispose(key);
  store.removeTab(key);
  store.removePaneFromGroups(key);
  const after = useStore.getState();
  if (after.tabs.length === 0) {
    window.close();
    return;
  }
  if (after.activeKey !== key && store.activeKey !== key) return;
  // Foco: outro painel da mesma aba; se a aba sumiu, a aba vizinha.
  const sameGroup = group ? after.groups.find((g) => g.id === group.id) : undefined;
  const target = sameGroup ?? after.groups[Math.min(groupIndex, after.groups.length - 1)];
  if (target) after.activate(displayPane(target));
}

/** Painel mostrado/ativado quando a aba é selecionada. */
export function displayPane(group: TabGroup): string {
  const { activeKey } = useStore.getState();
  const panes = panesOf(group.root);
  if (activeKey && panes.includes(activeKey)) return activeKey;
  return panes.includes(group.lastActive) ? group.lastActive : panes[0]!;
}

export async function closeTab(key: string): Promise<void> {
  const tab = useStore.getState().tabs.find((t) => t.key === key);
  if (!tab) return;
  if (tab.sessionId && tab.status === 'running') {
    const busy = await api.invoke('pty:isBusy', { sessionId: tab.sessionId }).catch(() => false);
    if (busy) {
      const ok = await confirmDialog('Fechar aba', 'Esta aba tem um processo em execução. Ele será encerrado.', 'Fechar aba');
      if (!ok) return;
    }
    // Remove a sessão da aba antes do kill, para ignorar o pty:exit que o kill dispara.
    const sessionId = tab.sessionId;
    useStore.getState().updateTab(key, { sessionId: null });
    const killed = await api.invoke('pty:kill', { sessionId });
    // Pergunta antes de descartar a aba: se era a última, o app fecha em seguida.
    if (killed.token) await askDetached(killed.token, killed.detached);
  }
  disposeTab(key);
}

/** Processos que a aba iniciou e saíram da árvore dela (`start`, daemons): encerrar ou manter. */
async function askDetached(token: string, detached: DetachedProcess[]): Promise<void> {
  const names = detached.slice(0, 8).map((p) => `${p.name || '?'} (${p.pid})`);
  if (detached.length > names.length) names.push(`… e mais ${detached.length - names.length}`);
  const choice = await askDialog({
    title: 'Processos iniciados pela aba',
    message: 'Estes processos foram iniciados pela aba e continuam rodando fora dela:',
    detail: names.join('\n'),
    buttons: [
      { label: 'Manter rodando', value: 'keep' },
      { label: 'Encerrar', value: 'kill', primary: true },
    ],
  });
  if (choice === 'kill') await api.invoke('pty:killDetached', { token }).catch(() => undefined);
}

/** Reinicia o shell de uma aba encerrada ou com erro, com o mesmo perfil e a última pasta. */
export async function restartTab(key: string): Promise<void> {
  const tab = useStore.getState().tabs.find((t) => t.key === key);
  if (!tab) return;
  if (tab.kind === 'ssh') {
    // "Reconectar"/"Tentar de novo": sessão nova para o mesmo destino.
    if (tab.sessionId) {
      const old = tab.sessionId;
      useStore.getState().updateTab(key, { sessionId: null });
      await api.invoke('pty:kill', { sessionId: old }).catch(() => undefined);
    }
    await connectSsh(key);
    terminals.focus(key);
    return;
  }
  if (tab.sessionId && tab.status === 'running') {
    // Aba viva (ambiente desatualizado): o main encerra e recria a sessão.
    const old = tab.sessionId;
    useStore.getState().updateTab(key, { sessionId: null, status: 'starting' });
    terminals.reset(key);
    const dims = terminals.dimensions(key);
    try {
      const res = await api.invoke('pty:restart', { sessionId: old, cols: dims.cols, rows: dims.rows });
      useStore.getState().updateTab(key, { sessionId: res.sessionId, status: 'running', envGeneration: res.envGeneration });
      adoptSession(key, res.sessionId);
    } catch (err) {
      useStore.getState().updateTab(key, { status: 'error', error: String(err) });
    }
    return;
  }
  terminals.reset(key);
  useStore.getState().updateTab(key, { status: 'starting', exitCode: null, error: null, commandRunning: false });
  await startSession(key, tab.profileId, tab.cwd ?? undefined, tab.projectId, tab.elevated, tab.envProfileId);
  terminals.focus(key);
}

/** Próxima/anterior aba (grupo), dando a volta. */
export function cycleTab(delta: 1 | -1): void {
  const { groups, activeKey, activate } = useStore.getState();
  if (groups.length === 0) return;
  const current = groupOf(groups, activeKey);
  const index = current ? groups.indexOf(current) : 0;
  activate(displayPane(groups[(index + delta + groups.length) % groups.length]!));
}

/** Próximo/anterior painel da aba ativa. */
export function cyclePane(delta: 1 | -1): void {
  const { groups, activeKey, activate } = useStore.getState();
  const group = groupOf(groups, activeKey);
  if (group && activeKey) activate(nextPane(group.root, activeKey, delta));
}

/** Divide o painel ativo; o novo herda perfil, pasta e projeto. */
export async function splitActive(direction: SplitDirection): Promise<void> {
  const s = useStore.getState();
  const tab = s.tabs.find((t) => t.key === s.activeKey);
  if (!tab) return;
  // Painel SSH: o novo painel conecta ao mesmo destino (a conexão é compartilhada).
  if (tab.kind === 'ssh' && tab.sshTarget) {
    await openSshTab(tab.sshTarget, { splitFrom: { target: tab.key, direction } });
    return;
  }
  await openTab({
    profileId: tab.profileId,
    ...(tab.cwd ? { cwd: tab.cwd } : {}),
    projectId: tab.projectId,
    ...(tab.envProfileId ? { envProfileId: tab.envProfileId } : {}),
    splitFrom: { target: tab.key, direction },
  });
}

/** Fecha todos os painéis de uma aba (cada painel ocupado pede confirmação). */
export async function closeGroup(groupId: string): Promise<void> {
  const group = useStore.getState().groups.find((g) => g.id === groupId);
  if (!group) return;
  for (const key of panesOf(group.root)) await closeTab(key);
}

export function activeKey(): string | null {
  return useStore.getState().activeKey;
}

/** Liga os eventos do main às abas. Chamado uma vez na inicialização. */
export function wirePtyEvents(): void {
  // O último painel focado de cada aba volta a ter o foco quando a aba é selecionada.
  useStore.subscribe((s, prev) => {
    if (s.activeKey && s.activeKey !== prev.activeKey) s.markLastActive(s.activeKey);
  });

  api.on('pty:data', ({ sessionId, data }) => {
    const tab = tabBySession(sessionId);
    if (tab) terminals.write(tab.key, data);
    else {
      const list = earlyData.get(sessionId) ?? [];
      list.push(data);
      earlyData.set(sessionId, list);
    }
  });

  api.on('pty:exit', ({ sessionId, exitCode }) => {
    if (tabBySession(sessionId)) handleExit(sessionId, exitCode);
    else earlyExit.set(sessionId, exitCode);
  });
}

function handleExit(sessionId: string, exitCode: number): void {
  const tab = tabBySession(sessionId);
  if (!tab) return;
  if (exitCode === 0) {
    disposeTab(tab.key);
    return;
  }
  if (tab.kind === 'ssh') {
    // A tela fica como estava; o motivo vem da etapa da sessão (ssh:state).
    const state = useStore.getState().sshStates[sessionId];
    useStore.getState().updateTab(tab.key, {
      status: state?.stage === 'failed' ? 'error' : 'exited',
      // Falha: a mensagem do erro; queda: o motivo ("o servidor não respondeu").
      error: state?.stage === 'failed' ? (state.message ?? 'Falha na conexão') : (state?.message ?? null),
      exitCode,
      sessionId: null,
      commandRunning: false,
    });
    return;
  }
  // sudo/gsudo saem logo com erro quando o UAC é recusado.
  if (tab.elevated && Date.now() - tab.startedAt < ELEVATION_CANCEL_WINDOW_MS) {
    useStore.getState().updateTab(tab.key, { status: 'error', error: 'Elevação cancelada', sessionId: null, commandRunning: false });
    return;
  }
  useStore.getState().updateTab(tab.key, { status: 'exited', exitCode, sessionId: null, commandRunning: false });
}

export function profileName(tab: Tab): string {
  if (tab.kind === 'ssh') return tab.sshLabel ?? 'SSH';
  return profileOf(useStore.getState(), tab.profileId)?.name ?? tab.profileId;
}

// ---------- abas SSH ----------

export interface OpenSshTabOptions {
  splitFrom?: { target: string; direction: SplitDirection };
  /** Cria o painel sem aba (workspaces e sessão restaurada montam o grupo depois). */
  detached?: boolean;
  /** false: a aba fica "Desconectado" até o usuário pedir (sessão restaurada). */
  connect?: boolean;
  /** Nome a mostrar antes da primeira conexão. */
  label?: string;
}

/** Nome do destino como o renderer o conhece (antes da resposta do main). */
export function sshTargetLabel(target: SshTarget): string {
  if (target.kind === 'host') return useStore.getState().config?.hosts.hosts.find((h) => h.id === target.hostId)?.name ?? 'Host não encontrado';
  return `${target.username ? `${target.username}@` : ''}${target.address}${target.port === 22 ? '' : `:${target.port}`}`;
}

/** Abre uma aba (ou painel) SSH. A conexão pode pedir fingerprint e credenciais pelo diálogo de SSH. */
export async function openSshTab(target: SshTarget, options: OpenSshTabOptions = {}): Promise<string | null> {
  const store = useStore.getState();
  const { config } = store;
  if (!config) return null;
  const key = `tab-${++tabCounter}`;
  terminals.create(key, config.settings, {
    onInput: (data) => {
      const tab = useStore.getState().tabs.find((t) => t.key === key);
      if (!tab) return;
      if (tab.sessionId) {
        api.send('pty:write', { sessionId: tab.sessionId, data });
        return;
      }
      // Enter numa aba desconectada reconecta.
      if (data === '\r' && (tab.status === 'exited' || tab.status === 'disconnected' || tab.status === 'error')) void connectSsh(key);
    },
    onResize: (cols, rows) => {
      const sessionId = useStore.getState().tabs.find((t) => t.key === key)?.sessionId;
      if (sessionId) api.send('pty:resize', { sessionId, cols, rows });
    },
    onTitle: (title) => useStore.getState().updateTab(key, { shellTitle: title || null }),
    // Sem integração de shell no servidor: pasta e comandos não são rastreados.
    onCwd: () => undefined,
    onCommandStart: () => undefined,
    onCommandEnd: () => undefined,
    onNodeVersion: () => undefined,
  });

  const hostMissing = target.kind === 'host' && !config.hosts.hosts.some((h) => h.id === target.hostId);
  store.addTab({
    key,
    sessionId: null,
    kind: 'ssh',
    profileId: '',
    sshTarget: target,
    sshLabel: options.label ?? sshTargetLabel(target),
    projectId: null,
    shellTitle: null,
    cwd: null,
    envGeneration: store.envGeneration,
    status: hostMissing ? 'error' : options.connect === false ? 'disconnected' : 'starting',
    exitCode: null,
    error: hostMissing ? 'Host não encontrado' : null,
    commandRunning: false,
    elevated: false,
    envProfileId: null,
    startedAt: Date.now(),
    nodeVersion: null,
  });
  if (options.detached) {
    // o grupo é montado por quem chamou
  } else if (options.splitFrom && groupOf(useStore.getState().groups, options.splitFrom.target)) {
    store.addPaneToGroup(options.splitFrom.target, key, options.splitFrom.direction);
  } else {
    store.addGroup(key);
  }
  if (!hostMissing && options.connect !== false) await connectSsh(key);
  terminals.focus(key);
  return key;
}

/** Conecta (ou reconecta) a aba SSH: sempre uma sessão nova, no mesmo painel. */
export async function connectSsh(key: string): Promise<void> {
  const tab = useStore.getState().tabs.find((t) => t.key === key);
  if (!tab?.sshTarget || tab.sessionId) return;
  if (tab.sshTarget.kind === 'host' && !hostExists(tab.sshTarget.hostId)) {
    useStore.getState().updateTab(key, { status: 'error', error: 'Host não encontrado' });
    return;
  }
  if (tab.status !== 'starting') terminals.write(key, '\r\n');
  useStore.getState().updateTab(key, { status: 'starting', exitCode: null, error: null, startedAt: Date.now() });
  await nextFrame();
  const dims = terminals.fit(key) ?? terminals.dimensions(key);
  try {
    const res = await api.invoke('ssh:connect', { target: tab.sshTarget, cols: dims.cols, rows: dims.rows });
    useStore.getState().updateTab(key, { sessionId: res.sessionId, status: 'running', sshLabel: res.label });
    adoptSession(key, res.sessionId);
  } catch (err) {
    useStore.getState().updateTab(key, { status: 'error', error: err instanceof Error ? err.message : String(err) });
  }
}

function hostExists(hostId: string): boolean {
  return !!useStore.getState().config?.hosts.hosts.some((h) => h.id === hostId);
}

/** Espera a aba SSH conectar (para comandos iniciais de workspace); false se falhar ou demorar. */
export function waitForSshConnected(key: string, timeoutMs = 60_000): Promise<boolean> {
  return new Promise((resolve) => {
    const check = (): boolean | null => {
      const s = useStore.getState();
      const tab = s.tabs.find((t) => t.key === key);
      if (!tab || tab.status === 'error' || tab.status === 'exited' || tab.status === 'disconnected') return false;
      if (tab.sessionId && s.sshStates[tab.sessionId]?.stage === 'connected') return true;
      return null;
    };
    const first = check();
    if (first !== null) return resolve(first);
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(false);
    }, timeoutMs);
    const unsubscribe = useStore.subscribe(() => {
      const result = check();
      if (result === null) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(result);
    });
  });
}
