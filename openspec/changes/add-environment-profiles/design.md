## Decisions

- **Modelo**: `settings.environments: { id, name, color, confirm, variables }[]`.
- **Comandos por shell** (`shared/env-profiles.ts`, puro): CMD `set "NOME=valor"`; PowerShell `$env:NOME = 'valor'` (aspas simples dobradas); Bash/WSL `export NOME='valor'` (aspas `'\''`). Nomes de variável validados (`^[A-Za-z_][A-Za-z0-9_]*$`).
- **Nova aba**: `pty:create` recebe `envProfileId`; o `PtyManager` pede as variáveis a uma função injetada e as acrescenta ao ambiente montado pelo `buildLaunch`.
- **Aplicar em aba aberta**: o processo já existe, então o app digita os comandos (mesmo caminho dos comandos salvos: colagem + Enter), depois da pré-visualização/confirmação.
- **Marca visual**: `Tab.envProfileId` no renderer; título com um ponto da cor do perfil e item na barra de status.

## Risks / Trade-offs

- [Valores sensíveis em `settings.json` em texto puro] → documentado; o arquivo fica na pasta do usuário. Cofre do Windows fica para o futuro.
- [Variáveis aplicadas por comando ficam no histórico do shell] → documentado; para segredos, usar "Nova aba com ambiente".
