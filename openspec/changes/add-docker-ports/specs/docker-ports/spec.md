## Purpose

Mostra quem está usando cada porta e o estado dos containers Docker, com as ações mais comuns, sem sair do terminal.

## ADDED Requirements

### Requirement: Portas em escuta
O Gunslinger SHALL listar as portas TCP em escuta com endereço, porta, PID e nome do processo, marcando as que pertencem a processos de abas do Gunslinger, com filtro por porta ou nome. "Encerrar processo" SHALL pedir confirmação e encerrar a árvore do processo; se o processo for protegido ou elevado, o erro SHALL ser mostrado.

#### Scenario: Liberar uma porta
- **GIVEN** um servidor Node de uma aba escuta na porta 5173
- **WHEN** o usuário filtra por "5173", vê o processo marcado com a aba e escolhe "Encerrar processo" e confirma
- **THEN** o processo é encerrado e a porta some da lista

### Requirement: Containers Docker
O Gunslinger SHALL listar os containers (`docker ps -a`) com nome, imagem, estado e portas, e SHALL oferecer iniciar, parar, reiniciar e remover (com confirmação). "Ver logs" e "Abrir shell" SHALL abrir uma aba nova com `docker logs -f <nome>` e `docker exec -it <nome> sh`, respectivamente.

#### Scenario: Parar um container
- **GIVEN** o container `loja-db` está rodando
- **WHEN** o usuário clica em "Parar"
- **THEN** o app executa `docker stop loja-db` e a lista mostra o container parado

### Requirement: Docker indisponível
Se o Docker não estiver instalado ou o daemon não responder, o painel SHALL mostrar o motivo ("Docker não encontrado" ou "o daemon do Docker não está rodando") sem afetar o gerenciador de portas.

#### Scenario: Daemon parado
- **GIVEN** o Docker Desktop está fechado
- **WHEN** o usuário abre a aba Docker do painel
- **THEN** aparece "O daemon do Docker não está rodando" e a aba de portas continua funcionando
