## Why

O MVP funciona e tem boa cobertura de testes (127 unitários, 50 e2e). Mas alguns módulos concentram responsabilidades, e a próxima leva de recursos (split panes, workspaces, perfis de ambiente, Docker, testes, plugins etc.) faria esses módulos crescerem ainda mais:

- `src/main/app.ts` é raiz de composição e também registra ~40 handlers de IPC com regra de negócio embutida (SRP e OCP: todo recurso novo edita o mesmo arquivo).
- Serviços de aplicação importam o Electron diretamente (`TransferService` usa `dialog`), o que fere o DIP e impede testar sem Electron.
- `terminal-registry.ts` junta ciclo de vida do xterm, teclado e área de transferência, integração OSC e rastreio de comandos.
- `run-command.ts` mistura a decisão (alvo, pasta, ocupado) com os efeitos (diálogos, envio ao terminal).
- `status-service.ts` junta Git, versões de ferramentas e observação de arquivos.
- `shared/model.ts` concentra os schemas de todos os domínios, e `SettingsDialog.tsx` reúne quatro telas.

## What Changes

Refatoração **sem mudança de comportamento**, protegida pela suíte atual de testes (unitários e e2e):

- **Main em camadas**: raiz de composição enxuta; um módulo de handlers de IPC por recurso (`ipc/handlers/*.ts`); regras de negócio movidas dos handlers para serviços; portas (`DialogPort`, `NotifierPort`, `ClipboardPort`, `DesktopPort`) com adaptadores Electron, para os serviços não dependerem do framework.
- **Renderer**: rastreio da integração com o shell extraído para uma classe pura e testada; teclado e área de transferência em módulo próprio; planejamento da execução de comandos separado dos efeitos (função pura testada); store dividido em fatias; `SettingsDialog` dividido por seção.
- **Shared**: `model.ts` dividido por domínio (`model/*.ts`), mantendo `model.ts` como ponto único de importação.
- **Status**: Git e versões em provedores separados.
- Atualização do `CLAUDE.md` com as regras de camadas e um teste de arquitetura (lint) que proíbe importar `electron` fora de `src/main/adapters`, `src/main/index.ts` e `src/main/window.ts`.

## Capabilities

### New Capabilities
_Nenhuma._

### Modified Capabilities
_Nenhuma: não há mudança de comportamento (`skip_specs: true`)._

## Impact

Só código interno de `src/`. Contrato de IPC, formato dos arquivos de configuração e comportamento ficam iguais; a suíte existente deve passar sem alterações nos testes e2e.
