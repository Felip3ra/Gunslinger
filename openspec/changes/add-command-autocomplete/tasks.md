## 1. Motor puro (shared)

- [ ] 1.1 `tokenize.ts` (aspas e escapes de POSIX, PowerShell e CMD; palavra sob o cursor), com testes
- [ ] 1.2 `specs.ts` com subcomandos e opções de `git`, `dotnet`/`ef`, `npm`, `yarn`, `pnpm` e `docker`, e pontos de branch/caminho, com testes de navegação na árvore
- [ ] 1.3 Fontes síncronas (histórico, comandos salvos do projeto ativo, scripts e comandos prontos do projeto, specs) e `rank.ts` (prefixo, mesma pasta, frequência × recência, saída 0, sem duplicatas), com testes de ordem

## 2. Main

- [ ] 2.1 `complete:paths` (limite de 200, pastas com `/`, ocultas só com `.`, valida a pasta) e `complete:gitBranches` (`runTool` com o ambiente do `EnvironmentService`, timeout 1 s, cache até `status:changed`); contrato, schemas, handler e `composition.ts`, com testes

## 3. Renderer

- [ ] 3.1 `currentInput()` no `ShellIntegrationTracker` (prompt pronto, marca B, linha lógica, cursor no fim, buffer alternativo desliga), com testes usando `BufferReader` falso, incluindo prompts de bash, PowerShell e CMD
- [ ] 3.2 `terminal/autocomplete.ts`: consulta das fontes a cada tecla com debounce de 16 ms, fontes assíncronas descartadas se a linha mudou, medição de 50 ms nas fontes locais
- [ ] 3.3 Sugestão inline posicionada pela célula do cursor (`cell-geometry.ts`) e `SuggestionList` com origem por item
- [ ] 3.4 Teclas em `keyboard.ts` (`→`/`End`, `Ctrl+→`, lista com setas/`Tab`/`Enter`/`Esc`), inserção pelo `onInput` do painel, troca de palavra só nos shells conhecidos, diálogo de variáveis para comandos salvos; testes das decisões de tecla
- [ ] 3.5 `settings.terminal.autocomplete` (schema e padrões com inline desligado no PowerShell), ação `terminal.suggest` (`Ctrl+Space`) e seção em `TerminalSettings.tsx`

## 4. Verificação

- [ ] 4.1 e2e numa aba Git Bash: histórico sugere inline e `→` aceita sem executar, `Ctrl+Space` lista scripts do projeto, `Tab` sem lista vai para o shell, `vim` sem sugestões; numa aba PowerShell, inline desligado e lista disponível
