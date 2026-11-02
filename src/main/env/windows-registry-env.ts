import { expandWindowsVars, getVar, setVar, type Env } from './env-utils';

export interface RegistryVar {
  name: string;
  value: string;
  expand: boolean;
}

export interface RegistrySection {
  /** Caminho da chave como aparece no export (ex.: HKEY_CURRENT_USER\Environment). */
  key: string;
  values: RegistryVar[];
}

const BOM = new RegExp('^' + String.fromCharCode(0xfeff));

/** Valores de todas as seções do export, na ordem. */
export function parseRegExport(content: string): RegistryVar[] {
  return parseRegExportSections(content).flatMap((s) => s.values);
}

/**
 * Lê o conteúdo de um arquivo gerado por `reg export` (já decodificado de UTF-16LE), por seção (subchave).
 * Suporta REG_SZ ("nome"="valor") e REG_EXPAND_SZ ("nome"=hex(2):..., com continuação por "\").
 */
export function parseRegExportSections(content: string): RegistrySection[] {
  const lines = content.replace(BOM, '').split(/\r?\n/);
  // Junta linhas de continuação ("...,\" seguido de "  00,...").
  const joined: string[] = [];
  for (const raw of lines) {
    const prev = joined[joined.length - 1];
    if (prev !== undefined && prev.endsWith('\\') && /^\s/.test(raw)) {
      joined[joined.length - 1] = prev.slice(0, -1) + raw.trim();
    } else {
      joined.push(raw);
    }
  }

  const sections: RegistrySection[] = [];
  let current: RegistrySection | null = null;
  for (const line of joined) {
    const header = /^\[(.+)\]$/.exec(line.trim());
    if (header) {
      current = { key: header[1]!, values: [] };
      sections.push(current);
      continue;
    }
    const m = /^"((?:[^"\\]|\\.)*)"=(.*)$/.exec(line);
    if (!m || !current) continue;
    const name = unescapeRegString(m[1]!);
    const data = m[2]!;
    if (data.startsWith('"') && data.endsWith('"')) {
      current.values.push({ name, value: unescapeRegString(data.slice(1, -1)), expand: false });
    } else if (data.startsWith('hex(2):')) {
      current.values.push({ name, value: decodeUtf16Hex(data.slice('hex(2):'.length)), expand: true });
    }
    // Outros tipos (DWORD, MULTI_SZ) não são usados.
  }
  return sections;
}

function unescapeRegString(s: string): string {
  return s.replace(/\\(.)/g, '$1');
}

function decodeUtf16Hex(hex: string): string {
  const bytes = hex
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => parseInt(b, 16));
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = bytes[i]! | (bytes[i + 1]! << 8);
    if (code === 0) break;
    out += String.fromCharCode(code);
  }
  return out;
}

/**
 * Monta o ambiente como um login novo faria: variáveis da máquina, depois as do usuário
 * (que sobrescrevem), com PATH = PATH da máquina + ";" + PATH do usuário.
 * Variáveis do processo que não estão no registro (USERNAME, APPDATA, SystemRoot...) são mantidas.
 */
export function mergeWindowsEnvironment(current: Env, machine: RegistryVar[], user: RegistryVar[]): Env {
  const result: Env = { ...current };

  const apply = (vars: RegistryVar[]): void => {
    for (const v of vars) if (v.name.toLowerCase() !== 'path') setVar(result, v.name, v.value);
    for (const v of vars) {
      if (v.expand && v.name.toLowerCase() !== 'path') setVar(result, v.name, expandWindowsVars(v.value, result));
    }
  };

  apply(machine);
  apply(user);

  const machinePath = machine.find((v) => v.name.toLowerCase() === 'path');
  const userPath = user.find((v) => v.name.toLowerCase() === 'path');
  const expandPath = (v: RegistryVar | undefined): string =>
    v ? (v.expand ? expandWindowsVars(v.value, result) : v.value) : '';
  const parts = [expandPath(machinePath), expandPath(userPath)].filter((p) => p.length > 0);
  if (parts.length > 0) setVar(result, 'Path', parts.join(';'));
  else if (getVar(result, 'Path') === undefined) setVar(result, 'Path', '');

  return result;
}
