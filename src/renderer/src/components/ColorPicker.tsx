import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { addToPalette, DEFAULT_PALETTE, hexToRgb, parseColor, rgbToHex, type Rgb } from '@shared/colors';
import { EMPTY, useStore } from '../store';
import { update } from './settings/update';

const CHANNELS: [keyof Rgb, string][] = [
  ['r', 'R'],
  ['g', 'G'],
  ['b', 'B'],
];
const POPOVER_WIDTH = 260;

/** Faixa do controle: a cor atual com o canal indo de 0 a 255. */
function channelTrack(rgb: Rgb, channel: keyof Rgb): string {
  return `linear-gradient(to right, ${rgbToHex({ ...rgb, [channel]: 0 })}, ${rgbToHex({ ...rgb, [channel]: 255 })})`;
}

/**
 * Seletor de cor: hexadecimal, RGB e paleta salva. O rascunho só é gravado em "Aplicar"
 * (ou Enter no campo hexadecimal); Esc ou clique fora descarta.
 */
export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
}): JSX.Element {
  const palette = useStore((s) => s.config?.settings.appearance.palette ?? EMPTY);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [text, setText] = useState(value);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const hexRef = useRef<HTMLInputElement>(null);

  const rgb = hexToRgb(draft);
  const parsed = parseColor(text);
  const setColor = (hex: string): void => {
    setDraft(hex);
    setText(hex);
  };
  const close = (): void => {
    setOpen(false);
    buttonRef.current?.focus();
  };
  const apply = (hex = draft): void => {
    if (hex !== value.toLowerCase()) onChange(hex);
    close();
  };

  const toggle = (): void => {
    if (open) return close();
    const normalized = parseColor(value) ?? '#000000';
    setColor(normalized);
    const rect = buttonRef.current!.getBoundingClientRect();
    setPos({ left: rect.left, top: rect.bottom + 4 });
    setOpen(true);
  };

  // Mantém o popover dentro da janela (abre para cima ou para a esquerda se faltar espaço).
  useLayoutEffect(() => {
    if (!open || !popRef.current) return;
    const { height } = popRef.current.getBoundingClientRect();
    const rect = buttonRef.current!.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_WIDTH - 8));
    const top =
      rect.bottom + 4 + height > window.innerHeight - 8
        ? Math.max(8, rect.top - height - 4)
        : rect.bottom + 4;
    setPos({ left, top });
    hexRef.current?.select();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      if (!popRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const savePalette = (next: string[]): void => void update(['appearance', 'palette'], next);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="color-swatch-button"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={value}
        style={{ background: value }}
        onClick={toggle}
      />
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="color-popover"
            role="dialog"
            aria-label={`Escolher cor: ${label}`}
            data-testid="color-picker"
            style={{ left: pos.left, top: pos.top, width: POPOVER_WIDTH }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                close();
              }
            }}
          >
            <div className="color-preview-row">
              <span className="color-preview" style={{ background: value }} title="Cor atual" />
              <span
                className="color-preview"
                style={{ background: draft }}
                title="Nova cor"
                data-testid="color-preview"
              />
              <input
                ref={hexRef}
                className="color-hex"
                aria-label="Hexadecimal ou RGB"
                aria-invalid={!parsed}
                spellCheck={false}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  const color = parseColor(e.target.value);
                  if (color) setDraft(color);
                }}
                onBlur={() => parsed && setText(parsed)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (parsed) apply(parsed);
                  }
                }}
              />
            </div>
            {!parsed && <p className="field-error">Use #rrggbb, #rgb ou rgb(r, g, b).</p>}
            {CHANNELS.map(([channel, name]) => (
              <div className="color-channel" key={channel}>
                <span>{name}</span>
                <input
                  type="range"
                  min={0}
                  max={255}
                  aria-label={`${name} (barra)`}
                  value={rgb[channel]}
                  style={{ background: channelTrack(rgb, channel) }}
                  onChange={(e) => setColor(rgbToHex({ ...rgb, [channel]: Number(e.target.value) }))}
                />
                <input
                  type="number"
                  min={0}
                  max={255}
                  aria-label={name}
                  value={rgb[channel]}
                  onChange={(e) =>
                    e.target.value !== '' && setColor(rgbToHex({ ...rgb, [channel]: Number(e.target.value) }))
                  }
                />
              </div>
            ))}
            <div className="color-palette-head">
              <small>Paleta (botão direito remove)</small>
              <button
                type="button"
                className="link small"
                onClick={() => savePalette(addToPalette(palette, draft))}
              >
                + Salvar cor
              </button>
            </div>
            <div className="color-palette" data-testid="color-palette">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`color-palette-swatch ${c === draft ? 'on' : ''}`}
                  aria-label={`Cor ${c}`}
                  title={c}
                  style={{ background: c }}
                  onClick={() => setColor(c)}
                  onDoubleClick={() => apply(c)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    savePalette(palette.filter((x) => x !== c));
                  }}
                />
              ))}
              {palette.length === 0 && <small className="empty">Paleta vazia.</small>}
            </div>
            <div className="color-actions">
              <button type="button" className="link small" onClick={() => savePalette(DEFAULT_PALETTE)}>
                Restaurar paleta
              </button>
              <span className="spacer" />
              <button type="button" onClick={close}>
                Cancelar
              </button>
              <button type="button" className="primary" disabled={!parsed} onClick={() => apply()}>
                Aplicar
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
