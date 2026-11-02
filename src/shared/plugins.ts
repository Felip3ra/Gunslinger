import { z } from 'zod';
import { highlightRuleSchema, type HighlightRule } from './log-highlight';
import { savedCommandSchema, type SavedCommand } from './model/commands';
import { customProfileSchema, type CustomProfile } from './model/profiles';
import { themeSchema, type Theme } from './model/settings';
import { workspaceSchema, type Workspace } from './model/workspaces';

const itemId = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/i, 'use letras, números, "-" ou "_"');

/** Manifesto `plugin.json`: só dados. Chaves desconhecidas em `contributes` são erro (nada de código). */
export const pluginManifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, 'id em minúsculas: letras, números, "." ou "-"').max(60),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().default(''),
  contributes: z
    .object({
      commands: z.array(savedCommandSchema.extend({ id: itemId })).default([]),
      themes: z.array(z.object({ id: itemId, name: z.string().min(1), theme: themeSchema })).default([]),
      logHighlight: z.array(highlightRuleSchema).default([]),
      workspaces: z.array(workspaceSchema.extend({ id: itemId })).default([]),
      profiles: z.array(customProfileSchema.extend({ id: itemId })).default([]),
    })
    .strict()
    .default({}),
});
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export interface PluginTheme {
  id: string;
  name: string;
  pluginName: string;
  theme: Theme;
}

export interface PluginContributions {
  commands: SavedCommand[];
  themes: PluginTheme[];
  highlightRules: HighlightRule[];
  workspaces: Workspace[];
  profiles: CustomProfile[];
}

export interface PluginInfo {
  /** Nome da pasta (identifica o plugin mesmo com manifesto inválido). */
  folder: string;
  id: string | null;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  error: string | null;
  counts: { commands: number; themes: number; logHighlight: number; workspaces: number; profiles: number };
}

export interface PluginsSnapshot {
  dir: string;
  plugins: PluginInfo[];
  contributions: PluginContributions;
}

export const emptyContributions = (): PluginContributions => ({ commands: [], themes: [], highlightRules: [], workspaces: [], profiles: [] });

export const pluginCommandId = (pluginId: string, id: string): string => `plugin:${pluginId}:${id}`;
export const pluginProfileId = (pluginId: string, id: string): string => `plugin.${pluginId}.${id}`;
export const isPluginItem = (id: string): boolean => id.startsWith('plugin:');

/** Pasta lida do disco: o JSON do manifesto já interpretado, ou o erro de leitura. */
export type LoadedPlugin = { folder: string; data: unknown } | { folder: string; error: string };

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => {
      const where = i.path.join('.');
      const message = i.code === 'unrecognized_keys' ? `chave não suportada: ${i.keys.join(', ')}` : i.message;
      return where ? `${where}: ${message}` : message;
    })
    .join('; ');
}

/** Valida cada pasta, detecta ids repetidos e junta as contribuições dos plugins ativos. */
export function resolvePlugins(loaded: LoadedPlugin[], disabled: readonly string[]): Omit<PluginsSnapshot, 'dir'> {
  const plugins: PluginInfo[] = [];
  const contributions = emptyContributions();
  const seen = new Set<string>();
  const zero = { commands: 0, themes: 0, logHighlight: 0, workspaces: 0, profiles: 0 };

  for (const item of [...loaded].sort((a, b) => a.folder.localeCompare(b.folder))) {
    const base = { folder: item.folder, id: null, name: item.folder, version: '', description: '', enabled: false, counts: zero };
    if ('error' in item) {
      plugins.push({ ...base, error: item.error });
      continue;
    }
    const parsed = pluginManifestSchema.safeParse(item.data);
    if (!parsed.success) {
      plugins.push({ ...base, error: `plugin.json inválido: ${describeIssues(parsed.error)}` });
      continue;
    }
    const m = parsed.data;
    const c = m.contributes;
    const info: PluginInfo = {
      ...base,
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description,
      enabled: !disabled.includes(m.id),
      error: null,
      counts: { commands: c.commands.length, themes: c.themes.length, logHighlight: c.logHighlight.length, workspaces: c.workspaces.length, profiles: c.profiles.length },
    };
    if (seen.has(m.id)) {
      plugins.push({ ...info, enabled: false, error: `id "${m.id}" repetido (outra pasta já usa)` });
      continue;
    }
    seen.add(m.id);
    plugins.push(info);
    if (!info.enabled) continue;

    contributions.commands.push(
      ...c.commands.map((cmd) => ({ ...cmd, id: pluginCommandId(m.id, cmd.id), category: cmd.category || m.name })),
    );
    contributions.themes.push(...c.themes.map((t) => ({ id: `${m.id}.${t.id}`, name: t.name, pluginName: m.name, theme: t.theme })));
    contributions.highlightRules.push(...c.logHighlight);
    contributions.workspaces.push(...c.workspaces.map((w) => ({ ...w, id: pluginCommandId(m.id, w.id), name: `${w.name} (${m.name})` })));
    contributions.profiles.push(...c.profiles.map((p) => ({ ...p, id: pluginProfileId(m.id, p.id) })));
  }
  return { plugins, contributions };
}
