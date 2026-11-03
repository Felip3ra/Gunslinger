## Purpose

Reduz atritos do uso diário: reabrir o trabalho, achar comandos antigos, suportar bun e personalizar perfis.

## ADDED Requirements

### Requirement: Reabrir a última sessão
Com `session.restore` ligado, o Gunslinger SHALL reabrir ao iniciar as abas e painéis abertos quando o app fechou, com perfil, pasta e projeto, e SHALL NOT executar nenhum comando ao reabrir.

#### Scenario: Duas abas
- **GIVEN** o app fechou com duas abas abertas
- **WHEN** o usuário abre o app de novo
- **THEN** as duas abas aparecem nas mesmas pastas

#### Scenario: Opção desligada
- **WHEN** `session.restore` está desligado
- **THEN** o app abre com uma aba do perfil padrão

### Requirement: Histórico de comandos
Com `terminal.commandHistory` ligado, cada comando terminado SHALL entrar no topo do histórico (sem repetição, até 500, sem os começados por espaço). A busca SHALL listar os comandos de todas as abas; Enter SHALL escrever o comando no terminal ativo sem executar e Ctrl+Enter SHALL executar.

#### Scenario: Reusar um comando de outra aba
- **GIVEN** `dotnet ef database update` foi executado em outra aba
- **WHEN** o usuário abre a busca, digita "ef upd" e pressiona Enter
- **THEN** o comando aparece no prompt da aba ativa, sem rodar

### Requirement: bun
Projetos com `bun.lock`, `bun.lockb` ou `packageManager: bun@…` SHALL usar o bun nos scripts e comandos de pacote.

#### Scenario: Adicionar pacote de desenvolvimento
- **WHEN** o projeto usa bun e o usuário escolhe "Adicionar pacote de desenvolvimento"
- **THEN** o comando é `bun add --dev {pacote}`

### Requirement: Ícone de perfil por arquivo
Um perfil cujo ícone é o caminho de uma imagem SHALL mostrar a imagem nas abas, no menu de nova aba e nas configurações; arquivo ausente, grande demais ou de tipo não suportado SHALL mostrar o bloco da cor do perfil.

#### Scenario: Imagem escolhida
- **WHEN** o usuário escolhe uma imagem em "Escolher imagem…" e salva o perfil
- **THEN** as abas desse perfil mostram a imagem

### Requirement: Acesso às configurações
A barra de abas SHALL ter um botão de configurações sempre visível à direita.

#### Scenario: Clique na engrenagem
- **WHEN** o usuário clica na engrenagem
- **THEN** as configurações abrem
