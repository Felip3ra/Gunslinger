## Context

Motivação em `proposal.md`. `add-ssh-hosts` entrega o `SshConnectionPool` (um `Client` do `ssh2` por host, com contagem de uso e evento de queda) e o `hosts.json`. `add-docker-ports` já tem `PortService` com a lista de portas em escuta e o processo dono.

## Goals / Non-Goals

**Goals:**
- Túneis que vivem independentes das abas, com estado observável.
- Nenhuma porta exposta na rede sem decisão explícita.

**Non-Goals:**
- Encaminhamento de sockets Unix e de X11.
- Autenticação no proxy SOCKS, SOCKS4 e BIND/UDP ASSOCIATE.
- Religar automaticamente após queda ou ao abrir o app.

## Decisions

### 1. Regras guardadas junto dos hosts
`hosts.json` ganha `tunnels: TunnelRule[]` (`{ id, hostId, name, kind: 'local' | 'remote' | 'dynamic', bindAddress, bindPort, targetHost?, targetPort?, autoStart }`). Ficam no mesmo arquivo porque dependem do host e são exportadas com ele (excluir o host pergunta o que fazer com as regras). Validação pura em `src/shared/tunnels.ts`.

### 2. `TunnelService` com um uso do pool por regra ativa
Ligar uma regra faz `pool.acquire(hostId)`; desligar faz `release`. Assim a conexão fica aberta só enquanto houver aba, SFTP ou túnel. As regras com `autoStart` ouvem os eventos de sessão do `PtyManager` (aba SSH criada/encerrada para o host) e guardam a origem (`'manual' | 'auto'`), para que fechar a última aba desligue só as automáticas.

### 3. Local e dinâmico: servidor `net` no main
`net.createServer` em `bindAddress:bindPort`; cada socket aceito chama `client.forwardOut(srcAddr, srcPort, targetHost, targetPort)` e faz `pipe` nos dois sentidos, contando bytes. Para o dinâmico, o socket passa primeiro pelo `Socks5Handshake` (`src/shared/socks5.ts`, máquina de estados pura sobre `Uint8Array`: saudação, método "sem autenticação", pedido CONNECT com ATYP 1/3/4, respostas de sucesso e de erro), que devolve o destino; nomes de domínio são passados ao `forwardOut` sem resolver localmente. Alternativa: biblioteca `socksv5`. Descartada por estar sem manutenção e o protocolo necessário caber em ~150 linhas testáveis.

### 4. Remoto: `forwardIn` + evento `tcp connection`
`client.forwardIn(bindAddress, bindPort)` pede ao servidor a escuta; o evento `tcp connection` do `Client` é roteado pela porta para a regra, que aceita e conecta com `net.connect(targetPort, targetHost)`. Desligar chama `unforwardIn`. Se o servidor recusar (`GatewayPorts`/`AllowTcpForwarding`), o erro vai para a regra.

### 5. Erros e porta ocupada
`EADDRINUSE` no `listen` consulta `PortService.list()` para achar o PID e o nome do dono. Falha de `forwardOut` com "administratively prohibited" vira "O servidor recusou o encaminhamento"; "connect failed" vira "O destino recusou a conexão". Mensagens mapeadas numa função pura com testes.

### 6. Estado para o renderer
Evento `tunnels:changed` com o estado de todas as regras (estado, erro, conexões abertas, bytes), agrupado a cada 1 s enquanto houver tráfego. Canais `tunnels:save|delete|start|stop|list`. O renderer mostra o painel `TunnelsPanel.tsx`, o indicador na `StatusBar` e as ações de paleta em `actions.ts`.

### 7. Endereço de escuta não local
Salvar com `bindAddress` diferente de `127.0.0.1`/`::1`/`localhost` exige `confirmedExposure: true` no pedido, que o renderer só envia depois do diálogo de confirmação; o main recusa sem ele. O campo registra a intenção do usuário e evita exposição por engano (um formulário ou import que troque o endereço sem passar pela confirmação); não é barreira contra um renderer comprometido, que já poderia enviá-lo, e esse limite é o mesmo de qualquer outra ação do usuário no app. Para remoto, o aviso fala da rede do servidor.

### 8. Confirmação de saída
O `quit-flow` hoje pergunta com base em `pty.busyCount()`. Ele passa a receber também `tunnels.activeSummary()` (`{ tunnels, connections }`) e pergunta quando qualquer um dos dois for maior que zero, com uma mensagem que junta abas ocupadas e túneis. Confirmada a saída, `TunnelService.stopAll()` roda antes de o pool encerrar as conexões.

## Risks / Trade-offs

- [Firewall do Windows pergunta ao escutar em `0.0.0.0`] → Só acontece no caso exposto, que já tem confirmação; o aviso menciona o firewall.
- [Muitas conexões em um túnel dinâmico (navegador) pesam no canal SSH] → Cada conexão é um canal; o `ssh2` aplica janela por canal. Sem limite artificial; o painel mostra quantas há.
- [Queda da conexão derruba todos os túneis do host] → Estado "erro" com "Religar"; sem religar automático para não ficar repetindo 2FA.
