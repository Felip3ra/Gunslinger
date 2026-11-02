## Purpose

Oferece aos projetos .NET comandos prontos de EF Core pela CLI `dotnet-ef`, com detecção dos projetos de migrations e de inicialização, substituindo o Package Manager Console do Visual Studio.

## ADDED Requirements

### Requirement: Detecção de solução e projetos .NET
Para projetos do tipo .NET, o Gunslinger SHALL procurar arquivos `.sln`, `.slnx` e `.csproj` até 4 níveis abaixo da raiz, ignorando `bin`, `obj`, `node_modules` e pastas ocultas, e SHALL sugerir valores para as variáveis de projeto `project` e `startupProject`. A sugestão SHALL dar preferência, para `startupProject`, a projetos com SDK `Microsoft.NET.Sdk.Web` ou com saída executável, e, para `project`, a projetos que referenciam `Microsoft.EntityFrameworkCore`. O usuário SHALL confirmar ou mudar as sugestões.

#### Scenario: Sugestão de projetos
- **GIVEN** a pasta tem `Loja.sln`, `src/Loja.Api/Loja.Api.csproj` (Sdk.Web) e `src/Loja.Infra/Loja.Infra.csproj` (referencia EF Core)
- **WHEN** o usuário seleciona essa pasta como raiz de um projeto .NET
- **THEN** o Gunslinger sugere `startupProject=src/Loja.Api/Loja.Api.csproj` e `project=src/Loja.Infra/Loja.Infra.csproj`

#### Scenario: Vários candidatos
- **GIVEN** a pasta tem dois projetos que referenciam EF Core
- **WHEN** o Gunslinger monta a sugestão
- **THEN** o campo `project` mostra os dois como opções e não seleciona nenhum automaticamente

### Requirement: Comandos de EF Core pré-configurados
Para o projeto ativo do tipo .NET, o Gunslinger SHALL oferecer estes comandos no grupo "EF Core" do painel e na paleta:
- Nova migration: `dotnet ef migrations add {nome}`
- Atualizar banco: `dotnet ef database update`
- Remover última migration: `dotnet ef migrations remove`
- Listar migrations: `dotnet ef migrations list`
- Gerar script: `dotnet ef migrations script`

Quando o projeto definir `project` e/ou `startupProject`, todos esses comandos SHALL receber `--project "{project}"` e/ou `--startup-project "{startupProject}"`. Os comandos SHALL ser executados na pasta raiz do projeto.

#### Scenario: Nova migration
- **GIVEN** o projeto ativo "Loja" tem `project` e `startupProject` definidos
- **WHEN** o usuário aciona "Nova migration" e informa `nome=AddPedidos`
- **THEN** o terminal recebe `dotnet ef migrations add AddPedidos --project "src/Loja.Infra/Loja.Infra.csproj" --startup-project "src/Loja.Api/Loja.Api.csproj"`, executado em `C:\src\Loja`

#### Scenario: Projeto sem variáveis de EF
- **GIVEN** o projeto ativo é .NET, mas não define `project` nem `startupProject`
- **WHEN** o usuário aciona "Listar migrations"
- **THEN** o terminal recebe `dotnet ef migrations list` sem as flags

#### Scenario: Nenhum projeto .NET ativo
- **GIVEN** a aba ativa não está vinculada a um projeto do tipo .NET
- **WHEN** o usuário procura "migration" na paleta
- **THEN** os comandos de EF aparecem desativados, com a dica "Abra um projeto .NET para usar"

#### Scenario: Remover migration pede confirmação
- **GIVEN** o projeto .NET ativo está definido
- **WHEN** o usuário aciona "Remover última migration"
- **THEN** o Gunslinger mostra a pré-visualização do comando e só executa depois da confirmação

### Requirement: Verificação do dotnet-ef
Antes do primeiro comando de EF numa sessão, e quando o usuário pedir, o Gunslinger SHALL verificar se a ferramenta `dotnet-ef` está disponível (global ou no manifesto local de ferramentas do projeto). Se não estiver, o Gunslinger SHALL avisar o usuário e oferecer o comando de instalação `dotnet tool install --global dotnet-ef`, que só roda se o usuário confirmar. Se o .NET SDK não estiver instalado, o aviso SHALL dizer isso. A verificação MUST NOT impedir a execução: o aviso SHALL oferecer também "Executar mesmo assim" e "Cancelar". A verificação SHALL ser ignorada em abas WSL.

#### Scenario: dotnet-ef ausente
- **GIVEN** o .NET SDK está instalado, mas o `dotnet-ef` não
- **WHEN** o usuário aciona "Listar migrations"
- **THEN** aparece o aviso "dotnet-ef não encontrado" com as opções "Instalar", "Executar mesmo assim" e "Cancelar"; "Instalar" envia `dotnet tool install --global dotnet-ef` só depois do clique

#### Scenario: Ferramenta local
- **GIVEN** o projeto tem `.config/dotnet-tools.json` com `dotnet-ef`, mas a ferramenta não está instalada globalmente
- **WHEN** o usuário aciona um comando de EF
- **THEN** o Gunslinger considera a ferramenta disponível e não mostra o aviso

#### Scenario: SDK ausente
- **GIVEN** o executável `dotnet` não está no PATH
- **WHEN** o usuário aciona um comando de EF
- **THEN** o aviso diz que o .NET SDK não foi encontrado, sugere "Recarregar ambiente" e não oferece instalar o `dotnet-ef`
