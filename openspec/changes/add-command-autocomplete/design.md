## Context

Motivação em `proposal.md`. O `ShellIntegrationTracker` (`src/renderer/src/terminal/shell-integration.ts`) já sabe quando o prompt está pronto (marca `133;A`), onde começa o texto digitado (marca `133;B`, guardada em `inputLineStart`) e lê linhas do buffer por um `BufferReader`. O histórico de comandos fica em `ui.commandHistory` (`src/shared/command-history.ts`), os comandos salvos e os comandos de projeto vêm de `project-runnables.ts`, `node-commands.ts` e `ef-commands.ts`. O xterm está no `TerminalRegistry`, fora do React; teclas especiais passam por `terminal/keyboard.ts`.

## Goals / Non-Goals

**Goals:**
- Sugestões instantâneas sem atrapalhar a digitação nem o completamento do próprio shell.
- Nenhuma execução: aceitar só digita.

**Non-Goals:**
- Completamento semântico (argumentos que dependem do estado do programa, como nomes de migration existentes).
- Sugestões geradas por IA.
- Autocomplete em sessões SSH (sem integração de shell remota).

## Decisions

### 1. Texto digitado lido do buffer a partir da marca B
`ShellIntegrationTracker` ganha `currentInput(): { text: string; cursorAtEnd: boolean } | null`, que devolve `null` se o prompt não está pronto ou a marca B não foi vista, e senão lê do `inputLineStart` até o fim da linha lógica (seguindo linhas quebradas) e compara com a posição do cursor. Programas de tela cheia ficam de fora sozinhos: entre a marca C/Enter e a próxima A o prompt não está pronto, e o buffer alternativo (`buffer.active.type === 'alternate'`) também desliga. Alternativa: rastrear as teclas digitadas. Descartada porque o shell edita a linha (histórico com ↑, Ctrl+R, completamento por Tab) e o buffer é a única fonte confiável.
Limitação: shells que não emitem a marca B (perfis customizados sem integração) não têm sugestões. Os três shells integrados já emitem B: bash (`resources/shell-integration/gunslinger.bash`), PowerShell (`gunslinger.ps1`) e CMD (prompt montado por `cmdIntegrationPrompt` em `src/shared/elevation.ts`).

### 2. Motor puro de sugestões
`src/shared/autocomplete/`:
- `tokenize.ts`: separa a linha em palavras respeitando aspas e escapes por família de shell (POSIX, PowerShell, CMD) e devolve a palavra sob o cursor.
- `specs.ts`: árvore estática de subcomandos e opções de `git`, `dotnet` (inclui `ef`), `npm`, `yarn`, `pnpm` e `docker` (só os mais usados; ~300 entradas), com marcações de onde entram branches e caminhos.
- `rank.ts`: junta candidatos das fontes e ordena por prefixo exato > mesma pasta > frequência × recência (decaimento de 7 dias) > código de saída 0, sem duplicar textos.
Cada fonte é uma função `(context) => Candidate[]`; as síncronas (histórico, salvos, projeto, specs) rodam a cada tecla, as assíncronas (caminhos, branches) entram quando chegam se a linha ainda for a mesma.

### 3. Fontes do main com timeout
`complete:paths { cwd, prefix }` lista no máximo 200 entradas da pasta (pastas com `/` no fim, ocultas só se o prefixo começar com `.`), validando que `cwd` é uma pasta existente. `complete:gitBranches { cwd }` roda `git for-each-ref --format=%(refname:short) refs/heads` via `runTool` com o ambiente do `EnvironmentService` e timeout de 1 s, com cache por repositório até o próximo `status:changed`. Nenhum dos dois executa nada vindo do texto digitado além do prefixo usado como filtro.

### 4. Desenho sobre o xterm
A sugestão inline é um elemento absoluto sobre o terminal, posicionado pela célula do cursor (tamanho da célula calculado a partir de `terminal.element`, `cols` e `rows`, sem usar a API interna `_core`, encapsulado em `terminal/cell-geometry.ts`), com a fonte e a cor do tema em opacidade reduzida. A lista é um componente React (`SuggestionList.tsx`) no mesmo lugar. Alternativa: escrever o texto esmaecido no próprio buffer com sequências ANSI. Descartada: misturaria texto falso com a saída real do shell e quebraria busca, cópia e o próprio rastreamento da linha.

### 5. Teclas
`keyboard.ts` intercepta, só quando há sugestão visível ou lista aberta: `→`/`End` no fim da linha (aceitar), `Ctrl+→` (próxima palavra), setas/`Tab`/`Enter`/`Esc` com a lista aberta. Nos outros casos a tecla segue para o xterm sem alteração. Aceitar envia o restante pelo mesmo `onInput` do painel (portanto também respeita o broadcast de `add-broadcast-input`, se ligado). Inserir da lista quando é preciso trocar a palavra envia backspaces (`\x7f`) suficientes para apagar a palavra sob o cursor e depois o texto novo.

### 6. Configurações
`settings.terminal.autocomplete = { enabled: true, inline: { powershell: false, bash: true, cmd: true, other: true }, sources: { history, saved, project, specs, git, paths } }` e ação `terminal.suggest` (`Ctrl+Space`) em `defaultKeybindings`. A família do shell vem do perfil (`ShellProfile`).

## Risks / Trade-offs

- [Ler o buffer a cada tecla custa caro em linhas longas] → Debounce de 16 ms e leitura limitada à linha lógica do prompt.
- [Prompt com várias linhas ou temas como Oh My Posh confundirem a posição] → A marca B fica depois do prompt, então o tamanho do prompt não importa; teste com prompt de duas linhas.
- [Backspaces para trocar a palavra falham em shells com modo vi] → Inserir da lista só substitui a palavra em shells conhecidos (bash, PowerShell, CMD) no modo de edição padrão; nos outros, só acrescenta.
- [Histórico com segredos digitados na linha de comando] → O histórico já ignora comandos começados por espaço; a sugestão não mostra nada que não esteja no histórico local.
