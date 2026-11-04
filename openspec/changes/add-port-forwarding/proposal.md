## Why

Acessar o banco de homologação, o painel do RabbitMQ ou uma API interna atrás de um bastion exige hoje um `ssh -L 5432:db:5432 bastion` lembrado de cabeça e um terminal parado só para manter o túnel. Com hosts e conexões SSH no app (`add-ssh-hosts`), os túneis podem ser salvos e ligados com um clique.

## What Changes

- **Regras de port forwarding** salvas por host: **local** (`-L`, porta local → destino visto pelo servidor), **remoto** (`-R`, porta no servidor → destino local) e **dinâmico** (`-D`, proxy SOCKS5 local).
- **Painel "Túneis"**: lista as regras com estado (parado, conectando, ativo, erro), ligar/desligar, conexões abertas e bytes trafegados.
- **Iniciar junto com o host** (opcional por regra): liga ao abrir uma aba SSH do host; e **túnel sem aba**, que abre só a conexão para o túnel.
- **Segurança**: escuta em `127.0.0.1` por padrão; escutar em todas as interfaces exige confirmação explícita.
- Erros claros: porta local em uso (com o processo dono, reaproveitando o gerenciador de portas), destino recusado, servidor proíbe encaminhamento.
- Túneis ativos aparecem na barra de status e na paleta ("Ligar túnel: <nome>").

## Capabilities

### New Capabilities
- `port-forwarding`: regras de túnel local, remoto e dinâmico, ciclo de vida, estado e segurança das portas de escuta.

### Modified Capabilities
_Nenhuma._

## Impact

- **Depende de** `add-ssh-hosts` (pool de conexões e hosts); reaproveita `PortService` de `add-docker-ports` para identificar quem usa uma porta.
- **Shared**: schema das regras, validação (porta, endereço, conflito entre regras), leitor do protocolo SOCKS5 (puro, com testes).
- **Main**: `src/main/tunnels/` (`TunnelService` com servidores `net` locais, `forwardOut`, `forwardIn` e SOCKS5); regras em `hosts.json`; canais `tunnels:*`.
- **Renderer**: fatia `tunnels`, painel "Túneis", indicador na barra de status, regras no formulário do host.
