## Purpose

Permite trabalhar com vários shells ao mesmo tempo, cada um em uma aba com processo próprio, e cobre o ciclo de vida desses processos, a navegação, a renderização, os programas interativos e o rastreamento da pasta atual.

## ADDED Requirements

### Requirement: Abas com processo próprio
Cada aba SHALL ter o seu próprio processo de shell, e a entrada e a saída de uma aba MUST NOT afetar outra.

#### Scenario: Duas abas independentes
- **GIVEN** uma aba PowerShell e uma aba Git Bash estão abertas
- **WHEN** o usuário executa `cd C:\temp` na aba PowerShell
- **THEN** a pasta atual da aba Git Bash não muda

### Requirement: Atalhos de abas
O Gunslinger SHALL oferecer estes atalhos padrão, que podem ser mudados nas configurações: Ctrl+T abre uma nova aba com o perfil padrão, Ctrl+W fecha a aba ativa, Ctrl+Tab ativa a próxima aba e Ctrl+Shift+Tab ativa a anterior. A navegação SHALL dar a volta nas extremidades. Uma combinação associada a uma ação do app MUST NOT ser enviada ao shell.

#### Scenario: Nova aba
- **GIVEN** uma aba está aberta
- **WHEN** o usuário pressiona Ctrl+T
- **THEN** uma nova aba com o perfil padrão é aberta, ativada e recebe o foco do teclado

#### Scenario: Navegação circular
- **GIVEN** três abas abertas e a última está ativa
- **WHEN** o usuário pressiona Ctrl+Tab
- **THEN** a primeira aba fica ativa

#### Scenario: Atalho não chega ao shell
- **GIVEN** uma aba Git Bash está ativa e Ctrl+W está associado a "Fechar aba"
- **WHEN** o usuário pressiona Ctrl+W
- **THEN** a sequência de teclas não é enviada ao Bash e a ação "Fechar aba" é acionada

#### Scenario: Atalho liberado volta ao shell
- **GIVEN** o usuário mudou "Fechar aba" para Ctrl+Shift+W
- **WHEN** ele pressiona Ctrl+W numa aba Git Bash
- **THEN** o Bash recebe Ctrl+W e apaga a palavra anterior

### Requirement: Menu de nova aba
O Gunslinger SHALL ter um menu de nova aba com todos os perfis visíveis, mostrando o ícone e a cor de cada um. Escolher um perfil SHALL abrir uma aba com ele.

#### Scenario: Abrir aba de WSL pelo menu
- **GIVEN** o perfil "WSL: Ubuntu" existe
- **WHEN** o usuário abre o menu de nova aba e escolhe "WSL: Ubuntu"
- **THEN** abre uma aba rodando a distribuição Ubuntu

### Requirement: Identidade visual da aba
Cada aba SHALL exibir o ícone, a cor de destaque do perfil e um título. O título SHALL ser o título definido pelo shell (sequência OSC 0/2) quando houver, ou o nome do perfil quando não houver.

#### Scenario: Cor do PowerShell
- **GIVEN** o perfil PowerShell 7 tem a cor padrão azul
- **WHEN** uma aba PowerShell 7 é aberta
- **THEN** a aba mostra o destaque azul

### Requirement: Fechamento de aba encerra os processos
Fechar uma aba SHALL encerrar o processo de shell dela e todos os processos descendentes. Se a aba tiver um processo filho em execução, o Gunslinger SHALL pedir confirmação antes de fechar.

#### Scenario: Fechar aba ociosa
- **GIVEN** uma aba está no prompt, sem processo filho
- **WHEN** o usuário aciona "Fechar aba"
- **THEN** a aba fecha sem confirmação e o processo do shell é encerrado

#### Scenario: Fechar aba com servidor de desenvolvimento
- **GIVEN** uma aba está rodando `npm run dev`, que iniciou um servidor Vite na porta 5173
- **WHEN** o usuário aciona "Fechar aba" e confirma
- **THEN** a aba fecha, o shell, o `npm` e o `node` do Vite são encerrados e a porta 5173 fica livre

#### Scenario: Fechar a última aba
- **GIVEN** só existe uma aba aberta
- **WHEN** o usuário fecha essa aba
- **THEN** a janela do Gunslinger fecha

### Requirement: Shell que termina sozinho
Quando o processo do shell de uma aba terminar sem ação do Gunslinger (por exemplo, com `exit`), a aba SHALL mostrar o código de saída e oferecer "Reiniciar" ou "Fechar". Se o código de saída for 0, a aba SHALL fechar automaticamente.

#### Scenario: Shell termina com erro
- **GIVEN** uma aba com um perfil customizado cujo executável termina com código 1
- **WHEN** o processo termina
- **THEN** a aba mostra "Processo encerrado com código 1" e as opções Reiniciar e Fechar

#### Scenario: Falha ao iniciar
- **GIVEN** o executável de um perfil foi removido depois de o perfil ser salvo
- **WHEN** o usuário abre uma aba com esse perfil
- **THEN** a aba mostra o erro de inicialização e o app continua funcionando

### Requirement: Redimensionamento
Quando a janela, o painel lateral ou o tamanho da fonte mudarem, o Gunslinger SHALL recalcular as colunas e linhas do terminal ativo e repassar as novas dimensões ao processo do shell. Abas inativas SHALL ser redimensionadas quando forem ativadas.

#### Scenario: Maximizar a janela
- **GIVEN** um programa de tela cheia (por exemplo `vim` no WSL) está aberto na aba ativa
- **WHEN** o usuário maximiza a janela
- **THEN** o programa se redesenha ocupando toda a área nova, sem quebra de linha errada

