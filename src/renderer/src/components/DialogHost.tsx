import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useArmedAfterKeyup, useBlockUnarmedKeys } from './use-armed';

export function DialogHost(): JSX.Element | null {
  const dialog = useStore((s) => s.dialog);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const armed = useArmedAfterKeyup(!!dialog);
  useBlockUnarmedKeys(!!dialog, armed);

  useEffect(() => {
    if (!dialog) return;
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        dialog.resolve(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dialog]);

  if (!dialog) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title" data-testid="dialog">
        <h2 id="dialog-title">{dialog.title}</h2>
        <p>{dialog.message}</p>
        {dialog.detail && <pre className="dialog-detail">{dialog.detail}</pre>}
        <div className="modal-actions">
          {dialog.buttons.map((b) => (
            <button key={b.value} ref={b.primary ? primaryRef : undefined} className={b.primary ? 'primary' : ''} onClick={() => dialog.resolve(b.value)}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
