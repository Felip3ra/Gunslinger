import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app, ipcMain, type BrowserWindow } from 'electron';
import { spawn as ptySpawn } from 'node-pty';
import type { EventMap } from '@shared/ipc-contract';
import { electronClipboard, electronDesktop, electronDialogs, electronNotifier, electronWindow } from './adapters/electron';
import { ConfigStore } from './config/config-store';
import { ElevationService, SUDO_REGISTRY_KEY } from './elevation/elevation-service';
import { fromProcessEnv, getVar } from './env/env-utils';
import { EnvironmentService } from './env/environment-service';
import { buildLaunch, type IntegrationScripts } from './integration/launch';
import { registerConfigHandlers } from './ipc/handlers/config';
import { registerDesktopHandlers } from './ipc/handlers/desktop';
import { registerProjectHandlers } from './ipc/handlers/projects';
import { registerTerminalHandlers } from './ipc/handlers/terminal';
import { registerTestHandlers } from './ipc/handlers/tests';
import { registerDockerPortsHandlers } from './ipc/handlers/docker-ports';
import { registerHistoryHandlers } from './ipc/handlers/history';
import { registerPluginHandlers } from './ipc/handlers/plugins';
import { PluginService } from './plugins/plugin-service';
import { HistoryService } from './history/history-service';
import { DockerService } from './services/docker-service';
import { PortService } from './services/port-service';
import { analyzePackage } from './projects/node';
import { TestRunnerService } from './tests/test-runner';
import { IpcRegistry } from './ipc/registry';
import { getPlatformAdapter } from './platform';
import type { DialogPort } from './ports';
import { ProjectService } from './projects/project-service';
import { PtyManager } from './pty/pty-manager';
import { EditorService } from './services/editor-service';
import { LongCommandNotifier } from './services/long-command-notifier';
import { ProjectCatalog } from './services/project-catalog';
import { ShellService } from './shells/shell-service';
import { StatusService } from './status/status-service';
import { launchDetached } from './tools/launch-detached';
import { TransferService } from './transfer/transfer-service';

export type Send = <K extends keyof EventMap>(channel: K, payload: EventMap[K]) => void;

function resourcesDir(): string {
  // Em desenvolvimento, o bundle fica em out/main; os recursos ficam na raiz do projeto.
  return app.isPackaged ? join(process.resourcesPath, 'shell-integration') : join(__dirname, '..', '..', 'resources', 'shell-integration');
}

/** Copia os scripts de integração para a pasta de dados (caminho estável, fora do asar, acessível pelo WSL). */
async function prepareIntegrationScripts(dataDir: string): Promise<IntegrationScripts | null> {
  try {
    const target = join(dataDir, 'integration');
    await mkdir(target, { recursive: true });
    await copyFile(join(resourcesDir(), 'gunslinger.bash'), join(target, 'gunslinger.bash'));
    const powershell = await readFile(join(resourcesDir(), 'gunslinger.ps1'), 'utf8');
    return { powershell, bashPath: join(target, 'gunslinger.bash') };
  } catch (err) {
    console.error('Integração com o shell indisponível:', err);
    return null;
  }
}

/** Serviços que o ciclo de vida do app (index.ts) precisa conhecer. */
export interface AppServices {
  config: ConfigStore;
  pty: PtyManager;
  dialogs: DialogPort;
  /** Libera observadores e recursos antes de sair. */
  dispose(): void;
}

