import { useEffect, useState } from 'react';
import { READLINE_BINDINGS } from '@shared/keys';
import { actionIds, type ActionId } from '@shared/model';
import { actions } from '../../actions';
import { eventToAccelerator } from '../../keyboard';
import { useStore } from '../../store';
import { update } from './update';

export function Shortcuts(): JSX.Element {
  const keybindings = useStore((s) => s.config!.settings.keybindings);
  const [capturing, setCapturing] = useState<ActionId | null>(null);
  const [pending, setPending] = useState<{ id: ActionId; accel: string; warning: string | null } | null>(null);

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setCapturing(null);
        return;
      }
      const accel = eventToAccelerator(e);
      if (!accel) return;
      const owner = Object.entries(keybindings).find(([id, k]) => k === accel && id !== capturing)?.[0];
      const readline = READLINE_BINDINGS[accel];
      const warnings = [
        owner ? `Já usado por "${actions[owner as ActionId]?.title ?? owner}" (será removido de lá).` : null,
        readline ? `Também é usado pelo Bash/readline (${readline}); a tecla deixará de chegar ao shell.` : null,
      ].filter(Boolean);
      setPending({ id: capturing, accel, warning: warnings.length ? warnings.join(' ') : null });
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing, keybindings]);

  const save = async (id: ActionId, accel: string | null): Promise<void> => {
    const next = { ...keybindings, [id]: accel };
    // Remove o atalho de quem já o usava: a primeira ação do arquivo ficaria com ele.
    if (accel) for (const [other, k] of Object.entries(next)) if (other !== id && k === accel) next[other] = null;
    await update(['keybindings'], next);
    setPending(null);
  };

  return (
    <table className="shortcuts" data-testid="shortcuts">
      <tbody>
        {actionIds.map((id) => (
          <tr key={id}>
            <td>{actions[id].title}</td>
            <td>
              {capturing === id ? <em>Pressione a combinação… (Esc cancela)</em> : <kbd>{keybindings[id] ?? '—'}</kbd>}
              {pending?.id === id && (
                <div className="pending-shortcut" data-testid="pending-shortcut">
                  <kbd>{pending.accel}</kbd> {pending.warning && <span className="warn-text">{pending.warning}</span>}
                  <button className="primary" onClick={() => void save(id, pending.accel)}>
                    Salvar
                  </button>
                  <button onClick={() => setPending(null)}>Cancelar</button>
                </div>
              )}
            </td>
            <td className="row-actions">
              <button aria-label={`Alterar atalho de ${actions[id].title}`} onClick={() => setCapturing(id)}>
                Alterar
              </button>
              <button aria-label={`Remover atalho de ${actions[id].title}`} onClick={() => void save(id, null)} disabled={!keybindings[id]}>
                Remover
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
