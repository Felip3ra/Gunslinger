## Purpose

Guarda os servidores remotos do usuário, organizados em grupos com herança de configuração, para que conectar a um deles seja um clique em vez de um comando lembrado de memória.

## ADDED Requirements

### Requirement: Cadastro de hosts
O Gunslinger SHALL permitir criar, editar e excluir hosts com nome, endereço (nome DNS, IPv4 ou IPv6), porta (padrão 22), usuário, identidade ou chave, host de salto, cor, tags e grupo. O endereço SHALL ser obrigatório; os demais campos podem ficar vazios para herdar do grupo.

#### Scenario: Criar um host
- **GIVEN** nenhum host cadastrado
- **WHEN** o usuário cria o host "Homolog API" com endereço `10.0.0.12`, usuário `deploy` e a chave "deploy-ed25519"
- **THEN** o host aparece na seção "Hosts" da sidebar e continua lá depois de reiniciar o app

#### Scenario: Endereço inválido
- **WHEN** o usuário tenta salvar um host com endereço vazio ou porta fora de 1–65535
- **THEN** o formulário mostra o erro no campo e não salva

### Requirement: Duplicar host
"Duplicar" SHALL criar um host novo com os mesmos campos, grupo e tags, com o nome seguido de " (cópia)". Segredos SHALL continuar compartilhados por referência à mesma identidade ou chave, sem copiar o segredo.

#### Scenario: Duplicar um servidor
- **GIVEN** o host "hml-1" usa a identidade "deploy"
- **WHEN** o usuário escolhe "Duplicar" em "hml-1" e troca o endereço
- **THEN** o host "hml-1 (cópia)" é salvo com a identidade "deploy" e o novo endereço

### Requirement: Grupos com herança
Hosts SHALL poder ficar em grupos, e grupos dentro de grupos. Um grupo SHALL poder definir porta, usuário, identidade ou chave, host de salto e intervalo de keepalive. Cada campo vazio do host SHALL ser resolvido pelo grupo mais próximo que o define, subindo até a raiz; o formulário do host SHALL mostrar o valor herdado e de onde ele vem.

#### Scenario: Usuário herdado do grupo
- **GIVEN** o grupo "Produção" define usuário `ops` e o host "Prod DB" dentro dele não define usuário
- **WHEN** o usuário conecta a "Prod DB"
- **THEN** a conexão usa o usuário `ops` e o formulário de "Prod DB" mostra "ops (herdado de Produção)"

#### Scenario: Excluir um grupo com hosts
- **GIVEN** o grupo "Clientes" contém 3 hosts
- **WHEN** o usuário exclui o grupo
- **THEN** o app pergunta se os hosts são excluídos ou movidos para o grupo acima, e faz o que foi escolhido

### Requirement: Busca e conexão rápida
A seção "Hosts" SHALL filtrar por nome, endereço, usuário e tags. Digitar `[usuário@]endereço[:porta]` na busca SHALL oferecer "Conectar a <texto>" sem cadastrar, com a opção de salvar o host depois de conectar.

#### Scenario: Conexão rápida
- **WHEN** o usuário digita `root@192.168.0.50:2222` na busca de hosts e escolhe "Conectar"
- **THEN** abre uma aba SSH para `192.168.0.50`, porta 2222, usuário `root`, e nenhum host é cadastrado

### Requirement: Hosts na paleta e nos atalhos
Cada host SHALL aparecer na paleta (Ctrl+P) como "Conectar: <nome>", que abre uma aba nova. O menu do host na sidebar SHALL oferecer também "Conectar dividindo à direita" e "Conectar dividindo abaixo", que abrem a aba SSH como painel novo ao lado do painel ativo. Shift+Enter MUST NOT mudar o destino da conexão, pois na paleta e na sidebar ele já significa "Inserir".

#### Scenario: Conectar pela paleta
- **WHEN** o usuário abre a paleta, digita "homo" e escolhe "Conectar: Homolog API"
- **THEN** abre uma aba SSH para esse host

#### Scenario: Conectar dividindo
- **GIVEN** uma aba local aberta
- **WHEN** o usuário escolhe "Conectar dividindo à direita" no menu do host "Homolog API"
- **THEN** a aba atual ganha um painel à direita conectado a "Homolog API"

### Requirement: Importar do OpenSSH
O Gunslinger SHALL importar entradas do `~/.ssh/config` (`Host`, `HostName`, `User`, `Port`, `IdentityFile`, `ProxyJump`), mostrando a prévia antes de gravar. Padrões com curinga (`Host *`) SHALL virar valores do grupo de importação, não hosts. Chaves de `IdentityFile` SHALL entrar no keychain como referência ao arquivo. Diretivas não suportadas SHALL ser listadas como ignoradas.

#### Scenario: Importação com ProxyJump
- **GIVEN** o `~/.ssh/config` tem `Host bastion` e `Host app` com `ProxyJump bastion`
- **WHEN** o usuário importa e confirma a prévia
- **THEN** os hosts "bastion" e "app" são criados, e "app" usa "bastion" como host de salto

### Requirement: Exportação sem segredos
Hosts, grupos, identidades e metadados de chaves SHALL entrar na exportação e importação JSON existentes. Senhas, frases-senha e o conteúdo de chaves privadas MUST NOT ser exportados; ao importar, os itens que dependiam deles SHALL ficar marcados como "sem segredo".

#### Scenario: Exportar hosts
- **GIVEN** o host "Prod DB" usa uma identidade com senha salva
- **WHEN** o usuário exporta os hosts
- **THEN** o arquivo contém o host e a identidade, sem a senha