/** Raiz de composição: instancia os serviços, liga os eventos e registra os handlers de IPC. */
export async function compose(getWindow: () => BrowserWindow | null): Promise<AppServices> {
  const platform = getPlatformAdapter();
  const dialogs = electronDialogs(getWindow);
  const config = new ConfigStore(app.getPath('userData'));
  await config.load();
  config.startWatching();

  const env = new EnvironmentService(platform, fromProcessEnv(process.env));
  // O Electron herda ELECTRON_RUN_AS_NODE do VS Code; os shells não devem herdar.
  delete env.current().env['ELECTRON_RUN_AS_NODE'];

  const shells = new ShellService(platform, env, config);
  shells.init();
  const scripts = await prepareIntegrationScripts(config.dir);

  const send: Send = (channel, payload) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };

  const pty = new PtyManager({
    platform,
    spawn: (file, args, opts) =>
      // ConPTY do sistema: a DLL embutida no node-pty (1.23) descarta as OSC 9;9/133 da integração.
      ptySpawn(file, args, { name: 'xterm-256color', ...opts, useConpty: true, useConptyDll: false }),
    send,
    resolveProfile: (id) => shells.get(id),
    buildLaunch: (profile, cwd, options) => buildLaunch(profile, cwd, env.current().env, scripts, options),
    envGeneration: () => env.current().generation,
    defaultCwd: () => getVar(env.current().env, 'USERPROFILE') ?? homedir(),
    environmentVariables: (id) => config.snapshot().settings.environments.find((e) => e.id === id)?.variables,
  });

  config.onChange((snapshot) => send('config:changed', snapshot));
  shells.onChange((profiles) => send('profiles:changed', profiles));

  const plugins = new PluginService(join(config.dir, 'plugins'), {
    disabled: () => config.snapshot().settings.plugins.disabled,
    setDisabled: (ids) => config.updateSettings(['plugins', 'disabled'], ids),
    onChange: (listener) => config.onChange(listener),
  });
  plugins.onChange((snapshot) => {
    send('plugins:changed', snapshot);
    void shells.setPluginProfiles(snapshot.contributions.profiles);
  });
  await plugins.start();
  await shells.setPluginProfiles(plugins.snapshot().contributions.profiles);
  env.onChange((s) => send('env:changed', { envGeneration: s.generation }));

  const elevation = new ElevationService({
    readSudoRegistry: () => platform.exportRegistryKey(SUDO_REGISTRY_KEY),
    resolveExecutable: (name) => platform.resolveExecutable(name, env.current().env),
    launchDetached,
    powershellPath: join(getVar(env.current().env, 'SystemRoot') ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  });
  env.onChange(() => elevation.refresh());
  const defaultCwd = (): string => getVar(env.current().env, 'USERPROFILE') ?? homedir();
  const plainLaunch = (profileId: string, cwd?: string) => {
    const profile = shells.get(profileId);
    return profile ? buildLaunch({ ...profile, shellIntegration: false }, cwd ?? profile.cwd ?? defaultCwd(), env.current().env, null) : null;
  };

  const analysis = new ProjectService(send);
  const catalog = new ProjectCatalog(config, undefined, (id) => analysis.unwatch(id));
  const status = new StatusService({ platform, env, send, projects: () => config.snapshot().projects });
  pty.onSessionEvent((info, event) => status.onSessionEvent(info, event));
  const editor = new EditorService(platform, electronDesktop, () => env.current().env, () => config.snapshot().settings.editor);
  const notifier = new LongCommandNotifier(
    electronNotifier,
    electronWindow(getWindow),
    () => config.snapshot().settings.notifications.longCommand,
    (sessionId) => send('notification:clicked', { sessionId }),
  );
  const transfer = new TransferService({
    dialogs,
    snapshot: () => config.snapshot(),
    knownProfileIds: () => shells.list().map((p) => p.id),
    executableExists: async (p) => (await platform.resolveExecutable(p.executable, env.current().env)) !== null,
    writeProjects: (projects) => config.mutateProjects(() => projects),
    writeCommands: (commands) => config.mutateCommands(() => commands),
    writeCustomProfiles: (profiles) => config.updateSettings(['profiles', 'custom'], profiles),
  });

  const runner = new TestRunnerService({
    platform,
    env: () => env.current().env,
    packageManager: async (root, dir) => {
      const project = config.snapshot().projects.projects.find((p) => p.rootPath === root);
      return (await analyzePackage(root, dir, project?.node.packageManagerOverrides[dir])).packageManager;
    },
    onOutput: (runId, data) => send('tests:output', { runId, data }),
    onFinished: (event) => send('tests:finished', event),
  });

  const ipc = new IpcRegistry(ipcMain);
  registerTerminalHandlers(ipc, { shells, pty, status, elevation, plainLaunch });
  registerConfigHandlers(ipc, { config, env });
  registerProjectHandlers(ipc, { catalog, analysis, config, dialogs, platform, env });
  registerTestHandlers(ipc, { runner, config });
  const history = new HistoryService(join(config.dir, 'history'), config);
  void history.start();
  registerHistoryHandlers(ipc, { history });
  registerPluginHandlers(ipc, { plugins, desktop: electronDesktop });
  registerDockerPortsHandlers(ipc, {
    ports: new PortService(platform, () => pty.list()),
    docker: new DockerService(platform, () => env.current().env),
  });
  registerDesktopHandlers(ipc, { editor, desktop: electronDesktop, clipboard: electronClipboard, notifier, transfer, config });

  return {
    config,
    pty,
    dialogs,
    dispose: () => {
      config.stopWatching();
      history.stop();
      plugins.stop();
      analysis.closeAll();
      status.dispose();
    },
  };
}
