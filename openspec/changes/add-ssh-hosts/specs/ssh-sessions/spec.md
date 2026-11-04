## Purpose

Faz das conexões SSH abas de terminal de primeira classe no Gunslinger, com autenticação guiada, hosts de salto e tratamento claro de queda e reconexão.

## ADDED Requirements

### Requirement: Aba SSH
Conectar a um host SHALL abrir uma aba de terminal com shell remoto interativo (PTY remota com o tamanho do painel e `TERM=xterm-256color`). A aba SHALL funcionar como as de shell local em atalhos, split panes, busca, links, copiar e colar, e SHALL mostrar o nome e a cor do host. A barra de status SHALL mostrar `usuário@endereço` em vez de projeto e Git.

#### Scenario: Programa interativo remoto
- **GIVEN** uma aba SSH conectada
- **WHEN** o usuário roda `htop` e redimensiona o painel
- **THEN** o programa se redesenha no novo tamanho e Ctrl+C o encerra

### Requirement: Progresso da conexão
Enquanto conecta, a aba SHALL mostrar a etapa (resolvendo endereço, conectando, verificando o servidor, autenticando). Falhas SHALL aparecer na aba com mensagem em português (endereço não encontrado, conexão recusada, tempo esgotado em 20 s, autenticação recusada, nenhum algoritmo em comum com o servidor) e os botões "Tentar de novo" e "Editar host". Algoritmos considerados fracos (troca de chaves `diffie-hellman-group1-sha1`, assinatura `ssh-rsa` com SHA-1, cifras CBC) MUST NOT ser oferecidos.

#### Scenario: Servidor desligado
- **WHEN** o usuário conecta a um host que recusa a conexão na porta 22
- **THEN** a aba mostra "Conexão recusada por 10.0.0.12:22" com "Tentar de novo" e "Editar host"

### Requirement: Fluxo de autenticação
A autenticação SHALL tentar, nesta ordem, a chave configurada, o agente SSH (se habilitado), a senha salva e keyboard-interactive. Quando faltar uma credencial, o app SHALL pedir num diálogo (senha, frase-senha da chave ou as perguntas do servidor, como código 2FA), com "Salvar no keychain" desmarcado por padrão e indisponível para respostas de keyboard-interactive que não sejam a senha.

#### Scenario: Senha pedida e salva
- **GIVEN** o host "VM teste" tem usuário mas nenhuma credencial
- **WHEN** o usuário conecta, digita a senha, marca "Salvar no keychain" e confirma
- **THEN** a conexão abre e a próxima conexão a "VM teste" não pede a senha

#### Scenario: Código 2FA
- **GIVEN** o servidor pede senha e depois "Verification code" via keyboard-interactive
- **WHEN** o usuário conecta
- **THEN** o app mostra as duas perguntas em sequência e a opção de salvar não aparece para o código

### Requirement: Host de salto
Um host SHALL poder usar outro host como salto, e o salto SHALL poder ter o próprio salto. Cada salto SHALL passar pela verificação de host conhecido e pela autenticação com as próprias credenciais. Ciclos SHALL ser recusados ao salvar o host.

#### Scenario: Conexão pelo bastion
- **GIVEN** o host "app" usa "bastion" como salto
- **WHEN** o usuário conecta a "app"
- **THEN** o app conecta a "bastion", abre o túnel até "app" e a aba mostra o shell de "app"

#### Scenario: Ciclo de saltos
- **WHEN** o usuário configura "a" com salto "b" e "b" com salto "a"
- **THEN** o formulário mostra "Os hosts de salto formam um ciclo" e não salva

### Requirement: Keepalive e queda da conexão
O app SHALL enviar keepalive no intervalo configurado (padrão 30 s, herdável do grupo; 0 desliga). Quando a conexão cair, a aba SHALL manter a saída na tela, mostrar "Conexão encerrada" com o motivo e o botão "Reconectar" (Enter também reconecta), sem reconectar sozinha.

#### Scenario: Rede caiu
- **GIVEN** uma aba SSH conectada
- **WHEN** o servidor deixa de responder ao keepalive
- **THEN** a aba mostra "Conexão encerrada: o servidor não respondeu" e "Reconectar" abre uma sessão nova no mesmo painel

### Requirement: Encerramento
Fechar uma aba SSH SHALL encerrar o canal do shell remoto e, se não houver outro uso da mesma conexão, a própria conexão. Sair do app SHALL encerrar todas as conexões. Abas SSH MUST NOT ser contadas como ocupadas na confirmação de saída, pois o app não sabe se há comando rodando no servidor.

#### Scenario: Fechar a aba
- **GIVEN** uma aba SSH conectada e nenhum outro uso da conexão
- **WHEN** o usuário fecha a aba com Ctrl+W
- **THEN** a conexão com o servidor é encerrada

### Requirement: Abas SSH em workspaces e na sessão restaurada
Workspaces e a restauração da última sessão SHALL guardar abas SSH pelo host. Ao reabrir, a aba SHALL ficar como "Desconectado" com "Conectar", sem conectar sozinha. Se o host tiver sido excluído, a aba SHALL mostrar "Host não encontrado".

#### Scenario: Reabrir o app
- **GIVEN** o app foi fechado com uma aba SSH para "Homolog API"
- **WHEN** o app abre de novo
- **THEN** a aba aparece com "Desconectado" e "Conectar", e nenhuma conexão é feita até o usuário pedir

### Requirement: Comando inicial de painel SSH em workspace
Um painel SSH de workspace SHALL poder ter comando inicial, como os painéis locais. Ao abrir o workspace, os painéis SSH SHALL conectar só depois da confirmação que o workspace já pede, e o comando SHALL ser enviado depois que a sessão estiver conectada. Se a conexão falhar ou for cancelada, o comando MUST NOT ser enviado.

#### Scenario: Workspace com log remoto
- **GIVEN** o workspace "Homolog" tem um painel SSH para "Homolog API" com o comando `tail -f /var/log/app.log`
- **WHEN** o usuário abre o workspace e confirma
- **THEN** o painel conecta e, conectado, recebe o comando

### Requirement: Conexões simultâneas ao mesmo host
Pedidos simultâneos de conexão ao mesmo host (várias abas, aba e túnel, aba e SFTP) SHALL aguardar a mesma tentativa de conexão em andamento, de modo que verificação de host e autenticação aconteçam uma vez só.

#### Scenario: Duas abas ao mesmo tempo
- **GIVEN** o host "Prod DB" pede código 2FA
- **WHEN** um workspace abre dois painéis SSH para "Prod DB" ao mesmo tempo
- **THEN** o app pede o código uma vez e os dois painéis conectam
