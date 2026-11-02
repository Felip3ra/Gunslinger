## Why

Times querem distribuir comandos, temas, padrões de log, workspaces e perfis de shell prontos (por exemplo, o "kit" de um projeto) sem editar o `settings.json` de cada pessoa. Decidido: plugins **declarativos**, só dados, sem execução de código.

## What Changes

- Pasta `<dados>/plugins/<pasta>/plugin.json`: manifesto com `id`, `name`, `version`, `description` e `contributes`.
- Contribuições: `commands` (comandos salvos), `themes` (temas do terminal), `logHighlight` (regras de destaque), `workspaces` e `profiles` (perfis de shell).
- As contribuições aparecem junto com os dados do usuário, marcadas com o plugin e somente leitura: comandos na paleta e no painel, workspaces na lista, regras de log no destaque, perfis na lista de shells, temas como opção em Aparência (aplicar copia o tema para as configurações).
- Seção **Plugins** nas configurações: lista com versão, descrição, contagem de contribuições, erro de validação, ativar/desativar, abrir a pasta e recarregar. Mudanças na pasta são aplicadas sem reiniciar.
- Manifesto inválido ou `id` repetido: o plugin aparece com o erro e não contribui nada; o resto continua.

## Capabilities

### New Capabilities
- `plugins`: carregamento, validação e contribuições de plugins declarativos.

### Modified Capabilities
_Nenhuma._

## Impact

Shared: schema do manifesto e junção das contribuições. Main: `PluginService` (leitura, observação da pasta), `ShellService` recebe perfis de plugins, `settings.plugins.disabled`. IPC: `plugins:get`, `plugins:setEnabled`, `plugins:openFolder`, `plugins:reload`, evento `plugins:changed`. Renderer: fatia `plugins`, seção nas configurações e junção nos pontos de uso.
