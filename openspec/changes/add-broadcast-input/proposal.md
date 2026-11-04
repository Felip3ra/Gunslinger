## Why

Atualizar três servidores de homologação, rodar o mesmo `git pull` em quatro repositórios ou conferir `df -h` em todas as VMs de um cliente vira repetir o mesmo comando aba por aba. O Termius resolve isso digitando em vários terminais ao mesmo tempo e rodando snippets em vários hosts; o Gunslinger já tem split panes e comandos salvos, falta ligar uma coisa à outra.

## What Changes

- **Broadcast de entrada**: numa aba com painéis divididos, ligar "Transmitir para todos os painéis" faz cada tecla, colagem e atalho de controle digitado num painel chegar a todos os painéis participantes (locais e SSH).
- **Participantes**: por padrão, todos os painéis da aba; cada painel pode sair e voltar do broadcast. Indicação visual forte (borda e selo "Transmitindo") em todos os participantes.
- **Colagem com confirmação**: colar texto com várias linhas durante o broadcast pede confirmação mostrando em quantos painéis vai chegar.
- **Executar comando salvo em vários alvos**: "Executar em…" escolhe abas/painéis abertos e/ou hosts (abrindo abas SSH para os que não estão abertos), mostra a prévia com as variáveis resolvidas por alvo e só envia com confirmação.
- Atalho e ação de paleta para ligar/desligar; o broadcast nunca é restaurado ao reabrir o app ou um workspace.

## Capabilities

### New Capabilities
- `broadcast-input`: transmissão da entrada entre painéis e execução de comandos salvos em vários alvos.

### Modified Capabilities
_Nenhuma: os comandos salvos ganham um destino múltiplo descrito nesta capability, sem mudar o comportamento existente de "Executar" e "Inserir"._

## Impact

- **Renderer**: estado do broadcast por grupo na `layout-slice` (participantes), roteamento da entrada no `onInput` de `tabs.ts`, indicação visual no `TerminalArea`, diálogo "Executar em…" em `run-command.ts`/`run-plan.ts`, atalho novo em `defaultKeybindings` e ações em `actions.ts`.
- **Shared**: regra pura de quem recebe a entrada e plano de execução em vários alvos (variáveis por alvo), com testes.
- **Main**: nenhum canal novo; o envio continua por `pty:write`, que já é validado por sessão.
- Aproveita `add-ssh-hosts` para alvos SSH quando presente; sem ele, os alvos são só painéis locais.
