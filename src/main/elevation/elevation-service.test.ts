import { describe, expect, it } from 'vitest';
import { ElevationService, parseSudoEnabled, type ElevationDeps } from './elevation-service';

const base: Pick<ElevationDeps, 'launchDetached' | 'powershellPath'> = { launchDetached: async () => ({ ok: true }), powershellPath: 'powershell.exe' };

const exported = (dword: string): string =>
  ['Windows Registry Editor Version 5.00', '', '[HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Sudo]', `"Enabled"=dword:${dword}`].join('\r\n');

describe('ElevationService', () => {
  it('lê o modo do sudo no registro', () => {
    expect(parseSudoEnabled(exported('00000003'))).toBe(3);
    expect(parseSudoEnabled(null)).toBeNull();
  });

  it('sudo inline tem prioridade', async () => {
    const service = new ElevationService({ ...base, readSudoRegistry: async () => exported('00000003'), resolveExecutable: async (n) => `C:\\bin\\${n}` });
    expect(await service.mechanism()).toEqual({ kind: 'sudo-inline', path: 'C:\\bin\\sudo.exe' });
    expect((await service.info()).hint).toBeNull();
  });

  it('sudo em modo "nova janela" não serve: usa o gsudo', async () => {
    const service = new ElevationService({ ...base, readSudoRegistry: async () => exported('00000001'), resolveExecutable: async (n) => (n === 'gsudo.exe' ? 'C:\\g\\gsudo.exe' : 'C:\\s\\sudo.exe') });
    expect(await service.mechanism()).toEqual({ kind: 'gsudo', path: 'C:\\g\\gsudo.exe' });
  });

  it('sem nada: janela externa com explicação', async () => {
    const service = new ElevationService({ ...base, readSudoRegistry: async () => null, resolveExecutable: async () => null });
    const info = await service.info();
    expect(info.mechanism).toBe('external');
    expect(info.hint).toMatch(/sudo config --enable normal/);
  });

  it('janela externa: PowerShell com Start-Process -Verb RunAs em -EncodedCommand', async () => {
    const calls: { file: string; args: string[] }[] = [];
    const service = new ElevationService({
      readSudoRegistry: async () => null,
      resolveExecutable: async () => null,
      powershellPath: 'C:\\ps.exe',
      launchDetached: async (file, args) => (calls.push({ file, args }), { ok: true }),
    });
    expect(await service.openExternal({ file: 'cmd.exe', args: [] }, 'C:\\src')).toEqual({ ok: true });
    const encoded = calls[0]!.args.at(-1)!;
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe("Start-Process -FilePath 'cmd.exe' -WorkingDirectory 'C:\\src' -Verb RunAs");
  });
});
