import { describe, expect, it } from 'vitest';
import { addToPalette, hexToRgb, parseColor, rgbToHex } from './colors';

describe('cores', () => {
  it('aceita hexadecimal curto, longo, sem # e em maiúsculas', () => {
    expect(parseColor('#F80')).toBe('#ff8800');
    expect(parseColor('ff8800')).toBe('#ff8800');
    expect(parseColor('  #12AbEf ')).toBe('#12abef');
  });

  it('aceita rgb(...) e componentes separados por vírgula ou espaço', () => {
    expect(parseColor('rgb(18, 52, 86)')).toBe('#123456');
    expect(parseColor('18,52,86')).toBe('#123456');
    expect(parseColor('18 52 86')).toBe('#123456');
  });

  it('recusa valores inválidos', () => {
    for (const bad of ['', '#12345', '#ggg', 'rgb(256, 0, 0)', 'rgb(1, 2, 3', '1, 2', 'azul']) expect(parseColor(bad)).toBeNull();
  });

  it('converte entre hexadecimal e RGB', () => {
    expect(hexToRgb('#123456')).toEqual({ r: 18, g: 52, b: 86 });
    expect(rgbToHex({ r: 300, g: -4, b: 15.6 })).toBe('#ff0010');
  });

  it('paleta: nova cor primeiro, sem repetir, com limite', () => {
    expect(addToPalette(['#000000', '#ffffff'], '#ffffff')).toEqual(['#ffffff', '#000000']);
    expect(addToPalette(['#000000', '#111111'], '#222222', 2)).toEqual(['#222222', '#000000']);
  });
});
