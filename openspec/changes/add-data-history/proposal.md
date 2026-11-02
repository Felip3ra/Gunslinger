## Why

O pedido de "sincronização na nuvem" foi decidido como histórico interno: o usuário quer não perder comandos, projetos, workspaces e configurações ao editar algo errado (pela UI ou à mão), sem depender de serviço externo. Hoje só existe o `.bak` da última gravação.

## What Changes

- A cada mudança válida em `settings.json`, `commands.json`, `projects.json` ou `workspaces.json` (pela UI ou edição externa), o Gunslinger grava um snapshot versionado em `<dados>/history/`, sem repetir estados iguais.
- O usuário pode criar um **ponto de restauração** com nome.
- A seção **Histórico** das configurações lista os snapshots (data, origem, contagem de comandos, projetos e workspaces), com **Restaurar** (confirmação) e **Excluir**.
- Restaurar grava antes um snapshot do estado atual ("Antes de restaurar"), então dá para desfazer.
- Retenção: os 50 snapshots automáticos mais recentes; pontos com nome não são apagados automaticamente.

## Capabilities

### New Capabilities
- `data-history`: snapshots versionados dos dados do usuário e restauração.

### Modified Capabilities
_Nenhuma._

## Impact

Shared: modelo dos snapshots, hash e retenção. Main: `HistoryService` e `ConfigStore` ganha leitura dos textos e restauração atômica. IPC: `history:list`, `history:create`, `history:restore`, `history:delete`. Renderer: seção nas configurações e ação na paleta.
