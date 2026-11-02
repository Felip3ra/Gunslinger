import { useStore } from '../../store';
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
    </>
  );
}
