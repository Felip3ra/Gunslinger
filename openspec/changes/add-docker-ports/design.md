## Decisions

- **Portas** (Windows): `netstat -ano -p TCP` (e `-p TCPv6`) filtrando `LISTENING`, mais `tasklist /FO CSV /NH` para os nomes. Leitura pura em `shared/ports.ts`. A coleta fica no `PlatformAdapter` (`listListeningPorts`), com versão vazia no posix.
- **Dono = aba**: o main cruza o PID com os descendentes dos shells das sessões abertas (`listDescendants`).
- **Docker**: `docker ps -a --format "{{json .}}"` (uma linha JSON por container), lido em `shared/docker.ts`; ações via `docker start|stop|restart|rm` com timeout de 30 s. Erros com "pipe"/"daemon"/"connect" viram "daemon não está rodando".
- **Logs e shell**: abrem abas novas pelo mesmo caminho dos comandos (ação explícita do usuário no botão).
- **Atualização**: o painel consulta a cada 5 s enquanto aberto.

## Risks / Trade-offs

- [`netstat` lento em máquinas com muitas conexões] → só TCP e só `LISTENING`; timeout de 10 s.
- [Processos de outros usuários ou elevados] → o encerramento falha com a mensagem do `taskkill`.
