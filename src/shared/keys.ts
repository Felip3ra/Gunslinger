const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const;
const MODIFIER_ALIASES: Record<string, (typeof MODIFIER_ORDER)[number]> = {
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  cmd: 'Meta',
  win: 'Meta',
};

/** Normaliza um atalho ("shift+ctrl+t" → "Ctrl+Shift+T") para comparar e casar com eventos de teclado. */
export function normalizeAccelerator(accel: string): string | null {
  const parts = accel
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const mods = new Set<string>();
  let key: string | null = null;
  for (const part of parts) {
    const mod = MODIFIER_ALIASES[part.toLowerCase()];
    if (mod) mods.add(mod);
    else if (key === null) key = part.length === 1 ? part.toUpperCase() : part[0]!.toUpperCase() + part.slice(1);
    else return null;
  }
  if (key === null) return null;
  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join('+');
}

/** Atalhos com Ctrl que o Bash/readline também usa (aviso na tela de atalhos). */
export const READLINE_BINDINGS: Record<string, string> = {
  'Ctrl+A': 'início da linha',
  'Ctrl+B': 'cursor para trás',
  'Ctrl+D': 'apagar caractere / sair',
  'Ctrl+E': 'fim da linha',
  'Ctrl+F': 'cursor para frente',
  'Ctrl+K': 'apagar até o fim da linha',
  'Ctrl+L': 'limpar a tela',
  'Ctrl+N': 'próximo comando do histórico',
  'Ctrl+P': 'comando anterior do histórico',
  'Ctrl+R': 'busca no histórico',
  'Ctrl+T': 'trocar caracteres',
  'Ctrl+U': 'apagar até o início da linha',
  'Ctrl+W': 'apagar a palavra anterior',
  'Ctrl+Y': 'colar o que foi apagado',
  'Ctrl+Z': 'suspender processo',
};
