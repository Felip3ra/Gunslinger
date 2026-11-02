import { useEffect, useMemo, useRef, useState } from 'react';
import { extractVariables, renderTemplate } from '@shared/variables';
import { useStore } from '../store';
import { useArmedAfterKeyup, useBlockUnarmedKeys } from './use-armed';

/** Diálogo que pede os valores das variáveis e mostra o comando final antes de enviar. */
export function VariablesDialog(): JSX.Element | null {
  const prompt = useStore((s) => s.variablesPrompt);
  const [values, setValues] = useState<Record<string, string>>({});
  const firstRef = useRef<HTMLInputElement & HTMLSelectElement>(null);
  const armed = useArmedAfterKeyup(!!prompt);
  useBlockUnarmedKeys(!!prompt, armed);

  useEffect(() => {
    if (!prompt) return;
    setValues(prompt.initial);
    requestAnimationFrame(() => firstRef.current?.focus());
    // Esc cancela mesmo que o foco ainda esteja fora do diálogo (no terminal, por exemplo).
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      prompt.resolve(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [prompt]);

  const names = useMemo(() => (prompt ? extractVariables(prompt.command.text) : []), [prompt]);
  if (!prompt) return null;

  const preview = renderTemplate(prompt.command.text, values);
  const missing = names.filter((n) => !(values[n] ?? '').trim());
  const confirm = (): void => {
    if (missing.length === 0) prompt.resolve(values);
  };

  return (
    <div className="modal-backdrop">
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vars-title"
        data-testid="variables-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          confirm();
        }}
      >
        <h2 id="vars-title">{prompt.command.title}</h2>
        {names.map((name, i) => {
          const def = prompt.command.variables[name];
          const label = def?.label || name;
          const fromProject = prompt.fromProject.includes(name);
          const common = {
            id: `var-${name}`,
            value: values[name] ?? '',
            'aria-invalid': !(values[name] ?? '').trim(),
            ref: i === 0 ? firstRef : undefined,
          };
          return (
            <label key={name} className="field">
              <span>
                {label}
                {fromProject && <em className="hint"> (do projeto)</em>}
              </span>
              {def && def.options.length > 0 ? (
                <select {...common} onChange={(e) => setValues({ ...values, [name]: e.target.value })}>
                  {!def.options.includes(values[name] ?? '') && <option value={values[name] ?? ''}>{values[name] || '— escolha —'}</option>}
                  {def.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input {...common} onChange={(e) => setValues({ ...values, [name]: e.target.value })} />
              )}
            </label>
          );
        })}
        <div className="field">
          <span>Comando que será {prompt.mode === 'execute' ? 'executado' : 'inserido'}</span>
          <pre className="dialog-detail" data-testid="variables-preview">
            {preview}
          </pre>
        </div>
        <div className="modal-actions">
          <button type="button" onClick={() => prompt.resolve(null)}>
            Cancelar
          </button>
          <button type="submit" className="primary" disabled={missing.length > 0}>
            {prompt.mode === 'execute' ? 'Executar' : 'Inserir'}
          </button>
        </div>
      </form>
    </div>
  );
}
