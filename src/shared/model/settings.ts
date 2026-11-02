import { z } from 'zod';
import { DEFAULT_PALETTE, PALETTE_MAX } from '../colors';
import { environmentProfileSchema } from '../env-profiles';
import { defaultLogHighlight, logHighlightSchema } from '../log-highlight';
import { customProfileSchema, hexColor, profileOverrideSchema } from './profiles';

export const themeSchema = z.object({
  background: hexColor,
  foreground: hexColor,
  cursor: hexColor,
  selection: hexColor,
  ansi: z.array(hexColor).length(16),
});
export type Theme = z.infer<typeof themeSchema>;

export const defaultTheme: Theme = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  selection: '#264f78',
  ansi: [
    '#484f58', '#ff7b72', '#3fb950', '#d29922', '#58a6ff', '#bc8cff', '#39c5cf', '#b1bac4',
    '#6e7681', '#ffa198', '#56d364', '#e3b341', '#79c0ff', '#d2a8ff', '#56d4dd', '#f0f6fc',
  ],
};

/** Cores da interface; cada chave vira uma variável CSS (ver `uiColorVars`). */
export const uiColorsSchema = z.object({
  bg: hexColor,
  bgElevated: hexColor,
  bgHover: hexColor,
  border: hexColor,
  text: hexColor,
  textMuted: hexColor,
  accent: hexColor,
  danger: hexColor,
  warning: hexColor,
  success: hexColor,
});
export type UiColors = z.infer<typeof uiColorsSchema>;

export const defaultUiColors: UiColors = {
  bg: '#0d1117',
  bgElevated: '#161b22',
  bgHover: '#1f2630',
  border: '#30363d',
  text: '#c9d1d9',
  textMuted: '#8b949e',
  accent: '#58a6ff',
  danger: '#f85149',
  warning: '#d29922',
  success: '#3fb950',
};

export const uiColorVars: Record<keyof UiColors, string> = {
  bg: '--bg',
  bgElevated: '--bg-elevated',
  bgHover: '--bg-hover',
  border: '--border',
  text: '--text',
  textMuted: '--text-muted',
  accent: '--accent',
  danger: '--danger',
  warning: '--warning',
  success: '--success',
};

export const actionIds = [
  'tab.new',
  'tab.close',
  'tab.next',
  'tab.prev',
  'palette.open',
  'terminal.find',
  'sidebar.toggle',
  'terminal.copy',
  'terminal.paste',
  'env.reload',
  'settings.open',
  'data.import',
  'data.export',
  'pane.splitRight',
  'pane.splitDown',
  'pane.focusNext',
  'pane.focusPrev',
  'workspace.save',
  'workspace.manage',
  'logHighlight.toggle',
  'tests.open',
  'dockerPorts.open',
  'history.open',
  'plugins.open',
] as const;
export type ActionId = (typeof actionIds)[number];

export const defaultKeybindings: Record<ActionId, string | null> = {
  'tab.new': 'Ctrl+T',
  'tab.close': 'Ctrl+W',
  'tab.next': 'Ctrl+Tab',
  'tab.prev': 'Ctrl+Shift+Tab',
  'palette.open': 'Ctrl+P',
  'terminal.find': 'Ctrl+F',
  'sidebar.toggle': 'Ctrl+B',
  'terminal.copy': 'Ctrl+Shift+C',
  'terminal.paste': 'Ctrl+Shift+V',
  'env.reload': null,
  'settings.open': 'Ctrl+,',
  'data.import': null,
  'data.export': null,
  'pane.splitRight': 'Alt+Shift+=',
  'pane.splitDown': 'Alt+Shift+-',
  'pane.focusNext': 'Alt+ArrowRight',
  'pane.focusPrev': 'Alt+ArrowLeft',
  'workspace.save': null,
  'workspace.manage': null,
  'logHighlight.toggle': null,
  'tests.open': null,
  'dockerPorts.open': null,
  'history.open': null,
  'plugins.open': null,
};

export const settingsSchema = z.object({
  version: z.literal(1),
  defaultProfile: z.string().nullable(),
  appearance: z.object({
    fontFamily: z.string().min(1),
    fontSize: z.number().int().min(6).max(72),
    cursorStyle: z.enum(['block', 'bar', 'underline']),
    scrollback: z.number().int().min(0).max(1_000_000),
    theme: themeSchema,
    ui: uiColorsSchema,
    /** Paleta do seletor de cores (a mais nova primeiro). */
    palette: z.array(hexColor).max(PALETTE_MAX),
  }),
  editor: z.object({
    command: z.string().min(1),
    args: z.array(z.string()),
  }),
  notifications: z.object({
    longCommand: z.object({
      enabled: z.boolean(),
      thresholdSeconds: z.number().min(1),
    }),
  }),
  keybindings: z.record(z.string(), z.string().nullable()),
  terminal: z.object({
    copyOnCtrlCWithSelection: z.boolean(),
  }),
  logHighlight: logHighlightSchema,
  environments: z.array(environmentProfileSchema),
  /** Ids de plugins desativados. */
  plugins: z.object({ disabled: z.array(z.string()) }),
  profiles: z.object({
    overrides: z.record(z.string(), profileOverrideSchema),
    custom: z.array(customProfileSchema),
  }),
});
export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings: Settings = {
  version: 1,
  defaultProfile: 'builtin.pwsh',
  appearance: {
    fontFamily: 'Cascadia Mono, Consolas, monospace',
    fontSize: 14,
    cursorStyle: 'bar',
    scrollback: 10_000,
    theme: defaultTheme,
    ui: defaultUiColors,
    palette: DEFAULT_PALETTE,
  },
  editor: { command: 'code', args: ['-g', '{file}:{line}:{column}'] },
  notifications: { longCommand: { enabled: true, thresholdSeconds: 10 } },
  keybindings: { ...defaultKeybindings },
  terminal: { copyOnCtrlCWithSelection: true },
  logHighlight: defaultLogHighlight,
  environments: [],
  plugins: { disabled: [] },
  profiles: { overrides: {}, custom: [] },
};
