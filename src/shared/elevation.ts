/** Como elevar um shell: dentro da aba (sudo inline, gsudo) ou numa janela separada do Windows. */
export type ElevationMechanism = { kind: 'sudo-inline'; path: string } | { kind: 'gsudo'; path: string } | { kind: 'external' };

export interface ElevationInfo {
  mechanism: ElevationMechanism['kind'];
  /** Explicação para o usuário quando a elevação não fica dentro do app. */
  hint: string | null;
}

export const ENABLE_SUDO_HINT =
  'Para abrir abas elevadas dentro do Gunslinger, habilite o sudo do Windows em modo inline (Configurações > Sistema > Para desenvolvedores > Habilitar sudo, ou "sudo config --enable normal" num terminal de administrador), ou instale o gsudo.';

export interface CommandLine {
  file: string;
  args: string[];
}

/** Interpreta o valor `Enabled` do sudo do Windows: só o modo 3 (normal/inline) serve para uma aba. */
export function sudoSupportsInline(enabled: number | null): boolean {
  return enabled === 3;
}

/** Aspas de linha de comando do Windows (regras do CommandLineToArgvW). */
export function quoteWindowsArg(arg: string): string {
  if (arg.length > 0 && !/[\s"]/.test(arg)) return arg;
  let out = '"';
  let backslashes = 0;
  for (const ch of arg) {
    if (ch === '\\') {
      backslashes++;
      continue;
    }
    if (ch === '"') {
      out += '\\'.repeat(backslashes * 2 + 1) + '"';
    } else {
      out += '\\'.repeat(backslashes) + ch;
    }
    backslashes = 0;
  }
  return out + '\\'.repeat(backslashes * 2) + '"';
}

/** Linha de comando que roda o shell elevado dentro do console atual (sudo inline ou gsudo). */
export function planInlineElevation(mechanism: Exclude<ElevationMechanism, { kind: 'external' }>, shell: CommandLine): CommandLine {
  return mechanism.kind === 'sudo-inline'
    ? { file: mechanism.path, args: ['--inline', shell.file, ...shell.args] }
    : { file: mechanism.path, args: [shell.file, ...shell.args] };
}

/**
 * Script do PowerShell que abre o shell elevado numa janela separada (UAC do Windows).
 * Vai em -EncodedCommand para não depender de aspas na linha de comando.
 */
export function externalElevationScript(shell: CommandLine, cwd: string): string {
  const ps = (s: string): string => `'${s.replace(/'/g, "''")}'`;
  const argLine = shell.args.map(quoteWindowsArg).join(' ');
  return [
    `Start-Process -FilePath ${ps(shell.file)}`,
    argLine ? `-ArgumentList ${ps(argLine)}` : '',
    `-WorkingDirectory ${ps(cwd)} -Verb RunAs`,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Valor do `prompt` do CMD com as marcas da integração. Em argumento de linha de comando
 * (CMD elevado, `/k prompt ...`), a última marca termina com BEL: uma barra invertida antes da
 * aspa final escaparia a aspa.
 */
export function cmdIntegrationPrompt(userPrompt: string, options: { asArgument?: boolean } = {}): string {
  const end = options.asArgument ? String.fromCharCode(7) : '$e\\';
  return `$e]9;9;$P$e\\$e]133;A$e\\${userPrompt}$e]133;B${end}`;
}
