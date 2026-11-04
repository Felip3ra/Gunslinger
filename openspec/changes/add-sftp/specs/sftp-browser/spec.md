## Purpose

Permite navegar e transferir arquivos entre a máquina local e um servidor SSH dentro do Gunslinger, usando a mesma conexão das abas SSH.

## ADDED Requirements

### Requirement: Abrir o painel SFTP
O painel SFTP SHALL abrir a partir de uma aba SSH ("Abrir SFTP"), do menu de um host na sidebar ou da paleta ("SFTP: <host>"), como uma aba ou painel do layout. Se já houver conexão com o host, SHALL reaproveitá-la sem pedir credenciais; se não, SHALL conectar com o mesmo fluxo de autenticação e verificação de host das abas SSH.

#### Scenario: SFTP a partir de uma aba conectada
- **GIVEN** uma aba SSH conectada a "Homolog API" com 2FA
- **WHEN** o usuário escolhe "Abrir SFTP" na aba
- **THEN** o painel abre na pasta inicial do usuário remoto sem pedir senha nem código

#### Scenario: Servidor sem subsistema SFTP
- **GIVEN** o servidor não tem o subsistema SFTP habilitado
- **WHEN** o usuário abre o painel
- **THEN** o painel mostra "O servidor não oferece SFTP" e a conexão das abas SSH não é afetada

### Requirement: Painel SFTP no layout
O painel SFTP SHALL participar do layout como os terminais: foco com clique e com os atalhos de troca de painel, fechar com Ctrl+W, dividir e redimensionar. Ações exclusivas de terminal (busca na saída, copiar/colar do terminal, broadcast) SHALL ficar desabilitadas nele. Workspaces e a sessão restaurada SHALL guardar o painel SFTP pelo host e pelas duas pastas, e reabri-lo desconectado, com "Conectar".

#### Scenario: SFTP ao lado da aba SSH
- **GIVEN** uma aba SSH com um painel SFTP dividido à direita
- **WHEN** o usuário fecha e reabre o app
- **THEN** a aba volta com o painel SSH e o painel SFTP nas mesmas pastas, ambos desconectados até o usuário pedir

### Requirement: Navegação em duas colunas
O painel SHALL mostrar a coluna local (começando na pasta da aba ativa, se local, ou na pasta do usuário) e a remota (começando na pasta inicial remota), cada uma com caminho editável, voltar, subir, atualizar, ordenar por nome, tamanho e data, e alternar arquivos ocultos. Cada item SHALL mostrar nome, tamanho, data de modificação e, na remota, permissões e dono.

#### Scenario: Ir direto para uma pasta remota
- **WHEN** o usuário digita `/var/log/nginx` no caminho remoto e tecla Enter
- **THEN** a coluna remota lista o conteúdo da pasta, ou mostra "Pasta não encontrada" ou "Permissão negada"

### Requirement: Transferências com fila
Upload e download SHALL funcionar com o botão de enviar/baixar, arrastando entre as colunas e arrastando arquivos do Explorer do Windows para a coluna remota. Pastas SHALL ser copiadas recursivamente. Cada transferência SHALL entrar numa fila com progresso, velocidade e tempo restante, com cancelar por item ou tudo; no máximo 3 arquivos SHALL ser transferidos ao mesmo tempo. Ao terminar, a coluna de destino SHALL ser atualizada.

#### Scenario: Baixar uma pasta de logs
- **WHEN** o usuário arrasta a pasta remota `logs` para a coluna local
- **THEN** a pasta e todo o conteúdo aparecem na pasta local, e a fila mostra o progresso até concluir

#### Scenario: Cancelar uma transferência
- **GIVEN** o upload de `build.zip` (500 MB) está em andamento
- **WHEN** o usuário clica em cancelar no item
- **THEN** a transferência para e o arquivo parcial é removido do destino

### Requirement: Falha e retomada
Se a conexão cair ou um arquivo falhar, os itens afetados SHALL ficar como "Falhou" com o motivo, e "Tentar de novo" SHALL retomar do ponto em que parou quando o arquivo parcial no destino for menor que a origem e o seu trecho final (até 64 KB) for idêntico ao trecho correspondente da origem, ou recomeçar caso contrário. Ao concluir uma transferência retomada, o tamanho final SHALL ser conferido com o da origem.

#### Scenario: Retomar depois da queda
- **GIVEN** um download parou em 60% porque a rede caiu
- **WHEN** a conexão volta e o usuário clica em "Tentar de novo"
- **THEN** a transferência continua de 60% e o arquivo final é idêntico ao do servidor

### Requirement: Conflitos de nome
Quando o destino já tem um arquivo com o mesmo nome, o app SHALL perguntar "Substituir", "Pular" ou "Manter os dois" (adiciona ` (1)`, ` (2)` antes da extensão), com "Aplicar aos próximos conflitos desta transferência". Nada SHALL ser sobrescrito sem essa escolha.

#### Scenario: Substituir todos
- **GIVEN** 10 arquivos enviados e 4 já existem no servidor
- **WHEN** o usuário escolhe "Substituir" com "Aplicar aos próximos"
- **THEN** o app pergunta uma vez e substitui os 4

### Requirement: Operações de arquivo
Nas duas colunas SHALL ser possível criar pasta, renomear, excluir e copiar o caminho. Excluir SHALL pedir confirmação mostrando quantos itens serão apagados, inclusive dentro de pastas; na coluna local, os itens SHALL ir para a Lixeira. Na coluna remota, "Permissões" SHALL editar o modo por caixas de leitura/escrita/execução ou valor octal, com opção de aplicar recursivamente.

#### Scenario: Tornar um script executável
- **WHEN** o usuário abre "Permissões" em `deploy.sh`, marca "execução" para o dono e confirma
- **THEN** o modo do arquivo no servidor passa de `644` para `744`

### Requirement: Editar arquivo remoto no editor local
"Editar" num arquivo remoto SHALL baixá-lo para uma pasta temporária e abri-lo no editor configurado. Cada vez que o arquivo local for salvo, o app SHALL perguntar "Enviar alterações para <host>?", e só enviar com confirmação. Se o arquivo remoto tiver mudado desde o download, a pergunta SHALL avisar e oferecer substituir mesmo assim, baixar a versão do servidor para um arquivo ao lado ou cancelar. Os temporários SHALL ser apagados ao fechar o painel.

#### Scenario: Ajustar um arquivo de configuração
- **GIVEN** o usuário escolheu "Editar" em `/etc/app/appsettings.json`
- **WHEN** ele salva o arquivo no editor e confirma "Enviar alterações"
- **THEN** o arquivo no servidor fica com o conteúdo salvo
