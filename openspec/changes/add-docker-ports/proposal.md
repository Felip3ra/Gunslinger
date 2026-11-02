## Why

"A porta 5000 já está em uso" e "o container do banco caiu?" são interrupções frequentes. Hoje o usuário precisa de `netstat`, `tasklist`, `taskkill` e `docker ps` em sequência.

## What Changes

- **Gerenciador de portas**: lista as portas TCP em escuta com o processo dono (PID e nome), indica as que pertencem a processos iniciados por abas do Gunslinger, filtra por número/nome e encerra o processo (com confirmação).
- **Painel do Docker**: lista os containers (nome, imagem, estado, portas), com iniciar, parar, reiniciar, remover (com confirmação), **ver logs** (`docker logs -f` numa aba nova) e **abrir shell** (`docker exec -it ... sh` numa aba nova).
- Se o Docker não estiver instalado ou o daemon não estiver rodando, o painel explica o motivo.
- Painel único "Docker e portas", com atualização automática enquanto aberto.

## Capabilities

### New Capabilities
- `docker-ports`: gerenciador de portas e painel de containers Docker.

### Modified Capabilities
_Nenhuma._

## Impact

Shared: leitura das saídas de `netstat`, `tasklist` e `docker ps` (pura). Main: `PortService` e `DockerService` usando `runTool`; canais `ports:*` e `docker:*`. Renderer: painel e ação na paleta.