#### Scenario: Recolher o painel lateral
- **GIVEN** o painel de comandos está aberto
- **WHEN** o usuário recolhe o painel
- **THEN** o terminal ativo passa a ocupar a largura liberada e o shell recebe o novo número de colunas

### Requirement: Programas interativos
O terminal SHALL funcionar com programas interativos que leem o teclado em modo bruto e redesenham a tela, como `npx create-vite`, `npm init`, prompts com setas, listas de seleção com espaço, barras de progresso que reescrevem a linha (`\r` e movimento de cursor), tela alternativa (`vim`, `less`, `htop`) e eventos de mouse quando o programa os solicitar. Setas, Home, End, Page Up e Page Down, Tab, Esc e combinações com Alt SHALL chegar ao programa como as sequências esperadas.

#### Scenario: Seleção com setas no create-vite
- **GIVEN** uma aba PowerShell 7 está aberta numa pasta vazia
- **WHEN** o usuário executa `npx create-vite@latest`, usa as setas para escolher "React" e "TypeScript" e confirma com Enter
- **THEN** o destaque se move a cada seta, a opção escolhida é aplicada e o projeto é criado

#### Scenario: Barra de progresso
- **GIVEN** uma aba está aberta
- **WHEN** o usuário executa `npm install` num projeto com dependências
- **THEN** a barra ou indicador de progresso é redesenhado na mesma linha, sem gerar uma linha nova a cada atualização

#### Scenario: Tela alternativa
- **GIVEN** uma aba WSL está aberta com saída anterior na tela
- **WHEN** o usuário abre e fecha o `less`
- **THEN** ao sair, a saída anterior volta a aparecer como estava

### Requirement: Interrupção, cópia e colagem
Ctrl+C sem texto selecionado SHALL enviar a interrupção ao programa em primeiro plano da aba, sem fechar a aba. Com texto selecionado, Ctrl+C SHALL copiar a seleção e limpar a seleção, sem enviar interrupção. Ctrl+Shift+C SHALL sempre copiar. Ctrl+V e Ctrl+Shift+V SHALL colar, usando bracketed paste quando o programa o tiver ativado.

#### Scenario: Interromper servidor
- **GIVEN** uma aba rodando `npm run dev` e nenhum texto selecionado
- **WHEN** o usuário pressiona Ctrl+C
- **THEN** o servidor é interrompido e a aba continua aberta; se o CMD perguntar "Terminate batch job (Y/N)?", a pergunta aparece para o usuário responder, e o Gunslinger não responde sozinho

#### Scenario: Copiar seleção
- **GIVEN** uma aba rodando um servidor e um trecho da saída selecionado
- **WHEN** o usuário pressiona Ctrl+C
- **THEN** o trecho vai para a área de transferência e o servidor continua rodando

#### Scenario: Interromper prompt interativo
- **GIVEN** o `npm init` está esperando uma resposta
- **WHEN** o usuário pressiona Ctrl+C
- **THEN** o `npm init` é cancelado e o shell volta ao prompt

### Requirement: Renderização fiel e responsiva
O terminal SHALL suportar cores ANSI de 16, 256 e 24 bits, Unicode (incluindo acentos, emoji e caracteres de largura dupla) e sequências de controle de cursor. Durante a digitação, o eco de um caractere MUST aparecer sem atraso perceptível (meta: menos de 50 ms entre a tecla e a renderização, com o shell ocioso).

#### Scenario: Cores 24 bits
- **GIVEN** uma aba está aberta
- **WHEN** o usuário executa um comando que imprime texto com a sequência `ESC[38;2;255;100;0m`
- **THEN** o texto aparece na cor RGB(255,100,0)

#### Scenario: Acentuação em português
- **GIVEN** uma aba PowerShell está aberta
- **WHEN** o usuário digita `echo "ação çÇ ñ 日本"` e pressiona Enter
- **THEN** a saída mostra os caracteres corretos e alinhados

#### Scenario: Saída volumosa
- **GIVEN** uma aba está aberta
- **WHEN** um comando imprime 100.000 linhas rapidamente
- **THEN** a UI continua respondendo e Ctrl+C interrompe o comando

### Requirement: Rastreamento da pasta atual
O Gunslinger SHALL rastrear a pasta atual de cada aba pelas sequências de integração emitidas pelo shell. Para PowerShell, Git Bash, WSL (bash) e CMD, o Gunslinger SHALL configurar essa integração na inicialização da aba, sem alterar os arquivos de perfil do usuário. Se a integração não estiver disponível, a pasta atual SHALL ser a pasta inicial da aba.

#### Scenario: cd atualiza a pasta conhecida
- **GIVEN** uma aba Git Bash com a integração ativa
- **WHEN** o usuário executa `cd /c/projetos/api`
- **THEN** a pasta atual da aba passa a ser `C:\projetos\api`

#### Scenario: Shell sem integração
- **GIVEN** um perfil customizado que não emite sequências de integração
- **WHEN** o usuário muda de pasta nesse shell
- **THEN** o Gunslinger continua usando a pasta inicial da aba como pasta atual

### Requirement: Detecção de início e fim de comando
Quando a integração do shell estiver ativa, o Gunslinger SHALL registrar o momento em que cada comando começa e termina na aba, além do código de saída quando o shell informar.

#### Scenario: Comando concluído
- **GIVEN** uma aba PowerShell com a integração ativa
- **WHEN** o usuário executa `Start-Sleep 3` e o prompt volta
- **THEN** o Gunslinger registra um comando com duração de cerca de 3 segundos
