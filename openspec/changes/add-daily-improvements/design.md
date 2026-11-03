## Context

O renderer já sabe capturar as abas como layout de workspace (`captureOpenTabs`) e abrir um workspace. A integração com o shell já entrega o texto de cada comando ao terminar (`onCommandEnd`). O CSP do renderer só aceita imagens locais via `data:`.

## Goals / Non-Goals

**Goals:** voltar ao ponto em que o usuário parou; achar comandos antigos; suportar bun.
**Non-Goals:** restaurar o conteúdo dos terminais ou processos em execução; histórico sincronizado entre máquinas.

## Decisions

- **Sessão = workspace sem comandos**: reaproveita `captureOpenTabs`/`openWorkspace`; nenhum comando roda ao reabrir.
- **Fechamento**: ao fechar o app as abas são encerradas uma a uma e o renderer mandaria listas cada vez menores. `LastSession.freeze()` (chamado pelo fluxo de saída) ignora as gravações a partir daí. Lista vazia nunca é gravada.
- **Histórico no `state.json`**: puro em `shared/command-history.ts` (`recordCommand`); o renderer agrupa gravações (1 s). As gravações do `state.json` passam a ser enfileiradas, porque duas ao mesmo tempo disputavam o mesmo `.tmp`.
- **Enter escreve, Ctrl+Enter executa**: a pasta atual pode ser outra; escrever sem executar é o padrão seguro.
- **Ícones**: o main lê o arquivo (limite de 256 KB) e entrega `iconData`; o renderer nunca lê arquivos.
- **bun**: `bun.lock` e `bun.lockb` contam como um gerenciador só (convivem durante a migração do formato).

## Risks / Trade-offs

- O histórico pode guardar segredos digitados na linha de comando: dá para desligar, limpar, ou começar o comando com espaço.
