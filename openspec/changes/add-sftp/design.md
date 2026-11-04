## Context

Motivação em `proposal.md`. Depende de `add-ssh-hosts`: `SshConnectionPool` entrega um `Client` do `ssh2` por host, com contagem de uso, e o fluxo de prompts `ssh:prompt`/`ssh:answer` já existe. O main é o único dono do sistema de arquivos; `EditorService` abre arquivos no editor configurado.

## Goals / Non-Goals

**Goals:**
- Navegação e transferência rápidas sobre a conexão já aberta, sem bloquear o shell das abas.
- Nenhum arquivo sobrescrito ou enviado sem decisão do usuário.

**Non-Goals:**
- SCP como alternativa ao SFTP; sincronização contínua de pastas (rsync); transferência servidor ↔ servidor.
- Comparação visual (diff) de arquivos.
- Seguir a pasta atual da aba SSH (sem integração de shell remota não há como saber).

## Decisions

### 1. Um canal SFTP por painel, sobre a conexão do pool
`SftpService.open(hostId)` faz `pool.acquire(hostId)` e `client.sftp()`; fechar o painel encerra o canal e faz `release`. A queda da conexão chega pelo evento do pool e marca o painel como desconectado, com "Reconectar". Alternativa: conexão própria para SFTP (como alguns clientes fazem para não disputar banda com o shell). Descartada por pedir 2FA de novo; o SSH já multiplexa canais com janelas independentes.

### 2. Transferência por streams com tamanho de bloco e concorrência fixos
Download e upload usam `fastGet`/`fastPut` do `ssh2` (leituras paralelas por arquivo, `concurrency: 64`, `chunkSize: 32 KB`) com `step` para progresso, e no máximo 3 arquivos por vez na fila. Retomada usa `createReadStream`/`createWriteStream` com `start` e flag `a`, quando o parcial é menor que a origem e o hash do seu trecho final (até 64 KB) é igual ao do mesmo trecho da origem (spec "Falha e retomada"). É uma heurística aceita para não reler o arquivo inteiro: protege contra o caso comum (origem trocada por outra versão), não contra corrupção no meio do parcial. Ao fim, o tamanho final é conferido com o da origem. O progresso vai ao renderer pelo evento `sftp:transfer` agrupado a cada 250 ms.

### 3. Planejamento de transferência puro
`src/shared/sftp-plan.ts` recebe a árvore de origem (já listada pelo main) e a listagem do destino e devolve a lista de operações (criar pasta, copiar arquivo, conflito), com nomes `(1)`, `(2)` gerados sem colidir e a decisão "aplicar aos próximos" aplicada na ordem. Fica testável sem servidor. Caminhos remotos usam `path.posix`; locais, `path.win32` via `PlatformAdapter`.

### 4. Arrastar do Explorer
O renderer recebe os arquivos do evento `drop`; o caminho absoluto é obtido no preload por `webUtils.getPathForFile` (o `File.path` saiu no Electron 32) e enviado a `sftp:upload`. O main valida que cada caminho existe e é arquivo ou pasta local antes de enfileirar; o renderer nunca envia conteúdo de arquivo.

### 5. Edição remota com observador
`sftp:editRemote` baixa para `%TEMP%/Gunslinger/sftp-edit/<uuid>/<nome>`, guarda `mtime` e tamanho remotos e abre pelo `EditorService`. Um `fs.watch` com debounce de 500 ms detecta gravações e emite `sftp:editChanged`; o renderer pergunta e chama `sftp:pushEdit`, que antes faz `stat` remoto e devolve `conflict` se `mtime`/tamanho mudaram. Os temporários são apagados ao fechar o painel e ao abrir o app (sobras de uma saída forçada).

### 6. Renderer e layout
Nova fatia `store/sftp-slice.ts` (painéis abertos, listagens, fila). `SftpPanel.tsx` é um novo tipo de painel no layout, para poder ficar lado a lado com a aba SSH em split. Hoje cada folha do layout é a `key` de um `Tab` de terminal; o `Tab` ganha `kind: 'local' | 'ssh' | 'sftp'` (o `kind` SSH vem de `add-ssh-hosts`), e um `Tab` SFTP não tem `sessionId` de terminal nem entrada no `TerminalRegistry`. O `TerminalArea` escolhe o componente pela `kind`; `pane.focusNext/Prev`, fechar e dividir funcionam sem mudança porque operam sobre as `key`s. Ações de terminal (`terminal.find`, `terminal.copy/paste`, broadcast) consultam `kind` e ficam desabilitadas. `workspacePaneSchema` ganha `sftp: { hostId, localPath, remotePath } | null`, e o painel reabre desconectado. Lista virtualizada para pastas grandes (milhares de itens). Diálogos `SftpConflictDialog.tsx` e `SftpPermissionsDialog.tsx`.

### 7. Canais
`sftp:open|close|list|mkdir|rename|delete|chmod|upload|download|cancel|retry|editRemote|pushEdit|realpath`, `fs:list` (coluna local) e eventos `sftp:transfer`, `sftp:conflict`, `sftp:editChanged`, `sftp:state`. Caminhos são validados por zod (sem bytes nulos, tamanho máximo, absolutos). Regra da coluna local: `fs:list` lista qualquer pasta local que o usuário do Windows possa ler, como o Explorer, e é só leitura de nomes e metadados; gravações locais (download, mkdir, rename, delete) só acontecem por canais que exigem ação explícita, e exclusões locais vão para a Lixeira (`DesktopPort.trashItem`, porta nova sobre `shell.trashItem`) em vez de apagar direto.

## Risks / Trade-offs

- [Transferência grande disputa banda com o shell na mesma conexão] → Concorrência de 3 arquivos e janelas do SSH por canal; o shell continua responsivo, mas pode ficar mais lento durante uploads grandes. Documentado.
- [`fs.watch` dispara várias vezes por gravação (editores gravam via arquivo temporário e rename)] → Debounce e comparação de hash antes de perguntar.
- [Exclusão recursiva remota grande] → Contagem de itens antes da confirmação; execução em lote com cancelamento.
- [Servidores com links simbólicos em ciclo] → Cópia recursiva não segue links simbólicos de pasta; eles são criados como link quando o destino é remoto e ignorados (com aviso) quando é local.
