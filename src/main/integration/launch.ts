import { win32 as winPath } from 'node:path';
import { cmdIntegrationPrompt } from '@shared/elevation';
import type { ShellProfile } from '@shared/model';
import { getVar, setVar, type Env } from '../env/env-utils';

export interface LaunchSpec {
  file: string;
  args: string[];
  cwd: string;
  env: Env;
}

export interface IntegrationScripts {
  /** Conteúdo de gunslinger.ps1 (vai embutido em -EncodedCommand). */
  powershell: string;
  /** Caminho Windows de gunslinger.bash. */
  bashPath: string;
}

/** -EncodedCommand espera base64 de UTF-16LE. */
export function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/** Caminho Windows com barras normais (aceito pelo bash do Git: C:/Users/...). */
function toForwardSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Aspas simples para sh: 'a'\''b'. */
function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

export interface LaunchOptions {
  /** Shell elevado: o ambiente do pedinte pode não atravessar a elevação, então nada depende de variáveis. */
  elevated?: boolean;
}

export function buildLaunch(profile: ShellProfile, cwd: string, baseEnv: Env, scripts: IntegrationScripts | null, options: LaunchOptions = {}): LaunchSpec {
  const env: Env = { ...baseEnv };
  // Variáveis que identificam o terminal para programas como o oh-my-posh.
  setVar(env, 'TERM_PROGRAM', 'Gunslinger');
  setVar(env, 'COLORTERM', 'truecolor');
  const integrate = profile.shellIntegration && scripts !== null;

  switch (profile.shellType) {
    case 'powershell':
    case 'pwsh':
      return {
        file: profile.executable,
        args: integrate ? [...profile.args, '-NoExit', '-EncodedCommand', encodePowerShellCommand(scripts.powershell)] : profile.args,
        cwd,
        env,
      };

    case 'cmd': {
      // O CMD não usa script: a integração vai no prompt (variável PROMPT ou, elevado, /k prompt).
      if (!profile.shellIntegration) return { file: profile.executable, args: profile.args, cwd, env };
      const userPrompt = getVar(env, 'PROMPT') ?? '$P$G';
      if (options.elevated) {
        return { file: profile.executable, args: [...profile.args, '/k', `prompt ${cmdIntegrationPrompt(userPrompt, { asArgument: true })}`], cwd, env };
      }
      const prompt = cmdIntegrationPrompt(userPrompt);
      setVar(env, 'PROMPT', prompt);
      return { file: profile.executable, args: profile.args, cwd, env };
    }

    case 'gitbash':
      return {
        file: profile.executable,
        args: integrate
          ? [...profile.args, '--rcfile', toForwardSlashes(scripts.bashPath), '-i']
          : [...profile.args, '--login', '-i'],
        cwd,
        env,
      };

    case 'wsl': {
      const base = [...profile.args, '--cd', cwd];
      if (!integrate) return { file: profile.executable, args: base, cwd: winPath.dirname(profile.executable), env };
      // O caminho do script é convertido dentro da distribuição (funciona com qualquer raiz de montagem).
      const inner = `exec bash --rcfile "$(wslpath -u ${shQuote(scripts.bashPath)})" -i`;
      return {
        file: profile.executable,
        args: [...base, '--', 'bash', '-c', inner],
        // O cwd do processo wsl.exe não importa (o --cd define a pasta); evita pastas UNC.
        cwd: winPath.dirname(profile.executable),
        env,
      };
    }

    case 'custom':
      return { file: profile.executable, args: profile.args, cwd, env };
  }
}
