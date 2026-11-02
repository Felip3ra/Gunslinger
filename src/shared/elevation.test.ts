import { describe, expect, it } from 'vitest';
import { externalElevationScript, planInlineElevation, quoteWindowsArg, sudoSupportsInline } from './elevation';

describe('elevação', () => {
  it('só o modo 3 do sudo serve para abas', () => {
    expect([1, 2, 3, null].map(sudoSupportsInline)).toEqual([false, false, true, false]);
  });

  it('sudo inline e gsudo prefixam a linha de comando do shell', () => {
    const shell = { file: 'C:\\Windows\\System32\\cmd.exe', args: ['/k', 'prompt $P$G'] };
    expect(planInlineElevation({ kind: 'sudo-inline', path: 'C:\\Windows\\System32\\sudo.exe' }, shell)).toEqual({
      file: 'C:\\Windows\\System32\\sudo.exe',
      args: ['--inline', 'C:\\Windows\\System32\\cmd.exe', '/k', 'prompt $P$G'],
    });
    expect(planInlineElevation({ kind: 'gsudo', path: 'gsudo.exe' }, shell).args[0]).toBe('C:\\Windows\\System32\\cmd.exe');
  });

  it('aspas no padrão do Windows', () => {
    expect(quoteWindowsArg('simples')).toBe('simples');
    expect(quoteWindowsArg('com espaço')).toBe('"com espaço"');
    expect(quoteWindowsArg('C:\\pasta com espaço\\')).toBe('"C:\\pasta com espaço\\\\"');
    expect(quoteWindowsArg('a"b')).toBe('"a\\"b"');
    expect(quoteWindowsArg('')).toBe('""');
  });

  it('janela externa via Start-Process -Verb RunAs', () => {
    const script = externalElevationScript({ file: "C:\\Program Files\\Git\\bin\\bash.exe", args: ['--login', '-i'] }, "C:\\D'Ávila");
    expect(script).toBe("Start-Process -FilePath 'C:\\Program Files\\Git\\bin\\bash.exe' -ArgumentList '--login -i' -WorkingDirectory 'C:\\D''Ávila' -Verb RunAs");
  });
});
