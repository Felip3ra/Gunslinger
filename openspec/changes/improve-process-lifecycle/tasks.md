## 1. Processos fora da árvore

- [x] 1.1 `ProcessTracker` na porta da plataforma; `JobTracker` (protocolo, tempo limite, reinício do auxiliar) com testes; auxiliar em PowerShell
- [x] 1.2 `PtyManager`: rastrear ao criar, `kill`/`killAll` devolvem os processos fora da árvore conforme `terminal.detachedProcesses`, `killDetached`; testes
- [x] 1.3 Renderer: diálogo ao fechar a aba; fluxo de saída do app; opção nas configurações

## 2. Node por sessão (fnm)

- [x] 2.1 Scripts de integração emitem `OSC 633;P;NodeVersion=`; rastreador e barra de status, com testes

## 3. Ambiente

- [x] 3.1 `EnvironmentService.reloadIfChanged` com testes; `WM_SETTINGCHANGE` com debounce

## 4. Verificação

- [x] 4.1 e2e: processo órfão listado e encerrado ao fechar a aba; versão do Node informada pelo shell; `setx` marca a aba como desatualizada
