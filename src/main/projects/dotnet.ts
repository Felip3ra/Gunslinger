import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CsprojInfo, DotnetAnalysis } from '@shared/model';
import { readLaunchProfiles } from './launch-settings';

/** Lê o .csproj como texto: não é preciso um parser XML completo para estas heurísticas. */
export function inspectCsproj(path: string, content: string): CsprojInfo {
  const sdk = /<Project[^>]*\sSdk\s*=\s*"([^"]+)"/i.exec(content)?.[1] ?? null;
  return {
    path,
    sdk,
    isWeb: !!sdk && /Microsoft\.NET\.Sdk\.(Web|BlazorWebAssembly|Worker)/i.test(sdk),
    isExe: /<OutputType>\s*(Win)?Exe\s*<\/OutputType>/i.test(content),
    referencesEf: /<PackageReference[^>]+Include\s*=\s*"Microsoft\.EntityFrameworkCore/i.test(content),
    isTestProject: /<PackageReference[^>]+Include\s*=\s*"(?:Microsoft\.NET\.Test\.Sdk|xunit|NUnit|MSTest)/i.test(content),
  };
}

/**
 * Sugere `project` (quem tem as migrations: referencia EF Core) e `startupProject`
 * (Sdk.Web ou executável). Com mais de um candidato, não escolhe sozinho.
 */
export function suggestEfProjects(projects: CsprojInfo[], solutions: string[]): DotnetAnalysis {
  const projectCandidates = projects.filter((p) => p.referencesEf).map((p) => p.path);
  const web = projects.filter((p) => p.isWeb).map((p) => p.path);
  const startupCandidates = web.length > 0 ? web : projects.filter((p) => p.isExe).map((p) => p.path);
  return {
    solutions,
    projects,
    projectCandidates,
    startupCandidates,
    launchProfiles: [],
    suggestedProject: projectCandidates.length === 1 ? projectCandidates[0]! : null,
    suggestedStartupProject: startupCandidates.length === 1 ? startupCandidates[0]! : null,
  };
}

export async function analyzeDotnet(root: string, csprojs: string[], solutions: string[]): Promise<DotnetAnalysis> {
  const infos = await Promise.all(
    csprojs.map(async (rel) => {
      try {
        return inspectCsproj(rel, await readFile(join(root, rel), 'utf8'));
      } catch {
        return { path: rel, sdk: null, isWeb: false, isExe: false, referencesEf: false, isTestProject: false };
      }
    }),
  );
  return { ...suggestEfProjects(infos, solutions), launchProfiles: await readLaunchProfiles(root, csprojs) };
}
