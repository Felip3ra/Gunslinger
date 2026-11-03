# Gunslinger

Terminal desktop para Windows (Electron + TypeScript + React + xterm.js + node-pty), com foco em .NET e Node.js. Planejamento em `openspec/` (change ativa: `openspec/changes/add-gunslinger-mvp`).

## Comandos

- `npm run dev`: app em modo dev (HMR no renderer)
- `npm run build`: build de main, preload e renderer em `out/`
- `npm test`: testes unitários (Vitest, `src/**/*.test.ts`)
- `npm run test:e2e`: build + Playwright (`tests/e2e`), um worker
- `npm run lint` / `npm run typecheck`
- `npm run dist`: instalador NSIS em `dist/`

O VS Code define `ELECTRON_RUN_AS_NODE=1` no terminal integrado. Para rodar o app ou os testes e2e fora do helper `tests/e2e/helpers.ts`, remova essa variável.

## Estrutura (camadas)

Regra de dependência: de fora para dentro. `shared` não depende de nada; serviços não importam `electron` (lint).

- `src/shared`: **domínio**. Schemas zod (`model/*.ts`, reexportados por `model.ts`), contrato de IPC e regras puras (variáveis, comandos de EF/Node, `cd` por shell, importação, busca). Sem Electron nem Node.
- `src/main`: processo principal. Único dono de PTY, sistema de arquivos, ambiente e configuração.
  - `services/` e módulos de recurso (`pty/`, `env/`, `shells/`, `config/`, `projects/`, `status/`, `transfer/`, `tools/`, `editor/`, `elevation/`, `tests/`, `history/`, `plugins/`, `update/`, `session/`): **aplicação**. Dependem de `ports.ts`, nunca do Electron.
  - `ports.ts`: interfaces de diálogo, notificação, área de transferência, desktop e janela. `adapters/`: implementações Electron.
  - `platform/`: `PlatformAdapter` (`win32.ts`, `posix.ts`). Só aqui é permitido testar `process.platform` (lint). `job-tracker.ts` + `win32-job-helper.ts`: grupo de processos por aba (Job Object via auxiliar em PowerShell).
  - `ipc/handlers/*.ts`: **entrada**, um arquivo por recurso; validam (zod, em `ipc/registry.ts`) e delegam a serviços, sem regra de negócio.
  - `composition.ts`: raiz de composição (instancia serviços e registra handlers). `index.ts`: ciclo de vida do app. `quit-flow.ts`: saída.
- `src/preload`: expõe `window.gunslinger` via `contextBridge`, com lista branca de canais. Roda em sandbox.
- `src/renderer`: React.
  - `store.ts` compõe fatias (`store/*-slice.ts`); um recurso novo ganha a sua fatia.
  - `terminal/`: `TerminalRegistry` (instâncias do xterm fora do React), `shell-integration.ts` (rastreador puro das marcas OSC), `keyboard.ts`, `file-links.ts`.
  - `run-plan.ts` (decisões puras) + `run-command.ts` (orquestra diálogos e envio).
  - `components/`: uma tela por arquivo (`settings/*` para as seções das configurações).
- `resources/shell-integration`: scripts injetados nos shells.

### Adicionar um recurso

1. Regras puras e schemas em `src/shared` (com teste).
2. Serviço em `src/main/<recurso>/` dependendo de portas (com teste).
3. Canais em `ipc-contract.ts` + `ipc-channels.ts` + `ipc-schemas.ts`; handlers em `ipc/handlers/<recurso>.ts`; uma linha em `composition.ts`.
4. No renderer: fatia do store, componentes e ações (`actions.ts` entra na paleta e nos atalhos).

## Regras

- Toda operação privilegiada passa por um canal declarado em `src/shared/ipc-contract.ts` e validado no main. O renderer nunca envia executáveis ou ambiente para rodar.
- Nenhum comando salvo é enviado a um terminal sem ação explícita do usuário.
- Ferramentas externas (`git`, `node`, `dotnet`) rodam com o ambiente do `EnvironmentService`, nunca com `process.env` direto, e sempre com timeout.
- Gravação de configuração é atômica (tmp + rename + `.bak`). Arquivo inválido nunca é sobrescrito.
- Idioma: identificadores e código em inglês; textos da UI, mensagens ao usuário e comentários em português.
- Lógica pura vai para `src/shared` ou módulos do main com dependências injetadas, com teste Vitest ao lado (`*.test.ts`).
