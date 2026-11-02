## Purpose

Permite guardar comandos usados com frequência, organizados por categoria e com variáveis, para executá-los com poucos cliques, sempre por ação explícita do usuário.

## ADDED Requirements

### Requirement: Cadastro de comandos salvos
O usuário SHALL poder criar, editar, duplicar e excluir comandos salvos. Cada comando MUST ter nome e texto do comando, e pode ter descrição, categoria, perfil de shell de destino e pasta de execução. A exclusão SHALL pedir confirmação.

#### Scenario: Criar comando
- **GIVEN** o painel de comandos está aberto
- **WHEN** o usuário cria o comando "Status curto" com o texto `git status -sb` e a categoria "Git"
- **THEN** o comando aparece na categoria "Git" e continua salvo depois de reiniciar o app

#### Scenario: Campos obrigatórios
- **GIVEN** o formulário de novo comando está aberto
- **WHEN** o usuário tenta salvar sem o texto do comando
- **THEN** o comando não é salvo e o campo aparece marcado como obrigatório

#### Scenario: Excluir comando
- **GIVEN** o comando "Status curto" existe
- **WHEN** o usuário escolhe excluir e confirma
- **THEN** o comando some do painel e da paleta

### Requirement: Organização por categoria
Os comandos SHALL ser agrupados por categoria no painel lateral. As categorias SHALL ser criadas quando usadas pela primeira vez, renomeadas no painel (atualizando todos os comandos da categoria) e removidas quando ficarem vazias. Comandos sem categoria SHALL aparecer no grupo "Sem categoria".

#### Scenario: Renomear categoria
- **GIVEN** a categoria "EF" tem 5 comandos
- **WHEN** o usuário renomeia a categoria para "Entity Framework"
- **THEN** os 5 comandos aparecem em "Entity Framework" e "EF" deixa de existir

### Requirement: Variáveis no comando
O texto de um comando SHALL aceitar variáveis no formato `{nome}`, em que `nome` começa com uma letra ou `_` e contém só letras, dígitos e `_`. Chaves com outro conteúdo (por exemplo `{ $_.Name }`) MUST ser tratadas como texto literal. As sequências `{{` e `}}` SHALL gerar `{` e `}` literais. Cada variável pode ter um rótulo, um valor padrão e uma lista de opções.

#### Scenario: Chaves de script do PowerShell
- **GIVEN** um comando com o texto `Get-ChildItem | ForEach-Object { $_.Name }`
- **WHEN** o usuário executa o comando
- **THEN** o Gunslinger não pede nenhuma variável e envia o texto sem alteração

#### Scenario: Escape de chaves
- **GIVEN** um comando com o texto `echo {{literal}} {valor}`
- **WHEN** o usuário informa `abc` para `valor`
- **THEN** o texto enviado é `echo {literal} abc`

### Requirement: Preenchimento de variáveis antes da execução
Quando o comando tiver variáveis sem valor resolvido, o Gunslinger SHALL abrir um diálogo pedindo um valor para cada variável, já com o valor padrão preenchido e com um seletor quando houver lista de opções. O diálogo SHALL mostrar a pré-visualização do comando final. Cancelar o diálogo MUST NOT enviar nada ao terminal.

#### Scenario: Variável com opções
- **GIVEN** o comando `docker compose {acao}` em que `acao` tem as opções `up -d`, `down` e `logs -f`
- **WHEN** o usuário executa o comando
- **THEN** o diálogo mostra um seletor com as três opções e a pré-visualização é atualizada conforme a escolha

#### Scenario: Cancelar diálogo
- **GIVEN** o diálogo de variáveis está aberto
- **WHEN** o usuário pressiona Esc
- **THEN** nenhum texto é enviado a nenhum terminal

#### Scenario: Variável sem valor
- **GIVEN** o comando `git checkout {branch}` sem valor padrão
- **WHEN** o usuário tenta confirmar com o campo `branch` vazio
- **THEN** a confirmação fica bloqueada até que um valor seja informado

### Requirement: Execução somente por ação explícita
Um comando salvo MUST ser enviado a um terminal somente depois de uma ação explícita do usuário sobre aquele comando: clicar em "Executar", pressionar Enter sobre ele na paleta ou no painel, ou confirmar o diálogo de variáveis. Importar, sincronizar, abrir o app, abrir uma aba ou selecionar o comando MUST NOT executá-lo.

#### Scenario: Importação não executa
- **GIVEN** um arquivo de importação com 10 comandos
- **WHEN** o usuário conclui a importação
- **THEN** nenhum comando é enviado a nenhum terminal

#### Scenario: Seleção não executa
- **GIVEN** o painel de comandos está aberto
- **WHEN** o usuário clica uma vez no nome de um comando para selecioná-lo
- **THEN** nada é enviado ao terminal

### Requirement: Modos de envio
O Gunslinger SHALL oferecer duas ações para um comando salvo: "Executar", que envia o texto seguido de Enter, e "Inserir", que digita o texto no prompt sem Enter. Comandos com várias linhas SHALL ser enviados com bracketed paste quando o shell suportar.

