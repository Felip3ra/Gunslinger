## 1. Regras puras

- [ ] 1.1 `broadcastTargets` em `src/shared/broadcast.ts` (participantes vivos, painel focado excluído, aba de um painel), com testes
- [ ] 1.2 `planMultiTarget` em `run-plan.ts` (variáveis de projeto por alvo, variáveis informadas uma vez, prévia por alvo, shell/pasta do comando só para painéis novos, aviso de shell diferente), com testes

## 2. Broadcast entre painéis

- [ ] 2.1 `broadcast: { on, excluded }` no `TabGroup` da `layout-slice`, fora de `WorkspaceLayout` e de `session:save`; teste de que o layout salvo não contém o campo
- [ ] 2.2 Marcação `user`/`report` da entrada no `TerminalRegistry` (`keydown`, `paste`, `compositionend`) e roteamento no `onInput` de `tabs.ts`; testes de que tecla morta/IME é transmitida e respostas automáticas não são
- [ ] 2.3 Ação `pane.broadcastToggle` (`Ctrl+Shift+I`) em `defaultKeybindings` e `actions.ts`, menu da aba e do painel (sair/voltar), desabilitada com um painel só; verificar o atalho no app empacotado
- [ ] 2.4 Borda e selo "Transmitindo"/"Fora da transmissão" nos painéis e ícone na barra de abas
- [ ] 2.5 Confirmação de colagem de várias linhas com "Colar em N painéis" e "Colar só neste painel"

## 3. Executar em vários alvos

- [ ] 3.1 Diálogo "Executar em…" com painéis por aba e, havendo a fatia `hosts`, hosts sem aba; prévia por alvo e "Executar em N alvos"
- [ ] 3.2 Abrir aba dividida para hosts sem painel, enviar a cada alvo quando pronto (timeout 30 s) e listar as falhas no fim

## 4. Verificação

- [ ] 4.1 e2e com três painéis locais: broadcast ligado envia `echo` aos três, painel retirado não recebe, `á` por tecla morta chega a todos, Ctrl+C interrompe em todos, colagem de várias linhas pede confirmação, reabrir o app deixa o broadcast desligado, "Executar em…" em duas abas
