## Purpose

Transforma os perfis de execução do `launchSettings.json` dos projetos .NET em comandos prontos, para rodar a aplicação com as URLs e o ambiente definidos sem digitar o perfil.

## ADDED Requirements

### Requirement: Leitura dos perfis de execução
Na análise de um projeto .NET, o Gunslinger SHALL ler `Properties/launchSettings.json` ao lado de cada `.csproj` encontrado, aceitando comentários, e SHALL listar cada perfil com nome, tipo (`commandName`), URLs e variáveis de ambiente. Um arquivo inválido SHALL ser ignorado com aviso no grupo, sem afetar o resto da análise.

#### Scenario: Perfis lidos
- **GIVEN** `src/Loja.Api/Properties/launchSettings.json` com os perfis "http" (`http://localhost:5270`) e "IIS Express"
- **WHEN** o projeto é analisado
- **THEN** o grupo "Perfis de execução" mostra "Loja.Api: http" com a URL na descrição, e "Loja.Api: IIS Express" desativado com o motivo

### Requirement: Comandos a partir dos perfis
Para cada perfil com `commandName: "Project"`, o Gunslinger SHALL oferecer "Executar" (`dotnet run --project "<csproj>" --launch-profile "<perfil>"`) e "Executar com watch" (`dotnet watch run --project "<csproj>" --launch-profile "<perfil>"`), executados na raiz do projeto e sujeitos às regras dos comandos de projeto (ação explícita, terminal de destino, verificação do .NET SDK).

#### Scenario: Rodar um perfil
- **GIVEN** o projeto ativo tem o perfil "http" em `src/Loja.Api/Loja.Api.csproj`
- **WHEN** o usuário aciona "Loja.Api: http (watch)"
- **THEN** o terminal recebe `dotnet watch run --project "src/Loja.Api/Loja.Api.csproj" --launch-profile "http"` na raiz do projeto
