import { describe, expect, it } from 'vitest';
import type { Project } from '@shared/model';
import { launchRunnables } from '@shared/project-runnables';
import { launchSettingsPath, parseLaunchSettings } from './launch-settings';

const content = `{
  // gerado pelo template
  "profiles": {
    "http": {
      "commandName": "Project",
      "applicationUrl": "http://localhost:5270",
      "environmentVariables": { "ASPNETCORE_ENVIRONMENT": "Development" }
    },
    "IIS Express": { "commandName": "IISExpress" },
  }
}`;

const project: Project = {
  id: 'p1',
  name: 'Loja',
  rootPath: 'C:\\src\\Loja',
  defaultProfileId: null,
  types: { dotnet: true, node: false },
  variables: {},
  node: { packageManagerOverrides: {} },
};

describe('launchSettings.json', () => {
  it('caminho ao lado do .csproj', () => {
    expect(launchSettingsPath('src/Loja.Api/Loja.Api.csproj')).toBe('src/Loja.Api/Properties/launchSettings.json');
  });

  it('lê perfis com comentários e vírgula sobrando', () => {
    const profiles = parseLaunchSettings('src/Loja.Api/Loja.Api.csproj', content);
    expect(profiles.map((p) => [p.name, p.commandName, p.applicationUrl])).toEqual([
      ['http', 'Project', 'http://localhost:5270'],
      ['IIS Express', 'IISExpress', null],
    ]);
    expect(profiles[0]!.environment).toEqual({ ASPNETCORE_ENVIRONMENT: 'Development' });
  });

  it('arquivo inválido vira um marcador com erro', () => {
    expect(parseLaunchSettings('a/a.csproj', '{ "profiles": ')[0]!.error).toMatch(/launchSettings.json inválido/);
  });

  it('gera run e watch para perfis Project; outros tipos desativados', () => {
    const runnables = launchRunnables(project, parseLaunchSettings('src/Loja.Api/Loja.Api.csproj', content));
    expect(runnables.map((r) => [r.title, r.text, r.disabledReason ?? null])).toEqual([
      ['Loja.Api: http', 'dotnet run --project "src/Loja.Api/Loja.Api.csproj" --launch-profile "http"', null],
      ['Loja.Api: http (watch)', 'dotnet watch run --project "src/Loja.Api/Loja.Api.csproj" --launch-profile "http"', null],
      ['Loja.Api: IIS Express', '', 'Perfil do tipo "IISExpress" não é executado pelo dotnet run'],
    ]);
    expect(runnables[0]!.description).toBe('http://localhost:5270 · ASPNETCORE_ENVIRONMENT=Development');
    expect(runnables[0]!.cwd).toBe('C:\\src\\Loja');
  });
});