#### Scenario: Inserir sem executar
- **GIVEN** uma aba ativa no prompt
- **WHEN** o usuário escolhe "Inserir" no comando `git push --force-with-lease`
- **THEN** o texto aparece no prompt e só roda quando o usuário pressionar Enter

### Requirement: Terminal de destino
Ao executar um comando salvo, o Gunslinger SHALL escolher o terminal assim:
- se o comando não tiver shell de destino, ou se o destino for o perfil da aba ativa, o comando vai para a aba ativa;
- se o destino for outro perfil, o Gunslinger abre uma aba nova com esse perfil.

Quando o comando tiver pasta de execução, o Gunslinger SHALL usar essa pasta como pasta inicial da aba nova, ou SHALL perguntar antes de mudar a pasta da aba ativa. A troca de pasta SHALL usar o comando e o formato de caminho do shell da aba (PowerShell, CMD, Git Bash ou WSL), com aspas para caminhos com espaços. Em perfis customizados, cujo tipo de shell é desconhecido, o Gunslinger MUST NOT digitar comandos de troca de pasta e SHALL abrir uma aba nova na pasta.

#### Scenario: Shell de destino diferente
- **GIVEN** a aba ativa é CMD e o comando tem o destino "Git Bash"
- **WHEN** o usuário executa o comando
- **THEN** uma aba Git Bash é aberta e o comando é executado nela, depois do primeiro prompt

#### Scenario: Pasta de execução na aba ativa
- **GIVEN** um comando com a pasta de execução `C:\projetos\api`, a aba ativa no mesmo perfil e em outra pasta
- **WHEN** o usuário executa o comando
- **THEN** o Gunslinger pergunta se deve mudar para `C:\projetos\api` e, se o usuário confirmar, troca de pasta antes do comando

#### Scenario: Troca de pasta no Git Bash
- **GIVEN** a aba ativa é Git Bash e o comando tem a pasta de execução `C:\Meus Projetos\api`
- **WHEN** o usuário confirma a troca de pasta
- **THEN** o terminal recebe `cd '/c/Meus Projetos/api'` antes do comando

#### Scenario: Troca de pasta no CMD em outro drive
- **GIVEN** a aba ativa é CMD em `C:\` e o comando tem a pasta de execução `D:\src\api`
- **WHEN** o usuário confirma a troca de pasta
- **THEN** o terminal recebe `cd /d "D:\src\api"` antes do comando

#### Scenario: Aba ativa ocupada
- **GIVEN** a aba ativa está rodando um processo filho
- **WHEN** o usuário executa um comando salvo sem shell de destino
- **THEN** o Gunslinger avisa que o terminal está ocupado e oferece abrir uma aba nova ou cancelar

### Requirement: Referências ausentes
Se o perfil de shell de destino de um comando não existir ou estiver indisponível, o Gunslinger SHALL executar o comando com o perfil padrão, depois de avisar e pedir confirmação, e SHALL marcar o comando com o aviso "Shell de destino não encontrado" no painel. A referência MUST NOT ser apagada automaticamente.

#### Scenario: Perfil de destino excluído
- **GIVEN** o comando "Build" tem o destino "Node REPL" e esse perfil foi excluído
- **WHEN** o usuário executa "Build"
- **THEN** o Gunslinger avisa que o shell de destino não existe e, se o usuário confirmar, executa o comando no perfil padrão

### Requirement: Comandos vinculados a projeto
Um comando salvo SHALL ser global por padrão e PODE ser vinculado a um perfil de projeto. Comandos vinculados SHALL aparecer na seção daquele projeto no painel e na paleta só quando o projeto estiver ativo. Ao excluir um projeto que tem comandos vinculados, o Gunslinger SHALL perguntar se esses comandos devem ser excluídos ou passar a ser globais.

#### Scenario: Comando de projeto fora do projeto
- **GIVEN** o comando "Seed do banco" está vinculado ao projeto "Loja"
- **WHEN** a aba ativa não está vinculada a "Loja"
- **THEN** "Seed do banco" não aparece no painel nem na paleta

#### Scenario: Excluir projeto com comandos
- **GIVEN** o projeto "Loja" tem 3 comandos vinculados
- **WHEN** o usuário exclui o projeto e escolhe "Tornar globais"
- **THEN** os 3 comandos continuam existindo como comandos globais

### Requirement: Painel lateral recolhível
O Gunslinger SHALL ter um painel lateral com os comandos salvos agrupados por categoria, com filtro de texto e ações para criar, editar, executar e inserir. O painel SHALL ser recolhido e expandido por um botão e por um atalho configurável, e o estado (aberto ou fechado e a largura) SHALL ser mantido entre sessões.

#### Scenario: Estado do painel persistido
- **GIVEN** o usuário recolheu o painel
- **WHEN** reinicia o app
- **THEN** o painel continua recolhido
