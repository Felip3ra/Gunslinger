import { useEffect, useMemo, useState } from 'react';
import { syncVariableDefs } from '@shared/commands';
import type { SavedCommand, VariableDef } from '@shared/model';
import { extractVariables } from '@shared/variables';
import { api } from '../api';
import { useStore, EMPTY } from '../store';

/** Formulário de criação/edição/duplicação de comando salvo (id vazio = comando novo). */
export function CommandForm(): JSX.Element | null {
  const editing = useStore((s) => s.editingCommand);
  const profiles = useStore((s) => s.profiles);
  const commands = useStore((s) => s.config?.commands.commands ?? EMPTY);
  const [draft, setDraft] = useState<SavedCommand | null>(null);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(editing);
    setTouched(false);
    setError(null);
  }, [editing]);

  const categories = useMemo(() => [...new Set(commands.map((c) => c.category).filter(Boolean))].sort(), [commands]);
  if (!editing || !draft) return null;

  const variables = extractVariables(draft.command);
  const setVar = (name: string, patch: Partial<VariableDef>): void =>
    setDraft({ ...draft, variables: { ...draft.variables, [name]: { options: [], ...draft.variables[name], ...patch } } });
  const close = (): void => useStore.setState({ editingCommand: null });
  const invalidName = !draft.name.trim();
  const invalidCommand = !draft.command.trim();

  const save = async (): Promise<void> => {
    setTouched(true);
    if (invalidName || invalidCommand) return;
    const command: SavedCommand = {
      ...draft,
      id: draft.id || crypto.randomUUID(),
      name: draft.name.trim(),
      category: draft.category.trim(),
      cwd: draft.cwd?.trim() || null,
      variables: syncVariableDefs(draft.command, draft.variables),
    };
    const result = await api.invoke('commands:save', command);
    if (result.ok) close();
    else setError(result.error);
  };

  return (
    <div className="modal-backdrop">
      <form
        className="modal wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-form-title"
        data-testid="command-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            close();
          }
        }}
      >
        <h2 id="command-form-title">{draft.id ? 'Editar comando' : 'Novo comando'}</h2>
        <label className="field">
          <span>Nome *</span>
          <input autoFocus aria-invalid={touched && invalidName} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          {touched && invalidName && <small className="field-error">Obrigatório</small>}
        </label>
        <label className="field">
          <span>Comando * (variáveis no formato {'{nome}'}; use {'{{'} e {'}}'} para chaves literais)</span>
          <textarea
            rows={3}
            spellCheck={false}
            aria-invalid={touched && invalidCommand}
            value={draft.command}
            onChange={(e) => setDraft({ ...draft, command: e.target.value })}
          />
          {touched && invalidCommand && <small className="field-error">Obrigatório</small>}
        </label>
        <label className="field">
          <span>Descrição</span>
          <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Categoria</span>
            <input list="categories" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
            <datalist id="categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>Shell de destino</span>
            <select value={draft.targetProfileId ?? ''} onChange={(e) => setDraft({ ...draft, targetProfileId: e.target.value || null })}>
              <option value="">Aba ativa</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {draft.targetProfileId && !profiles.some((p) => p.id === draft.targetProfileId) && (
                <option value={draft.targetProfileId}>{draft.targetProfileId} (não encontrado)</option>
              )}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Pasta de execução</span>
          <div className="input-with-button">
            <input value={draft.cwd ?? ''} placeholder="Pasta atual da aba" onChange={(e) => setDraft({ ...draft, cwd: e.target.value || null })} />
            <button
              type="button"
              onClick={async () => {
                const folder = await api.invoke('projects:pickFolder');
                if (folder) setDraft({ ...draft, cwd: folder });
              }}
            >
              Escolher…
            </button>
          </div>
        </label>
        {variables.length > 0 && (
          <fieldset className="variables">
            <legend>Variáveis</legend>
            {variables.map((name) => {
              const def = draft.variables[name];
              return (
                <div key={name} className="variable-def">
                  <code>{`{${name}}`}</code>
                  <input placeholder="Rótulo" aria-label={`Rótulo de ${name}`} value={def?.label ?? ''} onChange={(e) => setVar(name, { label: e.target.value || undefined })} />
                  <input placeholder="Valor padrão" aria-label={`Valor padrão de ${name}`} value={def?.default ?? ''} onChange={(e) => setVar(name, { default: e.target.value || undefined })} />
                  <textarea
                    rows={2}
                    placeholder="Opções (uma por linha)"
                    aria-label={`Opções de ${name}`}
                    value={(def?.options ?? []).join('\n')}
                    onChange={(e) => setVar(name, { options: e.target.value.split('\n').map((o) => o.trim()).filter(Boolean) })}
                  />
                </div>
              );
            })}
          </fieldset>
        )}
        {error && <p className="field-error">{error}</p>}
        <div className="modal-actions">
          <button type="button" onClick={close}>
            Cancelar
          </button>
          <button type="submit" className="primary">
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
