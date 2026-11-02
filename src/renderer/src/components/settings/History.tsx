import { useCallback, useEffect, useState } from 'react';
import type { HistoryEntry } from '@shared/history';
import { api } from '../../api';
import { confirmDialog, useStore } from '../../store';

const KIND_LABEL: Record<HistoryEntry['kind'], string> = {
  auto: 'Automático',
  manual: 'Ponto de restauração',
  restore: 'Antes de restaurar',
};

const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

/** Snapshots dos dados (configurações, comandos, projetos e workspaces) com restauração. */
export function History(): JSX.Element {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [label, setLabel] = useState('');
  const config = useStore((s) => s.config);
  const pushNotice = useStore((s) => s.pushNotice);

  const reload = useCallback(async () => setEntries(await api.invoke('history:list')), []);

  // Mudanças nos dados geram snapshots alguns segundos depois (debounce no main).
  useEffect(() => {
    void reload();
    const timer = setTimeout(() => void reload(), 3500);
    return () => clearTimeout(timer);
  }, [config, reload]);

  const report = async (
    result: { ok: true } | { ok: false; error: string },
    success?: string,
  ): Promise<void> => {
    if (!result.ok) pushNotice('error', result.error);
    else if (success) pushNotice('info', success);
    await reload();
  };

  return (
    <>
      <p className="hint">
        O Gunslinger guarda versões de configurações, comandos, projetos e workspaces a cada mudança (os 50
        automáticos mais recentes). Pontos de restauração com nome não são apagados automaticamente.
      </p>
      <form
        className="history-create"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!label.trim()) return;
          await report(
            await api.invoke('history:create', { label: label.trim() }),
            'Ponto de restauração criado.',
          );
          setLabel('');
        }}
      >
        <input
          aria-label="Nome do ponto de restauração"
          placeholder="Nome do ponto de restauração"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="submit" disabled={!label.trim()}>
          Criar ponto de restauração
        </button>
      </form>
      {entries === null ? (
        <p className="empty">Carregando…</p>
      ) : entries.length === 0 ? (
        <p className="empty">Nenhum snapshot ainda.</p>
      ) : (
        <ul className="project-list" data-testid="history-list">
          {entries.map((e) => (
            <li key={e.id} data-testid="history-item">
              <div>
                <strong>{e.label ?? KIND_LABEL[e.kind]}</strong>
                <small>
                  {dateFormat.format(e.createdAt)} · {e.label ? `${KIND_LABEL[e.kind]} · ` : ''}
                  {e.counts.commands} comando(s), {e.counts.projects} projeto(s), {e.counts.workspaces}{' '}
                  workspace(s)
                </small>
              </div>
              <div className="row-actions">
                <button
                  onClick={async () => {
                    const ok = await confirmDialog(
                      'Restaurar snapshot',
                      `Substituir configurações, comandos, projetos e workspaces pela versão de ${dateFormat.format(e.createdAt)}? O estado atual fica salvo como "Antes de restaurar".`,
                      'Restaurar',
                    );
                    if (ok)
                      await report(await api.invoke('history:restore', { id: e.id }), 'Snapshot restaurado.');
                  }}
                >
                  Restaurar
                </button>
                <button
                  onClick={async () => {
                    if (
                      await confirmDialog(
                        'Excluir snapshot',
                        `Excluir o snapshot de ${dateFormat.format(e.createdAt)}?`,
                        'Excluir',
                      )
                    ) {
                      await report(await api.invoke('history:delete', { id: e.id }));
                    }
                  }}
                >
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
