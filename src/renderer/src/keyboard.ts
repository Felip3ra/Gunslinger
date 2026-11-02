import { normalizeAccelerator } from '@shared/keys';

const IGNORED_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock']);

/** Converte um evento de teclado no formato de atalho normalizado ("Ctrl+Shift+T"). */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (IGNORED_KEYS.has(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Meta');
  // Com Shift, e.key muda ("!" em vez de "1"); para letras e dígitos, e.code é estável.
  let key = e.key;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit[0-9]$/.test(e.code)) key = e.code.slice(5);
  else if (e.code === 'Equal') key = '=';
  else if (e.code === 'Minus') key = '-';
  else if (key === ' ') key = 'Space';
  parts.push(key);
  return normalizeAccelerator(parts.join('+'));
}
