## Context

Ver `proposal.md`. A arquitetura atual já separa main, preload, renderer e shared e tem um `PlatformAdapter`. O problema é a granularidade dentro do main e do renderer, e o acoplamento de serviços ao Electron.

## Goals / Non-Goals

**Goals:** módulos com uma responsabilidade; regras de negócio testáveis sem Electron; adicionar um recurso novo = criar arquivos novos (serviço + handlers), sem editar um arquivo central além de uma linha de registro.

**Non-Goals:** mudar comportamento, contrato de IPC, formato de arquivos ou dependências; reescrever o que já está coeso (`ConfigStore`, `PtyManager`, analisadores, lógica pura em `shared`).

## Decisions

### 1. Camadas (Clean Architecture adaptada)

```
shared/            domínio puro (schemas, regras, cálculos)      ← não depende de nada
main/services/*    aplicação (casos de uso; dependem de portas)  ← dependem de shared e de ports.ts
main/ports.ts      interfaces dos recursos externos (diálogo, notificação, área de transferência, desktop)
main/adapters/     implementações Electron das portas
main/platform/     PlatformAdapter (SO), já existente
main/ipc/handlers/ entrada: valida e delega para serviços (um arquivo por recurso)
main/composition.ts raiz de composição: instancia tudo e registra os handlers
```

Regra de dependência: de fora para dentro. Serviços não importam `electron`; o lint impõe isso (`no-restricted-imports`).

*Alternativa*: um container de injeção de dependência (tsyringe, inversify). Descartada: a raiz de composição manual é pequena, explícita e sem decorators.

### 2. Handlers por recurso

Cada arquivo em `ipc/handlers/` exporta `register(ipc: IpcRegistry, deps: Deps)`, recebendo só o que usa (ISP). A composição chama todos numa lista. Regras hoje embutidas viram serviços:

- `projects:save`/`projects:delete` → `ProjectCatalog` (validação da pasta e integridade dos comandos vinculados).
- `notify:longCommand` → `LongCommandNotifier` (regra de foco/limite + `NotifierPort`).
- `editor:open`/`settings:openFile` → `EditorService` (editor configurado + `DesktopPort.openPath`).
- `TransferService` passa a receber `DialogPort`.

### 3. Renderer

- `terminal/shell-integration.ts`: classe `ShellIntegrationTracker` (pura, sem xterm) que recebe eventos (`osc9`, `osc133`, `enter`, `inputLine`) e emite `cwd`, `commandStart`, `commandEnd`, `promptReady`. Testada com Vitest.
- `terminal/keyboard.ts`: tratamento de Ctrl+C/Ctrl+V/Ctrl+Shift+C.
- `run-plan.ts`: `planTarget()` e `planCwd()` puros (decidem aba/perfil/pasta/troca de pasta); `run-command.ts` só orquestra diálogos e envio.
- Store em fatias (`store/*.ts`) combinadas num único `useStore` (sem mudar a API usada pelos componentes).
- `SettingsDialog` → `settings/*.tsx` por seção.

### 4. Status

`GitStatusProvider` (consulta, fila e recuo para só a branch) e `ToolVersionProvider` (relevância + cache) extraídos; `StatusService` coordena eventos e observação.

## Risks / Trade-offs

- [Refatoração ampla pode introduzir regressões] → passos pequenos, rodando unitários + typecheck a cada passo e a suíte e2e completa no fim; nenhum teste e2e é alterado.
- [Mais arquivos] → aceitável: cada arquivo tem uma razão para mudar.
