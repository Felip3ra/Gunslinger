export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export const PALETTE_MAX = 32;

/** Paleta inicial: cores sugeridas (o usuário salva e remove as dele). */
export const DEFAULT_PALETTE = [
  '#0d1117', '#161b22', '#30363d', '#8b949e', '#c9d1d9', '#ffffff',
  '#f85149', '#ff7b72', '#d29922', '#e3b341', '#3fb950', '#56d364',
  '#39c5cf', '#58a6ff', '#1f6feb', '#bc8cff', '#a371f7', '#ff79c6',
];

const clamp = (n: number): number => Math.min(255, Math.max(0, Math.round(n)));

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, '0')).join('')}`;
}

/** `#rrggbb` → componentes (assume valor já normalizado). */
export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Lê uma cor digitada: `#rgb`, `#rrggbb` (com ou sem `#`), `rgb(r, g, b)` ou `r, g, b` / `r g b`.
 * Devolve `#rrggbb` em minúsculas, ou null se inválida.
 */
export function parseColor(input: string): string | null {
  const s = input.trim().toLowerCase();
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
  if (hex) {
    const h = hex[1]!;
    return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`;
  }
  const rgb = /^(?:rgb\s*\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*\)?$/.exec(s);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map(Number) as [number, number, number];
    if (r > 255 || g > 255 || b > 255) return null;
    // "rgb(" exige ")" e vice-versa.
    if (s.startsWith('rgb') !== s.endsWith(')')) return null;
    return rgbToHex({ r, g, b });
  }
  return null;
}

/** Cor nova no início da paleta, sem repetir, limitada a `max`. */
export function addToPalette(palette: readonly string[], color: string, max = PALETTE_MAX): string[] {
  return [color, ...palette.filter((c) => c !== color)].slice(0, max);
}
