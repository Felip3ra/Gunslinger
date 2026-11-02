import { useEffect, useRef } from 'react';

/**
 * Proteção contra confirmação acidental: um diálogo aberto por um Enter (na paleta, por exemplo)
 * receberia o resto desse mesmo Enter (keypress) e se confirmaria sozinho. O diálogo só aceita
 * Enter depois de uma tecla solta já com ele aberto.
 */
export function useArmedAfterKeyup(active: boolean): { current: boolean } {
  const armed = useRef(false);
  useEffect(() => {
    armed.current = false;
    if (!active) return;
    const arm = (): void => {
      armed.current = true;
    };
    window.addEventListener('keyup', arm, true);
    window.addEventListener('mousedown', arm, true);
    return () => {
      window.removeEventListener('keyup', arm, true);
      window.removeEventListener('mousedown', arm, true);
    };
  }, [active]);
  return armed;
}

/** Bloqueia Enter/espaço enquanto o diálogo não estiver "armado" (fase de captura). */
export function useBlockUnarmedKeys(active: boolean, armed: { current: boolean }): void {
  useEffect(() => {
    if (!active) return;
    const block = (e: KeyboardEvent): void => {
      if (!armed.current && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', block, true);
    window.addEventListener('keypress', block, true);
    return () => {
      window.removeEventListener('keydown', block, true);
      window.removeEventListener('keypress', block, true);
    };
  }, [active, armed]);
}
