import { clearCommandHistory } from '../../command-history';
import { confirmDialog, useStore } from '../../store';
import { update } from './update';

export function TerminalSettings(): JSX.Element {
  const s = useStore((st) => st.config!.settings);
  const profiles = useStore((st) => st.profiles);
  return (
    <>
      <label className="field">
        <span>Perfil padrão</span>
        <select value={s.defaultProfile ?? ''} onChange={(e) => void update(['defaultProfile'], e.target.value || null)}>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="field-row">
        <label className="field">
          <span>Editor (comando)</span>
          <input defaultValue={s.editor.command} onBlur={(e) => e.target.value && e.target.value !== s.editor.command && void update(['editor', 'command'], e.target.value)} />
        </label>
        <label className="field">
          <span>Argumentos ({'{file}'}, {'{line}'}, {'{column}'}; um por linha)</span>
          <textarea
            rows={2}
            defaultValue={s.editor.args.join('\n')}
            onBlur={(e) => void update(['editor', 'args'], e.target.value.split('\n').map((a) => a.trim()).filter(Boolean))}
          />
        </label>
      </div>
      <div className="field-row">
        <label className="checkline">
          <input
            type="checkbox"
            checked={s.notifications.longCommand.enabled}
            onChange={(e) => void update(['notifications', 'longCommand', 'enabled'], e.target.checked)}
          />
          Notificar comandos demorados com a janela fora de foco
        </label>
        <label className="field">
          <span>A partir de (segundos)</span>
          <input
            type="number"
            min={1}
            defaultValue={s.notifications.longCommand.thresholdSeconds}
            onBlur={(e) => void update(['notifications', 'longCommand', 'thresholdSeconds'], Number(e.target.value))}
          />
        </label>
      </div>
      <label className="checkline">
        <input type="checkbox" checked={s.terminal.copyOnCtrlCWithSelection} onChange={(e) => void update(['terminal', 'copyOnCtrlCWithSelection'], e.target.checked)} />
        Ctrl+C copia quando há texto selecionado (sem seleção, interrompe)
      </label>
      <label className="checkline">
        <input type="checkbox" checked={s.session.restore} onChange={(e) => void update(['session', 'restore'], e.target.checked)} />
        Reabrir as abas e painéis da última sessão ao iniciar
      </label>
      <div className="field-row">
        <label className="checkline">
          <input type="checkbox" checked={s.terminal.commandHistory} onChange={(e) => void update(['terminal', 'commandHistory'], e.target.checked)} />
          Guardar os comandos digitados para busca ({s.keybindings['commandHistory.search'] ?? 'pela paleta'}). Comandos começados por espaço não são guardados.
        </label>
        <button
          type="button"
          data-testid="clear-command-history"
          onClick={() =>
            void confirmDialog('Limpar histórico de comandos', 'Todos os comandos guardados serão apagados.', 'Limpar').then((ok) => {
              if (ok) clearCommandHistory();
            })
          }
        >
          Limpar histórico
        </button>
      </div>
      <label className="field">
        <span>Ao fechar uma aba, processos que ela iniciou e saíram dela (start, servidores em segundo plano)</span>
        <select value={s.terminal.detachedProcesses} data-testid="detached-processes" onChange={(e) => void update(['terminal', 'detachedProcesses'], e.target.value)}>
          <option value="ask">Perguntar</option>
          <option value="kill">Encerrar sempre</option>
          <option value="keep">Manter rodando</option>
        </select>
      </label>
    </>
  );
}
