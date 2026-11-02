import { useState } from 'react';
import { parseVariablesText, variablesToText, type EnvironmentProfile } from '@shared/env-profiles';
import { confirmDialog, EMPTY, useStore } from '../../store';
import { update } from './update';
import { ColorPicker } from '../ColorPicker';

function Editor({ initial, onClose }: { initial: EnvironmentProfile; onClose: () => void }): JSX.Element {
  const environments = useStore((s) => s.config?.settings.environments ?? EMPTY);
  const [draft, setDraft] = useState(initial);
  const [text, setText] = useState(variablesToText(initial.variables));
  const [errors, setErrors] = useState<string[]>([]);
  return (
    <form
      className="profile-editor"
      data-testid="environment-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = parseVariablesText(text);
        if (parsed.errors.length > 0 || !draft.name.trim()) {
          setErrors(draft.name.trim() ? parsed.errors : ['Informe o nome.']);
          return;
        }
        const env: EnvironmentProfile = {
          ...draft,
          id: draft.id || crypto.randomUUID(),
          name: draft.name.trim(),
          variables: parsed.variables,
        };
        const exists = environments.some((x) => x.id === env.id);
        await update(
          ['environments'],
          exists ? environments.map((x) => (x.id === env.id ? env : x)) : [...environments, env],
        );
        onClose();
      }}
    >
      <div className="field-row">
        <label className="field">
          <span>Nome *</span>
          <input
            aria-label="Nome do ambiente"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Cor</span>
          <ColorPicker
            label="Cor do ambiente"
            value={draft.color}
            onChange={(color) => setDraft({ ...draft, color })}
          />
        </label>
      </div>
      <label className="checkline">
        <input
          type="checkbox"
          checked={draft.confirm}
          onChange={(e) => setDraft({ ...draft, confirm: e.target.checked })}
        />{' '}
        Ambiente sensível: pedir confirmação ao aplicar
      </label>
      <label className="field">
        <span>Variáveis (uma por linha, NOME=valor)</span>
        <textarea
          aria-label="Variáveis do ambiente"
          rows={5}
          spellCheck={false}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {errors.map((err) => (
        <p key={err} className="field-error">
          {err}
        </p>
      ))}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
        <button type="submit" className="primary">
          Salvar ambiente
        </button>
      </div>
    </form>
  );
}

export function Environments(): JSX.Element {
  const environments = useStore((s) => s.config?.settings.environments ?? EMPTY);
  const [editing, setEditing] = useState<EnvironmentProfile | null>(null);
  return (
    <>
      <p className="hint">
        Use pela paleta: "Nova aba com ambiente" (variáveis no processo) ou "Aplicar ambiente" (comandos na
        aba ativa).
      </p>
      <ul className="project-list" data-testid="environment-list">
        {environments.map((env) => (
          <li key={env.id}>
            <div>
              <span className="env-dot" style={{ background: env.color }} /> <strong>{env.name}</strong>
              {env.confirm && <small className="warn-text"> sensível</small>}
              <small>{Object.keys(env.variables).join(', ') || 'sem variáveis'}</small>
            </div>
            <div className="row-actions">
              <button onClick={() => setEditing(env)}>Editar</button>
              <button
                onClick={async () => {
                  if (await confirmDialog('Excluir ambiente', `Excluir "${env.name}"?`, 'Excluir')) {
                    await update(
                      ['environments'],
                      environments.filter((x) => x.id !== env.id),
                    );
                  }
                }}
              >
                Excluir
              </button>
            </div>
          </li>
        ))}
      </ul>
      {editing ? (
        <Editor key={editing.id || 'novo'} initial={editing} onClose={() => setEditing(null)} />
      ) : (
        <button
          onClick={() => setEditing({ id: '', name: '', color: '#58a6ff', confirm: false, variables: {} })}
        >
          + Ambiente
        </button>
      )}
    </>
  );
}
