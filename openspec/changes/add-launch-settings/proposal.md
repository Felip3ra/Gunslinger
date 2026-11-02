## Why

Projetos ASP.NET já descrevem como rodar em `Properties/launchSettings.json` (URLs, ambiente, argumentos). Hoje o usuário precisa lembrar e digitar `dotnet run --launch-profile ...` para cada um.

## What Changes

- A análise de projetos .NET lê o `launchSettings.json` de cada `.csproj` (aceita comentários) e lista os perfis com `commandName: "Project"`.
- Cada perfil vira dois comandos prontos no grupo **Perfis de execução** do painel e na paleta: `dotnet run --project "<csproj>" --launch-profile "<perfil>"` e a versão com `dotnet watch`.
- A descrição mostra as URLs (`applicationUrl`) e as variáveis de ambiente do perfil. Perfis de IIS Express ou Docker aparecem desativados com o motivo.
- Mudanças no `launchSettings.json` entram na próxima reanálise do projeto.

## Capabilities

### New Capabilities
- `launch-settings`: leitura dos perfis de execução e comandos prontos a partir deles.

### Modified Capabilities
_Nenhuma._

## Impact

Main: analisador .NET ganha a leitura dos perfis. Shared: modelo dos perfis e geração dos comandos. Renderer: grupo novo na seção do projeto e itens na paleta.
