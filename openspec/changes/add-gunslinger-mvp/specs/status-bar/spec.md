## Purpose

Mostra numa barra de status, sem precisar digitar comandos, o contexto do terminal ativo: projeto ativo, branch e alterações do Git e versões do Node e do .NET SDK, mantendo tudo atualizado.

## ADDED Requirements

### Requirement: Conteúdo da barra de status
A janela SHALL ter uma barra de status que mostra, para a aba ativa: o projeto ativo (quando houver), a pasta atual, o status do Git, a versão do Node e a versão do .NET SDK. Cada item SHALL ficar oculto quando não se aplicar, e a barra MUST NOT mostrar dados de outra aba.

#### Scenario: Aba de projeto misto
- **GIVEN** a aba ativa está vinculada ao projeto "Loja" (.NET + Node), num repositório na branch `main`
- **WHEN** a barra de status é exibida
- **THEN** ela mostra "Loja", `main`, a versão do Node (por exemplo `Node v20.11.0`) e a do .NET (por exemplo `.NET 8.0.404`)

### Requirement: Status do Git
Quando a pasta atual da aba ativa estiver dentro de um repositório Git, a barra de status SHALL mostrar a branch atual (ou o hash curto do commit, quando o HEAD estiver destacado) e um indicador de alterações locais (arquivos modificados, preparados ou não rastreados). O título da aba SHALL mostrar um indicador discreto quando houver alterações. Fora de um repositório, o item do Git SHALL ficar oculto.

#### Scenario: Repositório com alterações
- **GIVEN** a aba ativa está em `C:\src\Loja`, na branch `feature/pedidos`, com um arquivo modificado
- **WHEN** a barra de status é exibida
- **THEN** ela mostra `feature/pedidos` com o indicador de alterações

#### Scenario: Repositório limpo
- **GIVEN** a aba ativa está num repositório sem alterações, na branch `main`
- **WHEN** a barra de status é exibida
- **THEN** ela mostra `main` sem o indicador de alterações

#### Scenario: HEAD destacado
- **GIVEN** o repositório está em detached HEAD no commit `a1b2c3d`
- **WHEN** a barra de status é exibida
- **THEN** ela mostra `a1b2c3d` no lugar do nome da branch

#### Scenario: Fora de repositório
- **GIVEN** a aba ativa está em `C:\temp`, que não é um repositório
- **WHEN** a barra de status é exibida
- **THEN** nenhuma informação de Git aparece

### Requirement: Versões de Node e .NET quando relevantes
A barra de status SHALL mostrar a versão do Node (saída de `node -v`) quando o projeto ativo for do tipo Node.js ou quando houver `package.json` na pasta atual ou acima dela. Ela SHALL mostrar a versão do .NET SDK (saída de `dotnet --version`) quando o projeto ativo for do tipo .NET ou quando houver `.sln`, `.slnx`, `.csproj` ou `global.json` na pasta atual ou acima dela. As versões SHALL ser consultadas na pasta atual da aba, com o ambiente atual do app, para respeitar `global.json` e ferramentas que resolvem a versão por pasta (como Volta). Se a ferramenta não for encontrada, o item SHALL mostrar "Node não encontrado" ou ".NET não encontrado". Em abas WSL, as versões MUST NOT ser mostradas no MVP, porque as ferramentas do Linux não são consultadas.

#### Scenario: global.json fixa o SDK
- **GIVEN** a pasta do projeto tem `global.json` fixando o SDK `8.0.404` e a máquina também tem o SDK 9 instalado
- **WHEN** a aba ativa está nessa pasta
- **THEN** a barra de status mostra `.NET 8.0.404`

#### Scenario: Pasta sem relação com Node
- **GIVEN** a aba ativa está em `C:\temp`, sem `package.json` acima, e sem projeto vinculado
- **WHEN** a barra de status é exibida
- **THEN** a versão do Node não aparece

#### Scenario: Node não instalado
- **GIVEN** o projeto ativo é do tipo Node.js e o `node` não está no PATH
- **WHEN** a barra de status é exibida
- **THEN** o item mostra "Node não encontrado", e clicar nele aciona "Recarregar ambiente"

### Requirement: Atualização automática
As informações da barra de status SHALL ser atualizadas em até 2 segundos quando: a pasta atual da aba mudar, a aba ativa mudar, um comando terminar na aba, o ambiente for recarregado, ou os arquivos de estado do repositório (HEAD, índice, refs) mudarem. As consultas MUST NOT bloquear a digitação nem a renderização do terminal.

#### Scenario: Troca de branch no terminal
- **GIVEN** a barra de status mostra `main`
- **WHEN** o usuário executa `git switch develop` na aba ativa
- **THEN** em até 2 segundos a barra de status mostra `develop`

#### Scenario: Alteração feita por outro programa
- **GIVEN** a barra de status mostra o repositório limpo
- **WHEN** um arquivo rastreado é salvo no VS Code
- **THEN** em até 2 segundos o indicador de alterações aparece

#### Scenario: Troca de versão com Volta
- **GIVEN** a pasta `api` fixa o Node 18 e a pasta `web` fixa o Node 20 via Volta
- **WHEN** o usuário executa `cd ../web` na aba ativa
- **THEN** em até 2 segundos a barra de status mostra a versão 20

### Requirement: Degradação sem as ferramentas
Se `git`, `node` ou `dotnet` não estiverem disponíveis, ou se uma consulta falhar ou demorar mais de 5 segundos, o Gunslinger SHALL ocultar ou marcar como indisponível o item correspondente, sem mostrar erros repetidos, e SHALL continuar funcionando normalmente.

#### Scenario: Git não instalado
- **GIVEN** o `git` não está no PATH
- **WHEN** a aba ativa está numa pasta com `.git`
- **THEN** nenhuma informação de Git aparece e nenhum erro bloqueia a UI

#### Scenario: Repositório muito grande
- **GIVEN** a consulta de status de um repositório demora mais de 5 segundos
- **WHEN** o tempo limite é atingido
- **THEN** a barra de status mostra só a branch, sem o indicador de alterações, e a consulta é cancelada
