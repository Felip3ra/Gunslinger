import { useEffect, useState } from 'react';
import { defaultTheme, defaultUiColors, type UiColors } from '@shared/model';
import { confirmDialog, EMPTY, useStore } from '../../store';
import { ColorPicker } from '../ColorPicker';
import { update } from './update';

const ANSI_NAMES = ['Preto', 'Vermelho', 'Verde', 'Amarelo', 'Azul', 'Magenta', 'Ciano', 'Branco'];

const UI_LABELS: [keyof UiColors, string][] = [
  ['bg', 'Fundo'],
  ['bgElevated', 'Painéis'],
  ['bgHover', 'Realce'],
  ['border', 'Borda'],
  ['text', 'Texto'],
  ['textMuted', 'Texto secundário'],
  ['accent', 'Destaque'],
  ['danger', 'Erro'],
  ['warning', 'Aviso'],
  ['success', 'Sucesso'],
];

function ColorField({
  label,
  value,
  path,
}: {
  label: string;
  value: string;
  path: (string | number)[];
}): JSX.Element {
  return (
    <div className="color-field">
      <ColorPicker label={label} value={value} onChange={(hex) => void update(path, hex)} />
      <span>{label}</span>
      <code className="color-code">{value}</code>
    </div>
  );
}

export function Appearance(): JSX.Element {
  const a = useStore((s) => s.config!.settings.appearance);
  const pluginThemes = useStore((s) => s.plugins?.contributions.themes ?? EMPTY);
  const [fontSize, setFontSize] = useState(String(a.fontSize));
  useEffect(() => setFontSize(String(a.fontSize)), [a.fontSize]);
  const color = (label: string, path: (string | number)[], value: string): JSX.Element => (
    <ColorField
      key={path.join('.')}
      label={`Terminal: ${label}`}
      value={value}
      path={['appearance', 'theme', ...path]}
    />
  );
  return (
    <>
      <div className="field-row">
        <label className="field">
          <span>Fonte</span>
          <input
            defaultValue={a.fontFamily}
            onBlur={(e) =>
              e.target.value !== a.fontFamily && void update(['appearance', 'fontFamily'], e.target.value)
            }
          />
        </label>
        <label className="field">
          <span>Tamanho da fonte</span>
          <input
            type="number"
            min={6}
            max={72}
            aria-label="Tamanho da fonte"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
            onBlur={() =>
              Number(fontSize) !== a.fontSize && void update(['appearance', 'fontSize'], Number(fontSize))
            }
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
        <label className="field">
          <span>Cursor</span>
          <select
            value={a.cursorStyle}
            onChange={(e) => void update(['appearance', 'cursorStyle'], e.target.value)}
          >
            <option value="bar">Barra</option>
            <option value="block">Bloco</option>
            <option value="underline">Sublinhado</option>
          </select>
        </label>
        <label className="field">
          <span>Histórico (linhas)</span>
          <input
            type="number"
            min={0}
            defaultValue={a.scrollback}
            onBlur={(e) =>
              Number(e.target.value) !== a.scrollback &&
              void update(['appearance', 'scrollback'], Number(e.target.value))
            }
          />
        </label>
      </div>
      <fieldset className="variables">
        <legend>Cores da interface</legend>
        <div className="color-grid">
          {UI_LABELS.map(([key, label]) => (
            <ColorField
              key={key}
              label={`Interface: ${label}`}
              value={a.ui[key]}
              path={['appearance', 'ui', key]}
            />
          ))}
        </div>
        <button
          type="button"
          className="link small"
          onClick={async () => {
            if (
              await confirmDialog(
                'Cores da interface',
                'Voltar as cores da interface ao padrão do Gunslinger?',
                'Restaurar',
              )
            ) {
              void update(['appearance', 'ui'], defaultUiColors);
            }
          }}
        >
          Restaurar cores padrão
        </button>
      </fieldset>
      <fieldset className="variables">
        <legend>Cores do terminal</legend>
        <label className="field">
          <span>Aplicar tema (copia as cores)</span>
          <select
            aria-label="Aplicar tema"
            value=""
            onChange={(e) => {
              const theme =
                e.target.value === 'default'
                  ? defaultTheme
                  : pluginThemes.find((t) => t.id === e.target.value)?.theme;
              if (theme) void update(['appearance', 'theme'], theme);
            }}
          >
            <option value="">Escolha um tema…</option>
            <option value="default">Padrão do Gunslinger</option>
            {pluginThemes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.pluginName})
              </option>
            ))}
          </select>
        </label>
        <div className="color-grid">
          {color('Fundo', ['background'], a.theme.background)}
          {color('Texto', ['foreground'], a.theme.foreground)}
          {color('Cursor', ['cursor'], a.theme.cursor)}
          {color('Seleção', ['selection'], a.theme.selection)}
          {a.theme.ansi.map((c, i) =>
            color(`${i >= 8 ? 'Claro: ' : ''}${ANSI_NAMES[i % 8]}`, ['ansi', i], c),
          )}
        </div>
      </fieldset>
    </>
  );
}
