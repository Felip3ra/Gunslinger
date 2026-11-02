## Purpose

Liga o terminal aos projetos do usuário: guarda a pasta, o shell e as variáveis de cada projeto, identifica se ele é .NET, Node.js ou os dois, e oferece os comandos de cada tipo lado a lado.

## ADDED Requirements

### Requirement: Cadastro de projetos
O usuário SHALL poder criar, editar e excluir perfis de projeto com nome (obrigatório), pasta raiz (obrigatória e existente), perfil de shell padrão e variáveis do projeto (pares nome/valor).

#### Scenario: Cadastrar projeto
- **GIVEN** a pasta `C:\src\Loja` existe
- **WHEN** o usuário cadastra o projeto "Loja" com essa pasta e o shell PowerShell 7
- **THEN** "Loja" aparece na lista de projetos e na paleta como "Abrir projeto: Loja"

#### Scenario: Pasta inexistente
- **GIVEN** o formulário de projeto está aberto
- **WHEN** o usuário informa uma pasta raiz que não existe e tenta salvar
- **THEN** o projeto não é salvo e aparece a mensagem de pasta inválida

### Requirement: Tipos de projeto
Um projeto SHALL poder ser do tipo .NET, Node.js ou dos dois ao mesmo tempo. Ao escolher a pasta raiz, o Gunslinger SHALL sugerir os tipos a partir do conteúdo: .NET quando houver `.sln`, `.slnx` ou `.csproj`, e Node.js quando houver `package.json`, procurando até 4 níveis abaixo da raiz e ignorando `bin`, `obj`, `node_modules` e pastas ocultas. O usuário SHALL poder ligar ou desligar cada tipo.

#### Scenario: Projeto misto
- **GIVEN** a pasta tem `Loja.sln`, `src/Loja.Api/Loja.Api.csproj` e `frontend/package.json`
- **WHEN** o usuário seleciona essa pasta como raiz
- **THEN** o formulário sugere os tipos .NET e Node.js marcados

#### Scenario: Pasta sem projetos reconhecidos
- **GIVEN** a pasta não tem `.sln`, `.csproj` nem `package.json`
- **WHEN** o usuário a seleciona como raiz
- **THEN** nenhum tipo é marcado e o projeto pode ser salvo só com pasta, shell e variáveis

### Requirement: Comandos do projeto lado a lado
Quando houver projeto ativo, o painel lateral SHALL mostrar uma seção do projeto com um grupo por tipo ligado: "EF Core" para .NET e um grupo por `package.json` encontrado para Node.js, ao lado dos comandos salvos. Grupos de tipos desligados MUST NOT aparecer.

#### Scenario: Painel de projeto misto
- **GIVEN** o projeto ativo "Loja" tem os tipos .NET e Node.js, e o `package.json` está em `frontend`
- **WHEN** o usuário abre o painel lateral
- **THEN** a seção "Loja" mostra o grupo "EF Core" e o grupo "Node: frontend", cada um com os seus comandos

### Requirement: Abrir projeto
Abrir um projeto SHALL criar uma aba com o shell padrão do projeto, iniciada na pasta raiz e vinculada ao projeto. O projeto vinculado à aba ativa SHALL ser o "projeto ativo".

#### Scenario: Abrir pela paleta
- **GIVEN** o projeto "Loja" existe
- **WHEN** o usuário escolhe "Abrir projeto: Loja" na paleta
- **THEN** abre uma aba PowerShell 7 em `C:\src\Loja` e "Loja" passa a ser o projeto ativo

#### Scenario: Shell padrão do projeto ausente
- **GIVEN** o shell padrão do projeto "Loja" é "Git Bash" e o Git foi desinstalado
- **WHEN** o usuário abre "Loja"
- **THEN** a aba abre com o perfil padrão do app e aparece o aviso "Shell do projeto não encontrado"

#### Scenario: Troca de aba troca o projeto ativo
- **GIVEN** a aba 1 está vinculada a "Loja" e a aba 2 não está vinculada a nenhum projeto
- **WHEN** o usuário ativa a aba 2
- **THEN** não há projeto ativo e a seção de projeto some do painel

### Requirement: Execução de comandos de projeto
Comandos de projeto (EF Core, scripts e comandos de Node) SHALL seguir as regras de execução explícita, variáveis, "Executar"/"Inserir" e terminal de destino dos comandos salvos. Eles SHALL ser executados na pasta própria do comando (raiz do projeto para EF Core, pasta do `package.json` para Node) e, se a aba ativa não estiver vinculada ao projeto, numa aba nova com o shell padrão do projeto.

#### Scenario: Script de subpasta
- **GIVEN** a aba ativa está vinculada a "Loja" e está em `C:\src\Loja`
- **WHEN** o usuário executa o script `dev` do grupo "Node: frontend"
- **THEN** o comando roda com `C:\src\Loja\frontend` como pasta, depois que o usuário confirma a troca de pasta

### Requirement: Resolução de variáveis de projeto
Variáveis de um comando com o mesmo nome de uma variável do projeto ativo SHALL ser preenchidas com o valor do projeto e mostradas na pré-visualização, onde podem ser editadas antes da confirmação. As variáveis do projeto SHALL estar disponíveis para qualquer comando salvo executado numa aba vinculada ao projeto.

#### Scenario: Comando salvo usa variável do projeto
- **GIVEN** um comando salvo `dotnet build {startupProject}` e o projeto ativo define `startupProject`
- **WHEN** o usuário executa o comando
- **THEN** a pré-visualização mostra o caminho do projeto já preenchido e não pede `startupProject` como campo obrigatório vazio

### Requirement: Reanálise do projeto
O Gunslinger SHALL oferecer a ação "Reanalisar projeto", que repete a detecção de tipos, de projetos .NET e de pacotes Node. A detecção também SHALL ser refeita ao abrir o projeto.

#### Scenario: Nova subpasta Node
- **GIVEN** o projeto "Loja" foi cadastrado só com .NET e depois o usuário criou `frontend/package.json`
- **WHEN** o usuário aciona "Reanalisar projeto"
- **THEN** o Gunslinger sugere ligar o tipo Node.js e, se o usuário aceitar, o grupo "Node: frontend" aparece no painel
