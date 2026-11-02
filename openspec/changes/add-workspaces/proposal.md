## Why

Todo dia o usuário abre o mesmo conjunto: uma aba com a API (`dotnet watch`), outra com o front (`npm run dev`) e um shell livre. Montar isso à mão, aba por aba, é repetitivo.

## What Changes

- **Workspaces**: um conjunto nomeado de abas, cada uma com o seu layout de painéis; cada painel define perfil, pasta, projeto e um comando inicial opcional.
- **Salvar abas como workspace**: captura as abas e painéis abertos (perfil, pasta, projeto, tamanhos).
- **Abrir workspace** pela paleta ou pela lista; antes de executar comandos iniciais, o app mostra quais serão executados e pede confirmação.
- Lista de workspaces com renomear, editar (perfil, pasta, comando de cada painel) e excluir.
- Workspaces ficam em `%APPDATA%\Gunslinger\workspaces.json`, com as mesmas garantias dos outros arquivos (gravação atômica, arquivo inválido não é sobrescrito).

## Capabilities

### New Capabilities
- `workspaces`: salvar, abrir, editar e excluir conjuntos de abas e painéis.

### Modified Capabilities
_Nenhuma._

## Impact

- Shared: schema do workspace e conversões puras (captura e montagem).
- Main: `ConfigStore` ganha o arquivo `workspaces.json`; canais `workspaces:save`/`workspaces:delete`.
- Renderer: abrir/salvar workspaces, diálogo de gerenciamento, ações na paleta.
