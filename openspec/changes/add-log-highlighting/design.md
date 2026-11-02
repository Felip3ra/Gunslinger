## Decisions

- **Camada visual com decorations do xterm.js** (`registerMarker` + `registerDecoration` com `x`/`width`), em vez de injetar cores ANSI no fluxo: injetar quebraria sequências de escape e programas de tela cheia e mudaria o texto copiado.
- **Varredura incremental**: após cada escrita (com debounce de 50 ms), o `LogHighlighter` examina só as linhas concluídas desde a última varredura (até a linha anterior ao cursor) do buffer normal. As decorations somem junto com as linhas quando o histórico é aparado.
- **Regras puras** (`shared/log-highlight.ts`): compilação (regex inválida vira aviso) e `findMatches(line, rules)` sem sobreposição (a primeira regra que casa num trecho vence).
- **Configuração**: `logHighlight { enabled, rules }` no `settings.json`; as regras padrão vêm do schema.

## Risks / Trade-offs

- [Muitas decorations em saídas enormes] → limite de 20 trechos por linha e varredura em lotes; marcadores são descartados com o histórico.
- [Linhas quebradas pela largura] → cada linha física é tratada à parte (trecho cortado na quebra é destacado em duas partes ou não casa); aceito.
