## Purpose

Permite dividir uma aba em vários painéis de terminal, cada um com o próprio shell, para acompanhar mais de um processo ao mesmo tempo.

## ADDED Requirements

### Requirement: Dividir o painel ativo
O Gunslinger SHALL dividir o painel ativo à direita (Alt+Shift+=) ou abaixo (Alt+Shift+-), com atalhos configuráveis e ações na paleta. O painel novo SHALL abrir com o mesmo perfil e a mesma pasta atual do painel dividido, e SHALL receber o foco. A aba continua sendo uma só na barra de abas.

#### Scenario: Dividir à direita
- **GIVEN** uma aba com um painel de CMD em `C:\src`
- **WHEN** o usuário pressiona Alt+Shift+=
- **THEN** a aba passa a ter dois painéis lado a lado, o novo é um CMD em `C:\src` com o foco, e a barra de abas continua com uma aba

#### Scenario: Painéis independentes
- **GIVEN** uma aba dividida em dois painéis
- **WHEN** o usuário executa `cd C:\Windows` no painel da esquerda
- **THEN** a pasta do painel da direita não muda

### Requirement: Foco entre painéis
Clicar num painel SHALL focá-lo, e Alt+→/Alt+← SHALL focar o próximo/anterior painel da aba, dando a volta nas extremidades. Com mais de um painel, o painel ativo SHALL ficar destacado. Barra de status, busca, comandos salvos e links SHALL agir sobre o painel ativo.

#### Scenario: Barra de status segue o painel ativo
- **GIVEN** uma aba com um painel em `C:\Windows` e outro em `C:\src`
- **WHEN** o usuário clica no painel em `C:\src`
- **THEN** a barra de status mostra `C:\src`

### Requirement: Fechar painel
A ação "Fechar aba" (Ctrl+W) SHALL fechar o painel ativo, encerrando a árvore de processos dele com as mesmas regras de confirmação; o espaço é ocupado pelos painéis vizinhos. Fechar o último painel SHALL fechar a aba.

#### Scenario: Fechar um de dois painéis
- **GIVEN** uma aba com dois painéis
- **WHEN** o usuário pressiona Ctrl+W no painel ativo
- **THEN** resta um painel ocupando toda a aba, com o foco

### Requirement: Redimensionar painéis
As divisórias entre painéis SHALL poder ser arrastadas; cada terminal SHALL ser redimensionado e informar as novas dimensões ao shell.

#### Scenario: Arrastar a divisória
- **GIVEN** dois painéis lado a lado com a mesma largura
- **WHEN** o usuário arrasta a divisória para a direita
- **THEN** o painel da esquerda fica mais largo e o shell dele recebe o novo número de colunas
