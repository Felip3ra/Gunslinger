## Decisions

- **Leitura** (`main/projects/launch-settings.ts`): para cada `.csproj` da varredura, `Properties/launchSettings.json` relativo à pasta do projeto, lido com `jsonc-parser`. Resultado em `DotnetAnalysis.launchProfiles: { project, name, commandName, applicationUrl, environment, error }[]`.
- **Comandos** (`shared/project-runnables.ts`): grupo `launch` com dois `RunnableCommand` por perfil `Project`; os demais (`IISExpress`, `Docker`, `Executable`) ficam com `disabledReason`.
- Sem observação de arquivo própria: "Reanalisar projeto" e a abertura do projeto releem o arquivo.

## Risks / Trade-offs

- [Perfis com `commandName` desconhecido] → aparecem desativados com o nome do tipo.
