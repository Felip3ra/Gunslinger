## Purpose

Permite mandar a mesma entrada para vários terminais ao mesmo tempo, digitando em painéis divididos ou executando um comando salvo em vários alvos, sempre com o alcance visível e sob controle do usuário.

## ADDED Requirements

### Requirement: Ligar o broadcast numa aba
Uma aba com dois ou mais painéis SHALL oferecer "Transmitir para todos os painéis" pelo menu da aba, pela paleta e por atalho (padrão `Ctrl+Shift+I`). Ligar SHALL tornar participantes todos os painéis da aba; desligar SHALL voltar ao envio só para o painel focado. Abas com um painel só SHALL mostrar a ação desabilitada.

#### Scenario: Ligar e digitar
- **GIVEN** uma aba com três painéis SSH para servidores diferentes
- **WHEN** o usuário liga o broadcast e digita `uptime` e Enter no painel focado
- **THEN** os três painéis recebem `uptime` e Enter e mostram a saída de cada servidor

### Requirement: Toda a entrada é transmitida
Com o broadcast ligado, tudo o que o painel focado envia ao terminal SHALL ser enviado também aos outros participantes: teclas, Enter, Ctrl+C e outros controles, setas e colagem. Redimensionar, buscar, copiar e rolar MUST NOT ser transmitidos. Painéis encerrados ou desconectados SHALL ser ignorados até voltarem.

#### Scenario: Acento com tecla morta
- **GIVEN** o broadcast ligado em 2 painéis e o teclado ABNT2
- **WHEN** o usuário digita `´` e depois `a`
- **THEN** os 2 painéis recebem `á`

#### Scenario: Interromper em todos
- **GIVEN** o broadcast ligado e `tail -f app.log` rodando nos três painéis
- **WHEN** o usuário tecla Ctrl+C
- **THEN** o comando é interrompido nos três painéis

### Requirement: Participantes por painel
Cada painel SHALL poder sair ou voltar ao broadcast pelo seu menu ou clicando no selo. Painéis fora do broadcast SHALL receber só o que for digitado neles mesmos. Se o painel focado estiver fora, o que for digitado nele MUST NOT ser transmitido.

#### Scenario: Excluir um painel
- **GIVEN** o broadcast ligado em 3 painéis e o painel "prod" retirado
- **WHEN** o usuário digita `sudo systemctl restart app` num dos outros painéis
- **THEN** o comando chega aos 2 painéis participantes e não chega a "prod"

### Requirement: Indicação visual
Enquanto o broadcast estiver ligado, cada participante SHALL ter borda de destaque e o selo "Transmitindo", painéis retirados SHALL mostrar "Fora da transmissão", e a aba SHALL ter um ícone de broadcast na barra de abas.

#### Scenario: Ver o alcance
- **WHEN** o usuário liga o broadcast numa aba de 4 painéis
- **THEN** os 4 painéis ficam com a borda de destaque e o selo "Transmitindo", e a aba mostra o ícone

### Requirement: Colagem de várias linhas
Colar texto com mais de uma linha com o broadcast ligado SHALL pedir confirmação mostrando as primeiras linhas e "Colar em N painéis", com a opção "Colar só neste painel".

#### Scenario: Colar um script
- **GIVEN** o broadcast ligado em 3 painéis
- **WHEN** o usuário cola 5 linhas
- **THEN** o app pede confirmação com "Colar em 3 painéis" e só envia depois da escolha

### Requirement: Broadcast não persiste
O estado do broadcast MUST NOT ser gravado em workspaces nem na sessão restaurada. Reabrir o app ou um workspace SHALL deixar todas as abas com o broadcast desligado.

#### Scenario: Reabrir o app
- **GIVEN** o app foi fechado com o broadcast ligado numa aba
- **WHEN** o app abre de novo
- **THEN** a aba volta com os painéis e o broadcast desligado

### Requirement: Executar comando salvo em vários alvos
Comandos salvos SHALL ter "Executar em…", que abre a escolha de alvos entre os painéis abertos (de qualquer aba) e, com hosts SSH disponíveis, hosts sem aba aberta (que abrem numa aba nova dividida). O app SHALL mostrar a prévia do texto por alvo, com as variáveis de projeto resolvidas para cada um e as variáveis informadas uma vez para todos, e SHALL enviar só depois de "Executar em N alvos". Alvos que falharem SHALL ser listados no fim.

#### Scenario: Atualizar três servidores
- **GIVEN** o comando salvo "Atualizar app" (`cd /srv/app && git pull`) e os hosts "hml-1", "hml-2" e "hml-3" sem aba aberta
- **WHEN** o usuário escolhe "Executar em…", marca os três hosts e confirma "Executar em 3 alvos"
- **THEN** abre uma aba dividida em três painéis SSH e, assim que cada um conecta, o comando é enviado a ele

### Requirement: Destino do comando em painéis abertos
Em painéis já abertos, "Executar em…" SHALL rodar o comando no shell e na pasta atuais do painel, ignorando o shell e a pasta de destino definidos no comando salvo, e a prévia SHALL avisar por alvo quando o shell do painel for diferente do definido. O shell e a pasta do comando SHALL valer só para os painéis que o "Executar em…" abre.

#### Scenario: Shell diferente do comando
- **GIVEN** o comando salvo "Limpar build" define o shell Git Bash e a pasta `C:\src\loja`, e o painel escolhido é um PowerShell em `C:\src\api`
- **WHEN** o usuário escolhe esse painel em "Executar em…"
- **THEN** a prévia avisa "Este painel usa PowerShell; o comando foi definido para Git Bash", e, confirmado, o comando roda no PowerShell em `C:\src\api`, sem `cd`

#### Scenario: Um alvo falha
- **GIVEN** "hml-2" está desligado
- **WHEN** o usuário executa em "hml-1", "hml-2" e "hml-3"
- **THEN** o comando roda em "hml-1" e "hml-3", e o app avisa "Não executado em hml-2: conexão recusada"
