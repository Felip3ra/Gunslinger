## Purpose

Permite salvar e reabrir de uma vez um conjunto de abas e painéis, com shells, pastas e comandos iniciais, para montar o ambiente de trabalho do dia com uma ação.

## ADDED Requirements

### Requirement: Salvar abas como workspace
O Gunslinger SHALL salvar as abas abertas como um workspace com nome, guardando para cada aba o layout de painéis (direção e tamanhos) e, para cada painel, o perfil, a pasta atual e o projeto vinculado. Workspaces SHALL ser gravados em `workspaces.json`, com gravação atômica e sem sobrescrever um arquivo inválido.

#### Scenario: Salvar a sessão atual
- **GIVEN** duas abas abertas, a segunda dividida em dois painéis
- **WHEN** o usuário aciona "Salvar abas como workspace" e informa o nome "Loja"
- **THEN** o workspace "Loja" é gravado com duas abas, a segunda com dois painéis e os tamanhos atuais

### Requirement: Abrir workspace
Abrir um workspace SHALL criar, em abas novas, todas as abas e painéis definidos, cada painel com o seu perfil, pasta e projeto. Se algum painel tiver comando inicial, o Gunslinger SHALL mostrar a lista de comandos e só executá-los depois da confirmação do usuário; cada comando SHALL ser enviado depois que o shell do painel estiver pronto. Perfis inexistentes SHALL ser trocados pelo perfil padrão, com aviso.

#### Scenario: Abrir com comandos iniciais
- **GIVEN** o workspace "Loja" com uma aba de API (comando `dotnet watch run`) e uma de front (comando `npm run dev`)
- **WHEN** o usuário escolhe "Abrir workspace: Loja" e confirma os comandos
- **THEN** as duas abas abrem nas pastas definidas e cada comando roda no seu painel

#### Scenario: Recusar os comandos
- **GIVEN** um workspace com comandos iniciais
- **WHEN** o usuário escolhe "Abrir sem executar" na confirmação
- **THEN** as abas abrem nas pastas definidas e nenhum comando é enviado

### Requirement: Gerenciar workspaces
O Gunslinger SHALL listar os workspaces com as ações abrir, editar e excluir (com confirmação). A edição SHALL permitir renomear e, para cada painel, mudar perfil, pasta e comando inicial.

#### Scenario: Editar o comando de um painel
- **GIVEN** o workspace "Loja" existe
- **WHEN** o usuário muda o comando do painel do front para `pnpm dev` e salva
- **THEN** a próxima abertura do workspace usa `pnpm dev`
