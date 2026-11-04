## 1. Domínio (shared)

- [ ] 1.1 Schema `TunnelRule` em `src/shared/model/hosts.ts` e validação (portas, endereço, escuta repetida, exposição sem confirmação) em `src/shared/tunnels.ts`, com testes
- [ ] 1.2 `Socks5Handshake` em `src/shared/socks5.ts` (saudação, sem autenticação, CONNECT IPv4/IPv6/domínio, recusas), com testes byte a byte
- [ ] 1.3 Tradução dos erros (`EADDRINUSE`, administratively prohibited, connect failed, queda) para mensagens em português, com testes

## 2. Main

- [ ] 2.1 `TunnelService` local e dinâmico (`net.createServer` + `forwardOut`, contagem de conexões e bytes, desligar fechando tudo), com testes usando cliente SSH falso
- [ ] 2.2 Túnel remoto (`forwardIn`/`unforwardIn`, roteamento de `tcp connection`), com testes
- [ ] 2.3 Uso do pool por regra ativa, `autoStart` ligado aos eventos de sessão SSH com origem manual/auto, queda do host levando as regras a "erro"; testes
- [ ] 2.4 `quit-flow` pergunta com túneis ativos (quantidade e conexões, junto das abas ocupadas) e chama `stopAll()` antes de encerrar o pool; testes do `quit-flow`
- [ ] 2.5 Porta ocupada com dono via `PortService`; exclusão de host pergunta o destino das regras; testes
- [ ] 2.6 Canais `tunnels:*` e evento `tunnels:changed` (contrato, schemas com `confirmedExposure`, handler, `composition.ts`); verificar com `npm run typecheck` e `npm run lint`

## 3. Renderer

- [ ] 3.1 Fatia `tunnels-slice.ts` e `TunnelsPanel` (lista por host, estado, conexões, bytes, ligar/desligar/religar, aviso "visível na rede")
- [ ] 3.2 Formulário de regra (no painel e no `HostDialog`) com confirmação para endereço não local
- [ ] 3.3 Indicador na `StatusBar` e ações "Ligar túnel"/"Desligar túnel" na paleta

## 4. Verificação

- [ ] 4.1 e2e contra o servidor SSH de teste: túnel local até um servidor HTTP do próprio teste, SOCKS5 com um cliente de teste, porta ocupada com o dono, `autoStart` ligando e desligando com a aba, confirmação ao sair com túnel ativo
