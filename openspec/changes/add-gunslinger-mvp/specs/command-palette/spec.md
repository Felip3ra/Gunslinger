## Purpose

Dá um ponto único, operado pelo teclado, para encontrar e acionar comandos salvos, scripts e comandos de projeto e ações do aplicativo por busca aproximada.

## ADDED Requirements

### Requirement: Abrir e fechar a paleta
O Gunslinger SHALL abrir a paleta de comandos com Ctrl+P (atalho configurável), com o foco no campo de busca. Esc ou clicar fora SHALL fechar a paleta e devolver o foco ao terminal ativo.

#### Scenario: Abrir com atalho
- **GIVEN** o foco está no terminal
- **WHEN** o usuário pressiona Ctrl+P
- **THEN** a paleta abre com o foco no campo de busca e Ctrl+P não é enviado ao shell

#### Scenario: Fechar com Esc
- **GIVEN** a paleta está aberta
- **WHEN** o usuário pressiona Esc
- **THEN** a paleta fecha e o foco volta ao terminal ativo

### Requirement: Fontes de itens
A paleta SHALL listar:
- comandos salvos;
- comandos do projeto ativo: scripts de cada `package.json`, comandos prontos de Node e comandos de EF Core;
- ações do app (por exemplo "Nova aba: <perfil>", "Fechar aba", "Abrir configurações", "Alternar painel lateral", "Buscar no terminal", "Recarregar ambiente", "Importar", "Exportar", "Abrir projeto: <nome>");
- perfis de shell.

Cada item SHALL mostrar o tipo, a origem (categoria, ou pacote para scripts de subpastas) e o atalho quando houver.

#### Scenario: Ação do app
- **GIVEN** a paleta está aberta
- **WHEN** o usuário digita "recarregar" e pressiona Enter
- **THEN** a ação "Recarregar ambiente" é executada

#### Scenario: Script do projeto
- **GIVEN** o projeto ativo tem `frontend/package.json` com o script `dev`
- **WHEN** o usuário digita "dev" na paleta
- **THEN** aparece o item "dev" com a origem "frontend" e o comando que será executado (por exemplo `npm run dev`)

### Requirement: Busca fuzzy
A busca SHALL fazer correspondência aproximada e tolerante a subsequência no nome, na categoria ou origem, na descrição e no texto do comando, sem diferenciar maiúsculas, minúsculas e acentos. A busca SHALL ordenar o nome acima das outras correspondências e destacar os caracteres encontrados. Com o campo vazio, a paleta SHALL mostrar primeiro os itens usados mais recentemente.

#### Scenario: Subsequência
- **GIVEN** existe o comando salvo "Nova migration" na categoria "EF"
- **WHEN** o usuário digita "nvmig"
- **THEN** "Nova migration" aparece entre os primeiros resultados, com as letras correspondentes destacadas

#### Scenario: Sem acentos
- **GIVEN** existe o comando "Atualizar banco de produção"
- **WHEN** o usuário digita "producao"
- **THEN** o comando aparece nos resultados

#### Scenario: Sem resultados
- **GIVEN** a paleta está aberta
- **WHEN** o usuário digita um texto que não corresponde a nada
- **THEN** a paleta mostra "Nenhum resultado" e Enter não faz nada

### Requirement: Navegação por teclado e execução
As setas para cima e para baixo SHALL mover a seleção. Enter SHALL acionar o item selecionado, e para comandos (salvos, scripts ou de projeto) isso conta como a ação explícita "Executar", passando pelo diálogo de variáveis quando houver. Shift+Enter sobre um comando SHALL acionar "Inserir".

#### Scenario: Executar comando com variável pela paleta
- **GIVEN** o comando salvo `git checkout {branch}` aparece selecionado na paleta
- **WHEN** o usuário pressiona Enter
- **THEN** a paleta fecha e abre o diálogo pedindo `branch`, sem enviar nada ao terminal antes da confirmação

### Requirement: Desempenho da busca
Com até 1.000 itens, a lista de resultados SHALL ser atualizada em menos de 50 ms após cada tecla.

#### Scenario: Muitos comandos
- **GIVEN** existem 1.000 itens entre comandos salvos, scripts e ações
- **WHEN** o usuário digita na paleta
- **THEN** os resultados são atualizados a cada tecla, sem travamento perceptível
