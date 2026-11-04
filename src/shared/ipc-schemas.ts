import { z } from 'zod';
import type { InvokeChannel, SendChannel } from './ipc-contract';
import { commandHistoryEntrySchema } from './command-history';
import {
  customProfileSchema,
  hostAddressSchema,
  hostGroupSchema,
  hostSchema,
  portSchema,
  profileOverrideSchema,
  projectSchema,
  savedCommandSchema,
  workspaceLayoutSchema,
  workspaceSchema,
} from './model';

const id = z.string().min(1).max(200);
const dims = { cols: z.number().int().min(1).max(1000), rows: z.number().int().min(1).max(500) };
const filePath = z.string().min(1).max(4096);
const name = z.string().trim().min(1).max(120);
/** Senha ou frase-senha: só trafega do renderer para o main, nunca de volta. */
const secret = z.string().min(1).max(4096);

/** Schemas das requisições invoke; o main valida antes de executar o handler. */
export const invokeSchemas = {
  'profiles:list': z.undefined(),
  'profiles:save': customProfileSchema,
  'profiles:delete': z.object({ id }),
  'profiles:setOverride': z.object({ id, override: profileOverrideSchema }),
  'pty:create': z.object({ profileId: id, cwd: filePath.optional(), projectId: id.optional(), elevated: z.boolean().optional(), envProfileId: id.optional(), ...dims }),
  'elevation:info': z.undefined(),
  'elevation:openExternal': z.object({ profileId: id, cwd: filePath.optional() }),
  'pty:restart': z.object({ sessionId: id, ...dims }),
  'pty:isBusy': z.object({ sessionId: id }),
  'pty:kill': z.object({ sessionId: id }),
  'pty:killDetached': z.object({ token: id }),
  'session:save': z.object({ tabs: z.array(workspaceLayoutSchema).max(50) }),
  'profiles:pickIcon': z.undefined(),
  'update:status': z.undefined(),
  'update:check': z.undefined(),
  'update:install': z.undefined(),
  'config:get': z.undefined(),
  'settings:update': z.object({ path: z.array(z.union([z.string(), z.number()])).min(1), value: z.unknown() }),
  'settings:openFile': z.undefined(),
  'commands:save': savedCommandSchema,
  'commands:delete': z.object({ id }),
  'commands:renameCategory': z.object({ from: z.string().max(200), to: z.string().max(200) }),
  'workspaces:save': workspaceSchema,
  'workspaces:delete': z.object({ id }),
  'projects:save': projectSchema,
  'projects:delete': z.object({ id, linkedCommands: z.enum(['delete', 'makeGlobal']) }),
  'projects:analyze': z.object({ root: filePath, projectId: id.optional() }),
  'projects:pickFolder': z.undefined(),
  'tests:run': z.object({
    projectId: id,
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('dotnet'), project: z.string().min(1).max(1000) }),
      z.object({ kind: z.literal('node'), dir: z.string().max(1000), framework: z.enum(['vitest', 'jest']) }),
    ]),
    filter: z.array(z.string().max(2000)).max(500).optional(),
  }),
  'tests:cancel': z.object({ runId: id }),
  'plugins:get': z.undefined(),
  'plugins:reload': z.undefined(),
  'plugins:setEnabled': z.object({ id: z.string().min(1).max(60), enabled: z.boolean() }),
  'plugins:openFolder': z.undefined(),
  'history:list': z.undefined(),
  'history:create': z.object({ label: z.string().trim().min(1).max(100) }),
  'history:restore': z.object({ id: z.string().max(40) }),
  'history:delete': z.object({ id: z.string().max(40) }),
  'ports:list': z.undefined(),
  'ports:kill': z.object({ pid: z.number().int().positive() }),
  'docker:list': z.undefined(),
  'docker:action': z.object({ id: z.string().regex(/^[\w.-]+$/).max(200), action: z.enum(['start', 'stop', 'restart', 'rm']) }),
  'tools:check': z.object({
    tool: z.enum(['dotnet', 'dotnet-ef', 'node', 'npm', 'yarn', 'pnpm', 'bun']),
    cwd: filePath,
  }),
  'env:reload': z.undefined(),
  'state:get': z.undefined(),
  'state:patch': z
    .object({
      sidebar: z.object({ visible: z.boolean(), width: z.number().int().min(160).max(800) }),
      recents: z.array(z.string().max(500)).max(50),
      detectedProfiles: z.array(z.unknown()),
      commandHistory: z.array(commandHistoryEntrySchema).max(1000),
    })
    .partial(),
  'fs:statMany': z.object({ paths: z.array(filePath).max(500) }),
  'editor:open': z.object({
    file: filePath,
    line: z.number().int().min(1).optional(),
    column: z.number().int().min(1).optional(),
    useDefaultApp: z.boolean().optional(),
  }),
  'shell:openExternal': z.object({ url: z.string().min(1).max(8192) }),
  'clipboard:read': z.undefined(),
  'clipboard:write': z.object({ text: z.string().max(10_000_000) }),
  'notify:longCommand': z.object({
    sessionId: id,
    command: z.string().max(10_000),
    durationMs: z.number().min(0),
    exitCode: z.number().int().nullable().optional(),
  }),
  'transfer:export': z.object({
    categories: z.union([z.literal('all'), z.array(z.string())]),
    profileIds: z.array(id),
    projectIds: z.array(id),
    hostIds: z.array(id).optional(),
  }),
  'transfer:previewImport': z.undefined(),
  'transfer:applyImport': z.object({
    previewId: id,
    decisions: z.array(z.object({ key: z.string(), action: z.enum(['replace', 'keepBoth', 'skip']) })),
  }),
  'keychain:get': z.undefined(),
  'keychain:pickKeyFile': z.undefined(),
  'keychain:importKey': z.object({
    name,
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('file'), path: filePath, mode: z.enum(['copy', 'reference']) }),
      z.object({ kind: z.literal('text'), text: z.string().min(1).max(64 * 1024) }),
    ]),
    passphrase: secret.optional(),
    savePassphrase: z.boolean(),
  }),
  'keychain:generateKey': z.object({
    name,
    type: z.enum(['ed25519', 'rsa']),
    comment: z.string().max(256).optional(),
    passphrase: secret.optional(),
    savePassphrase: z.boolean(),
  }),
  'keychain:renameKey': z.object({ keyId: id, name }),
  'keychain:setKeyPassphrase': z.object({ keyId: id, passphrase: secret.nullable() }),
  'keychain:saveIdentity': z.object({
    id: id.optional(),
    name,
    username: z.string().trim().min(1).max(256),
    keyId: id.nullable(),
    password: z.discriminatedUnion('action', [
      z.object({ action: z.literal('keep') }),
      z.object({ action: z.literal('set'), value: secret }),
      z.object({ action: z.literal('clear') }),
    ]),
  }),
  'keychain:usage': z.object({ kind: z.enum(['key', 'identity']), id }),
  'keychain:delete': z.object({ kind: z.enum(['key', 'identity']), id }),
  'keychain:copyPublicKey': z.object({ keyId: id }),
  'keychain:exportKey': z.object({ keyId: id, which: z.enum(['private', 'public']) }),
  'knownHosts:list': z.undefined(),
  'knownHosts:delete': z.object({ index: z.number().int().min(0) }),
  'knownHosts:importOpenSsh': z.undefined(),
  'hosts:save': hostSchema,
  'hosts:duplicate': z.object({ hostId: id }),
  'hosts:delete': z.object({ hostId: id }),
  'hosts:jumpUsers': z.object({ hostId: id }),
  'hosts:saveGroup': hostGroupSchema,
  'hosts:groupContents': z.object({ groupId: id }),
  'hosts:deleteGroup': z.object({ groupId: id, contents: z.enum(['moveUp', 'deleteHosts']) }),
  'transfer:previewOpenSsh': z.undefined(),
  'ssh:connect': z.object({
    target: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('host'), hostId: id }),
      z.object({ kind: z.literal('quick'), username: z.string().trim().min(1).max(256).nullable(), address: hostAddressSchema, port: portSchema }),
    ]),
    ...dims,
  }),
  'ssh:reconnect': z.object({ sessionId: id, ...dims }),
  'ssh:answer': z.object({
    promptId: id,
    answer: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('hostKey'), decision: z.enum(['trust', 'once', 'replace', 'cancel']) }),
      z.object({ kind: z.literal('text'), value: z.string().max(4096), save: z.boolean() }),
      z.object({ kind: z.literal('responses'), values: z.array(z.string().max(4096)).max(20), save: z.boolean() }),
      z.object({ kind: z.literal('cancel') }),
    ]),
  }),
  'ssh:state': z.object({ sessionId: id }),
} satisfies Record<InvokeChannel, z.ZodTypeAny>;

export const sendSchemas = {
  'pty:write': z.object({ sessionId: id, data: z.string().max(1_000_000) }),
  'pty:resize': z.object({ sessionId: id, ...dims }),
  'pty:ack': z.object({ sessionId: id, bytes: z.number().int().min(0) }),
  'session:state': z.object({
    sessionId: id,
    cwd: filePath.optional(),
    commandRunning: z.boolean().optional(),
    lastExitCode: z.number().int().nullable().optional(),
    commandFinished: z.boolean().optional(),
  }),
  'session:activate': z.object({ sessionId: id.nullable() }),
} satisfies Record<SendChannel, z.ZodTypeAny>;
