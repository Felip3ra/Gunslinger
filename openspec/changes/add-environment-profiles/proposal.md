## Why

Rodar a mesma API ou os mesmos comandos de EF contra Desenvolvimento, Homologação ou Produção exige trocar variáveis (`ASPNETCORE_ENVIRONMENT`, connection strings, URLs) à mão, com risco de rodar algo contra o ambiente errado.

## What Changes

- **Perfis de ambiente**: conjuntos nomeados de variáveis (ex.: Dev, Homologação, Produção), com cor e a opção "pedir confirmação" para ambientes sensíveis.
- **Nova aba com ambiente**: as variáveis entram no ambiente do processo do shell.
- **Aplicar ambiente na aba atual**: o app digita os comandos do shell (`set` no CMD, `$env:` no PowerShell, `export` no Bash), com pré-visualização; perfis sensíveis pedem confirmação explícita.
- A aba mostra o ambiente ativo (nome e cor) no título e na barra de status.
- Edição dos perfis em Configurações → Ambientes (gravados em `settings.json`).

## Capabilities

### New Capabilities
- `environment-profiles`: perfis de variáveis de ambiente, aplicação em abas novas e existentes, e identificação visual.

### Modified Capabilities
_Nenhuma._

## Impact

Shared: schema dos perfis e geração dos comandos por shell. Main: `pty:create` aceita `envProfileId` (o renderer nunca envia variáveis; o main as resolve). Renderer: tela de configurações, ações na paleta, marca na aba.
