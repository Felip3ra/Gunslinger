import { describe, expect, it } from 'vitest';
import { getVar } from './env-utils';
import { mergeWindowsEnvironment, parseRegExport } from './windows-registry-env';

function hex2(value: string): string {
  const bytes: string[] = [];
  for (const ch of value + '\0') {
    const code = ch.charCodeAt(0);
    bytes.push((code & 0xff).toString(16).padStart(2, '0'), (code >> 8).toString(16).padStart(2, '0'));
  }
  // O reg export quebra linhas longas com "\" + recuo.
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 20) chunks.push(bytes.slice(i, i + 20).join(','));
  return 'hex(2):' + chunks.join(',\\\r\n  ');
}

const userExport = [
  '\uFEFFWindows Registry Editor Version 5.00',
  '',
  '[HKEY_CURRENT_USER\\Environment]',
  `"Path"=${hex2('%USERPROFILE%\\AppData\\Local\\Volta\\bin;C:\\Users\\José\\tools')}`,
  '"TEMP"=hex(2):25,00,55,00,53,00,45,00,52,00,50,00,52,00,4f,00,46,00,49,00,4c,00,45,00,25,00,5c,00,54,00,\\',
  '  65,00,6d,00,70,00,00,00',
  '"NVM_HOME"="C:\\\\Users\\\\José\\\\AppData\\\\Roaming\\\\nvm"',
  '"QUOTED"="a \\"b\\""',
  '"Flag"=dword:00000001',
  '',
].join('\r\n');

const machineExport = [
  'Windows Registry Editor Version 5.00',
  '',
  '[HKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment]',
  `"Path"=${hex2('%SystemRoot%\\system32;C:\\Program Files\\nodejs\\')}`,
  '"ComSpec"=hex(2):25,00,53,00,79,00,73,00,74,00,65,00,6d,00,52,00,6f,00,6f,00,74,00,25,00,5c,00,73,00,\\',
  '  79,00,73,00,74,00,65,00,6d,00,33,00,32,00,5c,00,63,00,6d,00,64,00,2e,00,65,00,78,00,65,00,00,00',
  '"OS"="Windows_NT"',
].join('\r\n');

describe('parseRegExport', () => {
  it('lê REG_SZ, REG_EXPAND_SZ com continuação, aspas escapadas e ignora DWORD', () => {
    const vars = parseRegExport(userExport);
    expect(vars).toEqual([
      { name: 'Path', value: '%USERPROFILE%\\AppData\\Local\\Volta\\bin;C:\\Users\\José\\tools', expand: true },
      { name: 'TEMP', value: '%USERPROFILE%\\Temp', expand: true },
      { name: 'NVM_HOME', value: 'C:\\Users\\José\\AppData\\Roaming\\nvm', expand: false },
      { name: 'QUOTED', value: 'a "b"', expand: false },
    ]);
  });
});

describe('mergeWindowsEnvironment', () => {
  const current = {
    PATH: 'C:\\velho',
    USERPROFILE: 'C:\\Users\\José',
    SystemRoot: 'C:\\Windows',
    USERNAME: 'jose',
  };
  const merged = mergeWindowsEnvironment(current, parseRegExport(machineExport), parseRegExport(userExport));

  it('monta PATH como máquina + usuário, expandido', () => {
    expect(getVar(merged, 'Path')).toBe(
      'C:\\Windows\\system32;C:\\Program Files\\nodejs\\;C:\\Users\\José\\AppData\\Local\\Volta\\bin;C:\\Users\\José\\tools',
    );
  });

  it('preserva a grafia existente da chave PATH', () => {
    expect(Object.keys(merged).filter((k) => k.toLowerCase() === 'path')).toEqual(['PATH']);
  });

  it('expande REG_EXPAND_SZ e mantém variáveis voláteis do processo', () => {
    expect(merged['ComSpec']).toBe('C:\\Windows\\system32\\cmd.exe');
    expect(merged['TEMP']).toBe('C:\\Users\\José\\Temp');
    expect(merged['USERNAME']).toBe('jose');
    expect(merged['NVM_HOME']).toBe('C:\\Users\\José\\AppData\\Roaming\\nvm');
  });
});
