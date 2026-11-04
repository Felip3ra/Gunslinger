## Purpose

Salva e gerencia túneis SSH (local, remoto e SOCKS dinâmico) por host, para que serviços atrás de um servidor fiquem acessíveis com um clique e sem um terminal parado só para manter o túnel.

## ADDED Requirements

### Requirement: Regras de túnel
O usuário SHALL poder criar, editar, duplicar e excluir regras ligadas a um host, com nome e tipo: local (endereço e porta locais de escuta, host e porta de destino vistos pelo servidor), remoto (endereço e porta de escuta no servidor, host e porta de destino locais) ou dinâmico (endereço e porta locais do proxy SOCKS5). Portas SHALL estar em 1–65535, e duas regras com o mesmo endereço e porta de escuta local SHALL ser recusadas.

#### Scenario: Túnel para o banco de homologação
- **WHEN** o usuário cria no host "bastion" a regra local "Postgres homolog" de `127.0.0.1:5432` para `db.interno:5432`
- **THEN** a regra aparece no painel "Túneis" como "Parado"

#### Scenario: Porta repetida
- **GIVEN** a regra "Postgres homolog" escuta em `127.0.0.1:5432`
- **WHEN** o usuário cria outra regra local em `127.0.0.1:5432`
- **THEN** o formulário mostra "Já existe uma regra escutando em 127.0.0.1:5432" e não salva

### Requirement: Ligar e desligar
Ligar uma regra SHALL usar a conexão do host (abrindo-a, com o fluxo de autenticação, se não houver), e desligar SHALL fechar a escuta e as conexões abertas pelo túnel. A conexão com o host SHALL continuar enquanto houver túnel ativo, mesmo sem aba aberta, e SHALL fechar quando o último uso acabar.

#### Scenario: Túnel sem aba aberta
- **GIVEN** nenhuma aba SSH aberta para "bastion"
- **WHEN** o usuário liga "Postgres homolog" e depois conecta o DBeaver em `localhost:5432`
- **THEN** a consulta chega a `db.interno:5432` e o painel mostra a regra "Ativo" com 1 conexão

### Requirement: Iniciar com o host
Cada regra SHALL ter a opção "Ligar ao abrir uma aba deste host", desligada por padrão. Com ela, abrir uma aba SSH do host SHALL ligar a regra; fechar a última aba SHALL desligar só as regras ligadas desta forma.

#### Scenario: Túnel automático
- **GIVEN** a regra "RabbitMQ UI" tem "Ligar ao abrir uma aba deste host" marcada
- **WHEN** o usuário abre uma aba SSH do host e depois a fecha
- **THEN** a regra fica "Ativo" enquanto a aba existe e volta a "Parado" ao fechá-la

### Requirement: Proxy SOCKS dinâmico
Uma regra dinâmica SHALL aceitar clientes SOCKS5 sem autenticação com o comando CONNECT para IPv4, IPv6 e nome de domínio (resolvido pelo servidor SSH). Outros comandos e versões SHALL ser recusados com a resposta SOCKS correspondente.

#### Scenario: Navegador pelo proxy
- **GIVEN** a regra dinâmica em `127.0.0.1:1080` está ativa
- **WHEN** um navegador configurado com SOCKS5 `127.0.0.1:1080` abre `http://intranet.local`
- **THEN** a página carrega pela rede do servidor SSH

### Requirement: Escuta segura
Regras locais e dinâmicas SHALL escutar em `127.0.0.1` por padrão. Escolher outro endereço (como `0.0.0.0`) SHALL exigir confirmação avisando que outras máquinas da rede poderão usar o túnel, e o painel SHALL marcar essas regras com um aviso.

#### Scenario: Expor na rede
- **WHEN** o usuário troca o endereço de escuta de uma regra para `0.0.0.0` e salva
- **THEN** o app pede confirmação e, aceita, a regra aparece no painel com o aviso "visível na rede"

### Requirement: Estado e erros
O painel SHALL mostrar o estado de cada regra (parado, conectando, ativo, erro), as conexões abertas e os bytes trafegados. Erros SHALL dizer o motivo em português: porta local em uso (com nome e PID do processo dono, quando conhecido), destino recusou a conexão, servidor proibiu o encaminhamento, conexão com o host caiu. Se a conexão com o host cair, as regras ativas SHALL ir para "erro" com "Religar".

#### Scenario: Porta local ocupada
- **GIVEN** um Postgres local já escuta na porta 5432
- **WHEN** o usuário liga "Postgres homolog"
- **THEN** a regra fica com o erro "A porta 5432 já está em uso por postgres.exe (PID 4120)"

#### Scenario: Servidor proíbe encaminhamento
- **GIVEN** o servidor tem `AllowTcpForwarding no`
- **WHEN** o usuário liga uma regra local e um cliente se conecta à porta
- **THEN** a regra mostra "O servidor recusou o encaminhamento" e o cliente recebe a conexão fechada

### Requirement: Acesso rápido
Túneis ativos SHALL aparecer na barra de status (quantidade, com clique abrindo o painel). Cada regra SHALL aparecer na paleta como "Ligar túnel: <nome>" ou "Desligar túnel: <nome>". Túneis MUST NOT ser religados sozinhos ao reabrir o app.

#### Scenario: Ligar pela paleta
- **WHEN** o usuário abre a paleta e escolhe "Ligar túnel: Postgres homolog"
- **THEN** a regra liga e a barra de status mostra "1 túnel"

### Requirement: Sair do app com túneis ativos
Fechar o app com túneis ativos SHALL incluí-los na confirmação de saída já existente (junto das abas ocupadas), com a quantidade de túneis e de conexões abertas por eles. Confirmada a saída, todos os túneis SHALL ser desligados.

#### Scenario: Fechar com o banco conectado
- **GIVEN** "Postgres homolog" está ativo com 2 conexões abertas e nenhuma aba ocupada
- **WHEN** o usuário fecha o app
- **THEN** o app pergunta "1 túnel ativo (2 conexões) será desligado. Sair mesmo assim?" e só fecha com a confirmação
