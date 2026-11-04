## Purpose

Sugere comandos enquanto o usuário digita no prompt, a partir do histórico, dos comandos salvos, do projeto ativo e das ferramentas mais usadas, sem nunca executar nada sozinho.

## ADDED Requirements

### Requirement: Quando as sugestões aparecem
Sugestões SHALL aparecer só quando o app sabe que o cursor está no prompt do shell (integração de shell ativa e prompt pronto) e o texto digitado tem pelo menos 1 caractere. Durante um comando em execução, em programas de tela cheia e em abas sem integração (inclusive SSH), as sugestões MUST NOT aparecer.

#### Scenario: Dentro do vim
- **GIVEN** o usuário abriu o `vim` numa aba PowerShell
- **WHEN** digita `git` no editor
- **THEN** nenhuma sugestão aparece

#### Scenario: Aba sem integração
- **GIVEN** uma aba SSH ou um shell customizado sem integração
- **WHEN** o usuário digita no prompt
- **THEN** nenhuma sugestão aparece e `Ctrl+Space` mostra "Sugestões indisponíveis nesta aba"

### Requirement: Sugestão inline
Com o cursor no fim do texto digitado, o app SHALL mostrar depois do cursor, em texto esmaecido, o restante da melhor sugestão que comece com o que foi digitado. `→` ou `End` no fim da linha SHALL aceitá-la, digitando o restante no shell sem Enter. `Ctrl+→` SHALL aceitar só a próxima palavra. Qualquer outra tecla SHALL seguir para o shell normalmente e atualizar ou esconder a sugestão.

#### Scenario: Aceitar do histórico
- **GIVEN** o histórico tem `dotnet ef database update --project src/Loja.Data`
- **WHEN** o usuário digita `dotnet ef d` e tecla `→`
- **THEN** o prompt fica com o comando completo, o cursor no fim, e nada é executado

#### Scenario: Cursor no meio da linha
- **WHEN** o usuário volta o cursor para o meio do texto digitado
- **THEN** a sugestão inline some e `→` move o cursor como de costume

### Requirement: Lista de sugestões
`Ctrl+Space` SHALL abrir, junto ao cursor, uma lista com até 10 sugestões para o texto atual, cada uma com a origem (Histórico, Comando salvo, Projeto, Subcomando, Arquivo, Branch). Setas SHALL navegar, `Tab` ou `Enter` SHALL inserir a escolhida (substituindo a palavra ou a linha, conforme a origem) sem executar, e `Esc` SHALL fechar. Com a lista fechada, `Tab` e `Enter` SHALL ir para o shell.

#### Scenario: Escolher um script do projeto
- **GIVEN** o projeto ativo tem os scripts `dev`, `build` e `test` no `package.json` e usa pnpm
- **WHEN** o usuário digita `pnpm ` e tecla `Ctrl+Space`
- **THEN** a lista mostra `pnpm dev`, `pnpm build` e `pnpm test` com a origem "Projeto"

### Requirement: Comandos salvos com variáveis
Escolher um comando salvo com variáveis SHALL abrir o diálogo de variáveis existente e inserir o comando resolvido, sem Enter.

#### Scenario: Comando salvo com variável
- **GIVEN** o comando salvo "Nova migration" (`dotnet ef migrations add {nome}`)
- **WHEN** o usuário digita `dotnet ef mig`, abre a lista e escolhe "Nova migration"
- **THEN** o app pede `nome` e insere `dotnet ef migrations add AddPedidos` no prompt

### Requirement: Ordem do histórico
Entre sugestões do histórico, o app SHALL preferir as que começam exatamente com o texto digitado, depois as executadas na mesma pasta, depois as mais frequentes e recentes, e por último as que terminaram com código de saída diferente de 0. Textos repetidos SHALL aparecer uma vez só.

#### Scenario: Mesma pasta primeiro
- **GIVEN** o histórico tem `npm run dev` executado na pasta atual e `npm run build` executado mais vezes em outra pasta
- **WHEN** o usuário digita `npm run ` na pasta atual
- **THEN** a sugestão inline é `npm run dev`

### Requirement: Fontes de sugestão
As sugestões SHALL vir do histórico de comandos, dos comandos salvos visíveis no projeto ativo, dos scripts e comandos prontos do projeto ativo, de subcomandos e opções conhecidos de `git`, `dotnet`, `npm`, `yarn`, `pnpm` e `docker`, dos branches locais do Git depois de `git checkout`/`switch`/`merge`/`rebase`, e de arquivos e pastas da pasta atual quando a palavra parece um caminho. Cada fonte SHALL poder ser desligada nas configurações.

#### Scenario: Branch do Git
- **GIVEN** o repositório da pasta atual tem os branches `main` e `feature/pedidos`
- **WHEN** o usuário digita `git switch fe`
- **THEN** a sugestão inline completa para `git switch feature/pedidos`

#### Scenario: Caminho relativo
- **GIVEN** a pasta atual contém `src/` e `scripts/`
- **WHEN** o usuário digita `cd s` e abre a lista
- **THEN** a lista mostra `src/` e `scripts/` com a origem "Arquivo"

### Requirement: Convivência com o shell
`Tab` fora da lista SHALL continuar sendo tratado pelo shell. Em perfis PowerShell, a sugestão inline SHALL vir desligada por padrão (o PSReadLine já tem a sua), mantendo a lista por `Ctrl+Space`; o usuário SHALL poder ligar a sugestão inline por tipo de shell.

#### Scenario: PowerShell
- **GIVEN** uma aba PowerShell 7 com as configurações padrão
- **WHEN** o usuário digita `git st`
- **THEN** o Gunslinger não mostra sugestão inline e `Ctrl+Space` abre a lista

### Requirement: Desempenho e privacidade
A sugestão inline SHALL aparecer em até 50 ms depois da tecla para fontes locais em memória; fontes que dependem do disco ou do Git SHALL ter timeout de 1 s e não atrasar as outras. As sugestões SHALL ser calculadas na máquina do usuário, sem enviar nada para fora.

#### Scenario: Git lento
- **GIVEN** o `git` demora mais de 1 s para listar os branches
- **WHEN** o usuário digita `git switch ` e abre a lista
- **THEN** a lista mostra na hora as sugestões do histórico, e os branches não aparecem nesta consulta
