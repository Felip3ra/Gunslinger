import type { EventChannel, InvokeChannel, SendChannel } from './ipc-contract';

// Listas de canais sem dependências: o preload (sandbox) usa como lista branca.
// O `satisfies Record<...>` garante em tempo de compilação que nenhum canal do contrato ficou de fora.

const invoke = {
  'profiles:list': 1,
  'profiles:save': 1,
  'profiles:delete': 1,
  'profiles:setOverride': 1,
  'pty:create': 1,
  'pty:restart': 1,
  'elevation:info': 1,
  'elevation:openExternal': 1,
  'pty:isBusy': 1,
  'pty:kill': 1,
  'pty:killDetached': 1,
  'session:save': 1,
  'profiles:pickIcon': 1,
  'update:status': 1,
  'update:check': 1,
  'update:install': 1,
  'config:get': 1,
  'settings:update': 1,
  'settings:openFile': 1,
  'commands:save': 1,
  'commands:delete': 1,
  'commands:renameCategory': 1,
  'workspaces:save': 1,
  'workspaces:delete': 1,
  'projects:save': 1,
  'projects:delete': 1,
  'projects:analyze': 1,
  'projects:pickFolder': 1,
  'tests:run': 1,
  'tests:cancel': 1,
  'plugins:get': 1,
  'plugins:reload': 1,
  'plugins:setEnabled': 1,
  'plugins:openFolder': 1,
  'history:list': 1,
  'history:create': 1,
  'history:restore': 1,
  'history:delete': 1,
  'ports:list': 1,
  'ports:kill': 1,
  'docker:list': 1,
  'docker:action': 1,
  'tools:check': 1,
  'env:reload': 1,
  'state:get': 1,
  'state:patch': 1,
  'fs:statMany': 1,
  'editor:open': 1,
  'shell:openExternal': 1,
  'clipboard:read': 1,
  'clipboard:write': 1,
  'notify:longCommand': 1,
  'transfer:export': 1,
  'transfer:previewImport': 1,
  'transfer:applyImport': 1,
} satisfies Record<InvokeChannel, 1>;

const send = {
  'pty:write': 1,
  'pty:resize': 1,
  'pty:ack': 1,
  'session:state': 1,
  'session:activate': 1,
} satisfies Record<SendChannel, 1>;

const events = {
  'pty:data': 1,
  'pty:exit': 1,
  'config:changed': 1,
  'profiles:changed': 1,
  'status:changed': 1,
  'project:packagesChanged': 1,
  'env:changed': 1,
  'notification:clicked': 1,
  'tests:output': 1,
  'tests:finished': 1,
  'plugins:changed': 1,
  'update:changed': 1,
} satisfies Record<EventChannel, 1>;

export const invokeChannels: ReadonlySet<string> = new Set(Object.keys(invoke));
export const sendChannels: ReadonlySet<string> = new Set(Object.keys(send));
export const eventChannels: ReadonlySet<string> = new Set(Object.keys(events));
