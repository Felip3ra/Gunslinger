import { readFile } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import type { LaunchProfile } from '@shared/model';

/** Caminho relativo (com '/') do launchSettings.json de um .csproj. */
export function launchSettingsPath(csproj: string): string {
  return posix.join(posix.dirname(csproj), 'Properties', 'launchSettings.json');
}

/** Interpreta o conteúdo de um launchSettings.json (aceita comentários). */
export function parseLaunchSettings(csproj: string, content: string): LaunchProfile[] {
  const errors: ParseError[] = [];
  const data = parse(content, errors, { allowTrailingComma: true }) as { profiles?: Record<string, Record<string, unknown>> } | undefined;
  if (errors.length > 0 || !data || typeof data !== 'object') {
    const reason = errors[0] ? printParseErrorCode(errors[0].error) : 'conteúdo inválido';
    return [{ project: csproj, name: '(launchSettings.json)', commandName: '', applicationUrl: null, environment: {}, error: `launchSettings.json inválido: ${reason}` }];
  }
  return Object.entries(data.profiles ?? {}).map(([name, p]) => {
    const env: Record<string, string> = {};
    if (p['environmentVariables'] && typeof p['environmentVariables'] === 'object') {
      for (const [k, v] of Object.entries(p['environmentVariables'] as Record<string, unknown>)) if (typeof v === 'string') env[k] = v;
    }
    return {
      project: csproj,
      name,
      commandName: typeof p['commandName'] === 'string' ? p['commandName'] : '',
      applicationUrl: typeof p['applicationUrl'] === 'string' ? p['applicationUrl'] : null,
      environment: env,
      error: null,
    };
  });
}

export async function readLaunchProfiles(root: string, csprojs: string[]): Promise<LaunchProfile[]> {
  const all = await Promise.all(
    csprojs.map(async (csproj) => {
      try {
        return parseLaunchSettings(csproj, await readFile(join(root, launchSettingsPath(csproj)), 'utf8'));
      } catch {
        return []; // projeto sem launchSettings.json
      }
    }),
  );
  return all.flat();
}
