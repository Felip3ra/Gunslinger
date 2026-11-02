import type { Terminal } from '@xterm/xterm';
import { api } from '../api';

/**
 * Cópia e colagem no terminal: Ctrl+C com seleção copia (sem seleção, segue como interrupção),
 * Ctrl+Shift+C sempre copia e Ctrl+V cola (com bracketed paste quando o programa pede).
 * Devolve false quando a tecla foi consumida e não deve chegar ao shell.
 */
export function handleClipboardKey(term: Terminal, e: KeyboardEvent, copyOnCtrlC: boolean): boolean {
  if (e.type !== 'keydown') return true;
  const ctrlOnly = e.ctrlKey && !e.altKey && !e.metaKey;
  const key = e.key.toLowerCase();
  if (ctrlOnly && !e.shiftKey && key === 'c' && copyOnCtrlC && term.hasSelection()) {
    void api.invoke('clipboard:write', { text: term.getSelection() });
    term.clearSelection();
    e.preventDefault();
    return false;
  }
  if (ctrlOnly && e.shiftKey && key === 'c') {
    if (term.hasSelection()) void api.invoke('clipboard:write', { text: term.getSelection() });
    e.preventDefault();
    return false;
  }
  if (ctrlOnly && key === 'v') {
    void api.invoke('clipboard:read').then((text) => text && term.paste(text));
    e.preventDefault();
    return false;
  }
  return true;
}
