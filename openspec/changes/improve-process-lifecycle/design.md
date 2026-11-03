## Context

`PtyManager.kill` captura os descendentes antes de encerrar o shell, mas um processo cujo pai já terminou (o `cmd /c start` sai na hora) não aparece mais em `listDescendants`. O Windows oferece Job Objects: um processo atribuído a um job leva junto todos os filhos criados depois, inclusive os órfãos.

## Goals / Non-Goals

**Goals:** encerrar ou manter, por escolha do usuário, o que a aba deixou rodando; versão do Node correta por aba com fnm; ambiente atualizado sem ação manual.
**Non-Goals:** serviços do Windows (não são filhos do shell), processos elevados a partir de aba comum, versão do Node no CMD (sem hook de prompt).

## Decisions

- **Auxiliar em PowerShell**: o C# do Job Object é compilado pelo `Add-Type` do Windows PowerShell 5.1 (presente em todo Windows), num único processo iniciado sob demanda que fala um protocolo de linhas (`track`/`release`). Evita módulo nativo e toolchain. Termina sozinho quando o stdin fecha (app encerrado).
- **Sem KILL_ON_JOB_CLOSE**: matar tudo ao fechar o handle encerraria apps abertos de propósito pelo terminal (`code .`). O job só rastreia; a decisão é da configuração (padrão: perguntar).
- **Quem libera o job**: o kill feito pelo Gunslinger marca a sessão; a saída do shell provocada por ele não libera o job (senão a lista se perderia). Na saída pelo próprio shell (`exit`), o job é liberado e os processos continuam.
- **Reiniciar a aba** não pergunta: o que saiu da árvore continua rodando.
- **Fechamento do app**: uma pergunta só, com os processos de todas as abas.
- **fnm**: `FNM_MULTISHELL_PATH` é um link para a pasta da versão; o script lê o alvo (`Get-Item .Target` / `readlink`) e só emite a sequência quando a versão muda. O renderer prefere a versão da aba à do ambiente do app.
- **WM_SETTINGCHANGE**: chega também por tema, idioma etc.; o ambiente é relido do registro (debounce de 1 s) e só vira geração nova se alguma variável mudou.

## Risks / Trade-offs

- A primeira aba paga a compilação do auxiliar (1 a 2 s, em segundo plano); processos criados nesse intervalo podem ficar fora do job.
- Abas elevadas: o auxiliar não consegue abrir o processo elevado; ficam sem rastreamento.
