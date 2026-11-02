## Decisions

- **Modelo** (`shared/model/workspaces.ts`): `WorkspacePane { profileId, cwd, projectId, command }`, `WorkspaceLayout = { type: 'pane', pane } | { type: 'split', direction, sizes, children }`, `Workspace { id, name, tabs: WorkspaceLayout[] }`. Mesmo formato de árvore do layout de painéis.
- **Conversões puras** (`shared/workspaces.ts`): `captureLayout(root, paneInfo)` e `commandsOf(workspace)`.
- **Abertura**: cada painel é criado sem grupo (`openTab({ detached: true })`) e o grupo é montado de uma vez com a árvore final (`addGroupWithRoot`), preservando tamanhos sem depender da ordem de divisões. Comandos iniciais usam `waitForPrompt` + colagem + Enter, como os comandos salvos.
- **Persistência**: quarto arquivo do `ConfigStore` (`workspaces.json`), com as mesmas regras; o banner de erros passa a citá-lo.
- **Ação explícita**: abrir o workspace é a ação do usuário; ainda assim os comandos iniciais são listados e confirmados.

## Risks / Trade-offs

- [Pastas que não existem mais] → o painel abre na pasta padrão do perfil (comportamento do PTY) e o comando roda ali; o editor mostra a pasta para correção.
