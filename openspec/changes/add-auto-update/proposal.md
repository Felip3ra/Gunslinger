## Why

Quem instala o Gunslinger fica preso à versão que baixou: não há aviso de versão nova nem jeito de atualizar sem baixar o instalador de novo. A publicação também era manual (subir o `.exe` na página de releases), o que deixou o link de download do site quebrado.

## What Changes

- O app instalado procura atualizações nas releases do GitHub 15 s depois de abrir e a cada 4 h, baixa a versão nova em segundo plano e a instala ao reiniciar (ou na próxima vez que o app fechar).
- A barra de status mostra o download e, quando pronto, **Versão X pronta · Reiniciar**; reiniciar passa pela confirmação de abas ocupadas.
- Nova seção **Sobre e atualizações** nas configurações: versão, estado, **Procurar atualizações**, **Reiniciar e atualizar** e a opção `updates.auto`.
- Workflow `release.yml`: uma tag `vX.Y.Z` igual à versão do `package.json` gera o instalador e publica a release com o `latest.yml`.

## Capabilities

### New Capabilities
- `auto-update`: verificação, download e instalação de versões novas; publicação pelo CI.

### Modified Capabilities
_Nenhuma._

## Impact

Dependência `electron-updater`. Main: `UpdateService` (porta `UpdaterPort`, adaptador em `adapters/electron-updater.ts`) e o fluxo de saída passa a aceitar uma ação depois da limpeza. IPC: `update:status`, `update:check`, `update:install`, evento `update:changed`. Build: `publish` no `electron-builder.yml`; `npm run dist` nunca publica.
