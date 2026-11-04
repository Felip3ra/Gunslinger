## Context

Motivação em `proposal.md`. Toda a entrada de um painel passa por um único ponto: o `onInput` registrado em `tabs.ts` ao criar o terminal, que faz `api.send('pty:write', { sessionId, data })`. A colagem do xterm também chega por ali. Os painéis de uma aba formam a árvore `TabGroup.root` da `layout-slice`. `run-plan.ts` decide (puro) o que mostrar e enviar ao executar um comando salvo, e `run-command.ts` orquestra diálogos e envio.

## Goals / Non-Goals

**Goals:**
- Broadcast sem latência perceptível e sem mudar o caminho do painel focado.
- Alcance sempre visível e nunca herdado sem o usuário ver.

**Non-Goals:**
- Broadcast entre abas diferentes (só dentro da mesma aba; vários alvos de abas diferentes ficam para "Executar em…").
- Sincronizar o cursor ou o eco: cada terminal mostra o próprio eco.

## Decisions

### 1. Broadcast no renderer, no `onInput`
O estado fica em `TabGroup`: `broadcast: { on: boolean; excluded: string[] }`. No `onInput` do painel `key`, se o grupo dele tem `on` e `key` não está em `excluded`, a função pura `broadcastTargets(group, key, tabs)` (`src/shared/broadcast.ts`) devolve as sessões participantes vivas (só painéis de terminal; painéis sem sessão, como o SFTP de `add-sftp`, ficam de fora) e o renderer manda um `pty:write` por sessão. Fora disso, o caminho atual não muda. Alternativa: canal `pty:writeMany` no main. Descartada: o main já valida cada sessão em `pty:write`, e N mensagens pequenas pelo IPC têm custo desprezível perto da digitação humana; um canal novo não acrescenta segurança.

### 2. Só dados de entrada são transmitidos
`onResize`, busca, seleção e rolagem não passam pelo `onInput`, então ficam de fora sem regra extra. Respostas automáticas do xterm a consultas do programa (ex.: relatório de posição do cursor `ESC[6n` e respostas de cor) também saem por `onData`; para não mandar a resposta de um terminal aos outros, o `TerminalRegistry` marca a entrada como `user` ou `report`, e só `user` é transmitido. É `user` o `onData` emitido de forma síncrona durante um `keydown` (`attachCustomKeyEventHandler` liga a marca e um microtask a desliga), durante o evento `paste` ou logo após `compositionend` da textarea do xterm (IME e teclas mortas, como `´` + `a` → `á`, que não passam pelo `keydown` com o caractere final). O resto (`onBinary` e respostas a consultas como `ESC[6n`) é `report`. Teste do `TerminalRegistry` cobre os três casos e uma resposta automática.

### 3. Colagem de várias linhas
A colagem já passa pela ação `terminal.paste` e pelo evento `paste` do xterm. Com broadcast ligado e texto com `\n`, o renderer abre a confirmação antes de entregar ao xterm. Colar "só neste painel" envia ao painel focado sem transmitir.

### 4. Atalho
Nova ação `pane.broadcastToggle` em `defaultKeybindings` com `Ctrl+Shift+I`. Essa combinação abre as DevTools só em modo dev (atalho do menu padrão do Electron); no app empacotado não há conflito. Ação na paleta: "Transmitir para todos os painéis" / "Parar transmissão". O usuário pode trocar o atalho pelas configurações existentes.

### 5. Persistência
`broadcast` não entra em `WorkspaceLayout` nem em `session:save` (o tipo serializado continua sem o campo). Teste garante que o layout salvo não o contém.

### 6. "Executar em…"
`run-plan.ts` ganha `planMultiTarget(command, targets, context)` que, por alvo, resolve variáveis de projeto (pelo projeto do painel) e junta as variáveis informadas uma vez; devolve a prévia por alvo e o texto final. O shell e a pasta de destino do comando salvo valem só para alvos que o "Executar em…" abre do zero (painel novo); em painéis já abertos, o comando roda no shell e na pasta em que o painel está, sem `cd` nem troca de shell, e a prévia avisa por alvo quando o shell do painel é diferente do definido no comando. `run-command.ts` mostra o diálogo de alvos (painéis abertos agrupados por aba; hosts, se a fatia `hosts` existir), abre uma aba dividida para os hosts sem painel e envia a cada alvo quando ele fica pronto (prompt pronto pela integração nos locais; sessão conectada nos SSH). O envio respeita a regra "nada é enviado sem ação explícita": só acontece depois de "Executar em N alvos".

## Risks / Trade-offs

- [Comando destrutivo chegar a um painel que o usuário esqueceu] → Borda e selo em todos os participantes, ícone na aba, exclusão por painel e nenhum estado restaurado.
- [Respostas automáticas do terminal transmitidas corrompem outros painéis] → Separação `user`/`report` da decisão 2, com teste do `TerminalRegistry`.
- [Hosts abrindo em tempos diferentes] → Envio por alvo quando ele fica pronto, com timeout de 30 s que move o alvo para a lista de falhas.
