## Why

Três limitações conhecidas atrapalham o uso diário: processos iniciados com `start` (ou que se desligam do terminal) continuam rodando depois que a aba fecha; com o `fnm` por sessão, a barra de status mostra a versão do Node do ambiente do app e não a da aba; e instalar uma ferramenta ou mudar o PATH exige "Recarregar ambiente" na mão.

## What Changes

- Cada aba ganha um grupo de processos (Job Object do Windows): tudo o que o shell inicia entra no grupo, mesmo saindo da árvore. Ao fechar a aba (ou o app), o que sobrou fora da árvore segue `terminal.detachedProcesses`: **Perguntar** (padrão, lista os processos com Encerrar/Manter), **Encerrar sempre** ou **Manter rodando**.
- Os scripts de integração do PowerShell e do Bash informam a versão do Node do `fnm` da sessão (`OSC 633;P;NodeVersion=`), e a barra de status da aba passa a mostrá-la.
- O app escuta o aviso do Windows de mudança de configuração (`WM_SETTINGCHANGE`) e recarrega o ambiente sozinho quando as variáveis mudaram de fato; as abas abertas mostram "ambiente desatualizado".

## Capabilities

### New Capabilities
- `process-lifecycle`: processos fora da árvore das abas, versão do Node por sessão e recarga automática do ambiente.

### Modified Capabilities
_Nenhuma._

## Impact

Platform: `ProcessTracker` (`createProcessTracker`), com `JobTracker` e um auxiliar em PowerShell no Windows. Main: `PtyManager.kill` devolve os processos fora da árvore; `pty:killDetached`; o fluxo de saída pergunta uma vez por todas as abas; `EnvironmentService.reloadIfChanged`. Renderer: diálogo ao fechar a aba, `nodeVersion` por aba. Scripts de integração.
