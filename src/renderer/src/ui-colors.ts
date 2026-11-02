import { uiColorVars, type UiColors } from '@shared/model';

/** Aplica as cores da interface (settings.appearance.ui) nas variáveis CSS da raiz. */
export function applyUiColors(colors: UiColors): void {
  const root = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(uiColorVars) as [keyof UiColors, string][]) root.setProperty(cssVar, colors[key]);
}
