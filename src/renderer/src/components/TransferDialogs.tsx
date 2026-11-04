import { useEffect, useMemo, useState } from 'react';
import { NO_CATEGORY } from '@shared/commands';
import type { ConflictAction, ImportPreview } from '@shared/transfer';
import { api } from '../api';
import { useStore } from '../store';

const close = (): void => useStore.setState({ transferDialog: null });

function ExportDialog(): JSX.Element {
  const config = useStore((s) => s.config!);
  const categories = useMemo(() => [...new Set(config.commands.commands.map((c) => c.category))].sort(), [config]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(categories));
  const [profileIds, setProfileIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [hostIds, setHostIds] = useState<string[]>([]);
  const toggle = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <div className="modal wide" role="dialog" aria-modal="true" aria-label="Exportar" data-testid="export-dialog">
      <h2>Exportar</h2>
      <fieldset className="variables">
        <legend>Comandos por categoria</legend>
        {categories.length === 0 && <p className="empty">Nenhum comando salvo.</p>}
        {categories.map((c) => (
          <label key={c} className="checkline">
            <input type="checkbox" checked={selected.has(c)} onChange={() => setSelected((s) => new Set(toggle([...s], c)))} />
            {c || NO_CATEGORY} ({config.commands.commands.filter((x) => x.category === c).length})
          </label>
        ))}
      </fieldset>
      {config.settings.profiles.custom.length > 0 && (
        <fieldset className="variables">
          <legend>Perfis de shell customizados</legend>
          {config.settings.profiles.custom.map((p) => (
            <label key={p.id} className="checkline">
              <input type="checkbox" checked={profileIds.includes(p.id)} onChange={() => setProfileIds((l) => toggle(l, p.id))} />
              {p.name}
            </label>
          ))}
        </fieldset>
      )}
      {config.projects.projects.length > 0 && (
        <fieldset className="variables">
          <legend>Projetos</legend>
          {config.projects.projects.map((p) => (
            <label key={p.id} className="checkline">
              <input type="checkbox" checked={projectIds.includes(p.id)} onChange={() => setProjectIds((l) => toggle(l, p.id))} />
              {p.name}
            </label>
          ))}
          {projectIds.length > 0 && <p className="warn-text">As pastas raiz são exportadas como estão e podem não existir em outra máquina.</p>}
        </fieldset>
      )}
      {config.hosts.hosts.length > 0 && (
        <fieldset className="variables" data-testid="export-hosts">
          <legend>Hosts SSH</legend>
          {config.hosts.hosts.map((h) => (
            <label key={h.id} className="checkline">
              <input type="checkbox" checked={hostIds.includes(h.id)} onChange={() => setHostIds((l) => toggle(l, h.id))} />
              {h.name}
            </label>
          ))}
          {hostIds.length > 0 && (
            <p className="hint">Vão junto os grupos, os hosts de salto e as identidades. Senhas, frases-senha e chaves guardadas no keychain nunca são exportadas.</p>
          )}
        </fieldset>
      )}
      <div className="modal-actions">
        <button onClick={close}>Cancelar</button>
        <button
          className="primary"
          onClick={async () => {
            const allSelected = categories.every((c) => selected.has(c));
            const result = await api.invoke('transfer:export', { categories: allSelected ? 'all' : [...selected], profileIds, projectIds, hostIds });
            if (result) {
              useStore.getState().pushNotice('info', `Exportado para ${result.path}`);
              close();
            }
          }}
        >
          Exportar…
        </button>
      </div>
    </div>
  );
}

const KIND_LABEL = { command: 'Comando', profile: 'Perfil', project: 'Projeto', host: 'Host', identity: 'Identidade', key: 'Chave' } as const;

function ImportDialog({ preview }: { preview: ImportPreview }): JSX.Element {
  const [decisions, setDecisions] = useState<Record<string, ConflictAction>>({});
  const conflicts = preview.items.filter((i) => i.conflictWith);
  const setAll = (action: ConflictAction): void => setDecisions(Object.fromEntries(conflicts.map((c) => [c.key, action])));

  return (
    <div className="modal wide" role="dialog" aria-modal="true" aria-label="Importar" data-testid="import-dialog">
      <h2>Importar de {preview.sourcePath}</h2>
      <p>Revise os itens. Nada é gravado (nem executado) antes de você confirmar.</p>
      {preview.warnings && preview.warnings.length > 0 && (
        <details data-testid="import-warnings">
          <summary className="warn-text">{preview.warnings.length} item(ns) não serão importados</summary>
          <ul>
            {preview.warnings.map((w) => (
              <li key={w}>
                <small>{w}</small>
              </li>
            ))}
          </ul>
        </details>
      )}
      {conflicts.length > 0 && (
        <div className="row-actions">
          <span>Para todos os conflitos:</span>
          <button onClick={() => setAll('replace')}>Substituir</button>
          <button onClick={() => setAll('keepBoth')}>Manter ambos</button>
          <button onClick={() => setAll('skip')}>Ignorar</button>
        </div>
      )}
      <ul className="project-list">
        {preview.items.map((item) => (
          <li key={item.key} data-testid="import-item">
            <div>
              <strong>
                {KIND_LABEL[item.kind]}: {item.name}
              </strong>
              <pre className="dialog-detail">{item.detail}</pre>
              {item.notes.map((n) => (
                <small key={n} className="warn-text">
                  {n}
                </small>
              ))}
            </div>
            {item.conflictWith && (
              <label className="field">
                <span className="warn-text">Conflita com "{item.conflictWith}"</span>
                <select
                  aria-label={`Conflito de ${item.name}`}
                  value={decisions[item.key] ?? 'keepBoth'}
                  onChange={(e) => setDecisions({ ...decisions, [item.key]: e.target.value as ConflictAction })}
                >
                  <option value="replace">Substituir</option>
                  <option value="keepBoth">Manter ambos</option>
                  <option value="skip">Ignorar</option>
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>
      <div className="modal-actions">
        <button onClick={close}>Cancelar</button>
        <button
          className="primary"
          onClick={async () => {
            try {
              const result = await api.invoke('transfer:applyImport', {
                previewId: preview.previewId,
                decisions: Object.entries(decisions).map(([key, action]) => ({ key, action })),
              });
              useStore.getState().pushNotice('info', `Importação concluída: ${result.added} adicionado(s), ${result.replaced} substituído(s), ${result.skipped} ignorado(s).`);
              close();
            } catch (err) {
              useStore.getState().pushNotice('error', err instanceof Error ? err.message : String(err));
            }
          }}
        >
          Importar
        </button>
      </div>
    </div>
  );
}

export function TransferDialogs(): JSX.Element | null {
  const dialog = useStore((s) => s.transferDialog);
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !useStore.getState().dialog) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog]);
  if (!dialog) return null;
  return <div className="modal-backdrop">{dialog.kind === 'export' ? <ExportDialog /> : <ImportDialog preview={dialog.preview} />}</div>;
}
