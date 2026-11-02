## Why

Saídas longas de build, testes e servidores (`dotnet build`, `npm run dev`, logs do ASP.NET) escondem erros e avisos no meio de centenas de linhas.

## What Changes

- Destaque de padrões na saída do terminal: erros em vermelho, avisos em amarelo, sucesso em verde, por padrão (inclui os níveis `fail:`/`warn:`/`info:` do ASP.NET Core e mensagens do MSBuild e do npm).
- Regras configuráveis em `settings.json` (`logHighlight.rules`: expressão regular, cor do texto e do fundo), mais liga/desliga (`logHighlight.enabled`) e ação na paleta.
- O destaque é uma camada visual: não altera o texto, a cópia, a busca nem programas de tela cheia (a tela alternativa não é destacada).

## Capabilities

### New Capabilities
- `log-highlighting`: regras de destaque de padrões e aplicação visual na saída.

### Modified Capabilities
_Nenhuma._

## Impact

Shared: schema das regras e busca de ocorrências (puro). Renderer: `LogHighlighter` por terminal usando decorations do xterm.js. Settings: novo bloco `logHighlight`.
