import { useState } from 'react';
import type { CustomProfile, ShellProfile } from '@shared/model';
import { api } from '../../api';
import { confirmDialog, useStore } from '../../store';
import { ColorPicker } from '../ColorPicker';
import { BUILTIN_ICONS, ProfileIcon } from '../ProfileIcon';

function ProfileEditor({ profile, onClose }: { profile: CustomProfile; onClose: () => void }): JSX.Element {
  const [draft, setDraft] = useState(profile);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="profile-editor"
      data-testid="profile-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await api.invoke('profiles:save', { ...draft, id: draft.id || crypto.randomUUID() });
        if (result.ok) onClose();
        else setError(result.error);
      }}
    >
      <div className="field-row">
        <label className="field">
          <span>Nome *</span>
          <input
            aria-label="Nome do perfil"
            required
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Executável *</span>
          <input
            aria-label="Executável"
            required
            value={draft.executable}
            onChange={(e) => setDraft({ ...draft, executable: e.target.value })}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Argumentos (um por linha)</span>
          <textarea
            rows={2}
            value={draft.args.join('\n')}
            onChange={(e) => setDraft({ ...draft, args: e.target.value.split('\n').filter(Boolean) })}
          />
        </label>
        <label className="field">
          <span>Pasta inicial</span>
          <input
            value={draft.cwd ?? ''}
            onChange={(e) => setDraft({ ...draft, cwd: e.target.value || null })}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Cor</span>
          <ColorPicker
            label="Cor do perfil"
            value={draft.color ?? '#a371f7'}
            onChange={(color) => setDraft({ ...draft, color })}
          />
        </label>
        <label className="field">
          <span>Ícone (embutido ou caminho .png/.ico)</span>
          <input
            list="builtin-icons"
            value={draft.icon ?? ''}
            onChange={(e) => setDraft({ ...draft, icon: e.target.value || null })}
          />
          <datalist id="builtin-icons">
            {BUILTIN_ICONS.map((i) => (
              <option key={i} value={`builtin:${i}`} />
            ))}
          </datalist>
        </label>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="primary">
          Salvar perfil
        </button>
      </div>
    </form>
  );
}

export function Profiles(): JSX.Element {
  const profiles = useStore((s) => s.profiles);
  const custom = useStore((s) => s.config!.settings.profiles.custom);
  const [editing, setEditing] = useState<CustomProfile | null>(null);
  const override = (p: ShellProfile, patch: Record<string, unknown>): void => {
    void api.invoke('profiles:setOverride', {
      id: p.id,
      override: { ...useStore.getState().config!.settings.profiles.overrides[p.id], ...patch },
    });
  };
  return (
    <>
      <ul className="project-list" data-testid="profile-list">
        {profiles.map((p) => (
          <li key={p.id}>
            <div>
              <ProfileIcon icon={p.icon} color={p.color} /> <strong>{p.name}</strong>
              <small>
                {p.executable} {p.args.join(' ')} {p.source === 'plugin' && '· plugin'}{' '}
                {!p.available && '· indisponível'}
              </small>
            </div>
            <div className="row-actions">
              <ColorPicker
                label={`Cor de ${p.name}`}
                value={p.color}
                onChange={(color) =>
                  p.source === 'custom'
                    ? void api.invoke('profiles:save', { ...custom.find((c) => c.id === p.id)!, color })
                    : override(p, { color })
                }
              />
              {p.source !== 'custom' ? (
                <label className="checkline">
                  <input
                    type="checkbox"
                    aria-label={`Ocultar ${p.name}`}
                    checked={p.hidden}
                    onChange={(e) => override(p, { hidden: e.target.checked })}
                  />{' '}
                  Ocultar
                </label>
              ) : (
                <>
                  <button onClick={() => setEditing(custom.find((c) => c.id === p.id)!)}>Editar</button>
                  <button
                    onClick={async () => {
                      if (await confirmDialog('Excluir perfil', `Excluir o perfil "${p.name}"?`, 'Excluir'))
                        await api.invoke('profiles:delete', { id: p.id });
                    }}
                  >
                    Excluir
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {editing ? (
        <ProfileEditor profile={editing} onClose={() => setEditing(null)} />
      ) : (
        <button
          onClick={() =>
            setEditing({
              id: '',
              name: '',
              executable: '',
              args: [],
              cwd: null,
              color: null,
              icon: null,
              shellIntegration: false,
            })
          }
        >
          + Perfil customizado
        </button>
      )}
    </>
  );
}
