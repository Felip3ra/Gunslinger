import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import type { OpenResult } from '@shared/model';
import type { Env } from '../env/env-utils';
import type { PlatformAdapter } from '../platform/types';

/** Substitui {file}, {line} e {column} nos argumentos do editor (linha/coluna padrão: 1). */
export function buildEditorArgs(template: string[], file: string, line?: number, column?: number): string[] {
  return template.map((arg) =>
    arg
      .replace(/\{file\}/g, file)
      .replace(/\{line\}/g, String(line ?? 1))
      .replace(/\{column\}/g, String(column ?? 1)),
  );
}

export interface EditorSettings {
  command: string;
  args: string[];
}

/**
 * Abre o arquivo no editor configurado, sem shell. Só aceita arquivos que existem
 * (limita injeção quando o editor é um .cmd e precisa passar pelo cmd.exe).
 */
export async function openInEditor(
  platform: PlatformAdapter,
  env: Env,
  editor: EditorSettings,
  file: string,
  line?: number,
  column?: number,
): Promise<OpenResult> {
  try {
    if (!(await stat(file)).isFile()) return { ok: false, error: 'Não é um arquivo.' };
  } catch {
    return { ok: false, error: `Arquivo não encontrado: ${file}` };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(file)) return { ok: false, error: 'Caminho inválido.' };
  const executable = await platform.resolveExecutable(editor.command, env);
  if (!executable) return { ok: false, error: `Editor "${editor.command}" não encontrado.` };
  let spec;
  try {
    spec = platform.buildSpawn(executable, buildEditorArgs(editor.args, file, line, column));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return new Promise((resolve) => {
    const child = spawn(spec.file, spec.args, {
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: spec.windowsVerbatimArguments ?? false,
    });
    child.once('error', (err) => resolve({ ok: false, error: err.message }));
    child.once('spawn', () => {
      child.unref();
      resolve({ ok: true });
    });
  });
}
