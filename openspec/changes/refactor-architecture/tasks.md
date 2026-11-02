## 1. Main em camadas

- [x] 1.1 Criar `main/ports.ts` (DialogPort, NotifierPort, ClipboardPort, DesktopPort) e `main/adapters/electron.ts`
- [x] 1.2 Extrair `ProjectCatalog`, `LongCommandNotifier` e `EditorService` para `main/services/` com testes unitários
- [x] 1.3 `TransferService` recebe `DialogPort` (sem importar `electron`) e ganha teste unitário
- [x] 1.4 Dividir os handlers de IPC em `main/ipc/handlers/*.ts` e criar `main/composition.ts`; `app.ts` deixa de existir
- [x] 1.5 Regra de lint: `electron` só em `main/adapters`, `main/index.ts`, `main/window.ts` e `main/composition.ts`

## 2. Status

- [x] 2.1 Extrair `GitStatusProvider` e `ToolVersionProvider`; `StatusService` só coordena

## 3. Shared

- [x] 3.1 Dividir `shared/model.ts` em `shared/model/*.ts` por domínio, mantendo `shared/model.ts` como reexportação

## 4. Renderer

- [x] 4.1 Extrair `ShellIntegrationTracker` (puro) com testes unitários e usar no `TerminalRegistry`
- [x] 4.2 Extrair o teclado/área de transferência do terminal para `terminal/keyboard.ts`
- [x] 4.3 Extrair `planTarget`/`planCwd` puros para `run-plan.ts` com testes; `run-command.ts` só orquestra
- [x] 4.4 Dividir o store em fatias e `SettingsDialog` em uma tela por arquivo

## 5. Verificação

- [x] 5.1 Lint, typecheck, unitários e a suíte e2e completa passando sem alterar testes e2e
- [x] 5.2 Atualizar `CLAUDE.md` com as camadas e a regra de dependência
