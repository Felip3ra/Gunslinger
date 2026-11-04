## Context

Motivação em `proposal.md`. O terminal hoje é uma PTY local por sessão: `PtyManager` (`src/main/pty/pty-manager.ts`) cria o processo, faz o buffer de saída (flush a cada 5 ms ou 64 KB), o controle de fluxo por `pty:ack` (pausa acima de 1 MB) e o ciclo de vida. O renderer conversa só por `sessionId` nos canais `pty:write`, `pty:resize`, `pty:ack`, `pty:data` e `pty:exit`. A configuração fica em arquivos JSON validados por zod em `ConfigStore`, com gravação atômica. Ainda não há armazenamento de segredos nem porta para o `safeStorage` do Electron.

Esta change também é a base de `add-sftp` e `add-port-forwarding`, que reaproveitam a conexão SSH.

## Goals / Non-Goals

**Goals:**
- Sessão SSH plugada no mesmo fluxo de dados das PTYs locais, sem mudar o terminal do renderer.
- Uma conexão por host reaproveitada por abas, SFTP e túneis (um único pedido de senha/2FA).
- Segredos só no main, cifrados em repouso.

**Non-Goals:**
- Integração de shell no servidor remoto (marcas OSC, pasta atual, detecção de comando rodando).
- Certificados SSH (`-cert.pub`), FIDO/`sk-*` e GSSAPI/Kerberos.
- Sincronização ou compartilhamento do keychain entre máquinas.

## Decisions

### 1. Biblioteca `ssh2` no processo principal
Escolhida pelo usuário. Dá controle direto de verificação de host (`hostVerifier` assíncrono), keyboard-interactive, agente (`agent: '\\.\pipe\openssh-ssh-agent'` ou `'pageant'`), `forwardOut` (saltos e túneis) e SFTP, tudo no mesmo objeto `Client`. Alternativa descartada: `ssh.exe` numa PTY, que não permite SFTP, túneis gerenciados nem fluxo de autenticação próprio. `ssh2` é JavaScript puro; o opcional `cpu-features` fica fora do `electron-rebuild` (lista em `postinstall` não muda).

### 2. Backend de terminal abstrato no `PtyManager`
Extrair de `PtyManager` uma interface `TerminalBackend` (`write`, `resize`, `pause`, `resume`, `kill`, `onData`, `onExit`, `pid | null`). O backend local embrulha o `IPty`; o SSH embrulha o `ClientChannel` de `client.shell({ term: 'xterm-256color', cols, rows })`. O buffer, o controle de fluxo e os eventos continuam num lugar só. `SessionInfo` ganha `kind: 'local' | 'ssh'` e `hostId`; para SSH, `isBusy` devolve `false`, `listDescendants`/`tracker`/elevação não se aplicam, e `restart` vira "reconectar".
**Consumidores do `SessionInfo`.** Hoje vários módulos supõem sessão local, e cada um passa a filtrar por `kind`:
- `SessionInfo.pid` vira `number | null` (null para SSH); o tipo força a revisão de todos os usos.
- `StatusService.onSessionEvent` ignora sessões SSH: não roda `git` nem lê versões de Node/.NET em pasta local. A barra de status de abas SSH usa `ssh:state`.
- `PortService.sessionOwners` só considera sessões locais (`pid !== null`).
- `tracker` (Job Object) e `listDescendants` só para locais; `killSession` de SSH fecha o canal e faz `release` no pool.
- `busyCount`/`isBusy` devolvem falso para SSH (spec `ssh-sessions`), e o `quit-flow` encerra as conexões pelo pool.
- `last-session` e workspaces gravam o painel SSH pelo `hostId` (decisão 12).

Alternativa: um `SshSessionManager` paralelo com canais `ssh:data`. Descartada porque duplicaria buffer e backpressure e obrigaria o `TerminalRegistry` a conhecer dois protocolos.

### 3. Pool de conexões por host com contagem de uso
`SshConnectionPool` (`src/main/ssh/connection-pool.ts`) mantém um `Client` por host resolvido (chave: `hostId`, ou `user@addr:port` na conexão rápida) e conta quem o usa (abas, SFTP, túneis). `acquire(hostId)` conecta se preciso (inclusive a cadeia de saltos) e devolve um handle; `release` fecha a conexão quando a contagem chega a zero. Enquanto uma conexão está sendo aberta, o pool guarda a `Promise` em andamento por chave, e novos `acquire` do mesmo host aguardam essa mesma promessa (verificação de host e 2FA uma vez só); se ela falhar, todos recebem o erro e a próxima tentativa começa do zero. Abas SSH abrem cada uma o seu canal de shell sobre o mesmo `Client`. Se a conexão cair, todos os usos recebem o evento e cada aba mostra "Conexão encerrada".
Trade-off: uma queda afeta todas as abas do host; em troca, 2FA e senha são pedidos uma vez, como no Termius.

### 4. Saltos via `forwardOut` encadeado
Para conectar a H com salto J: `acquire(J)` no pool, `J.forwardOut('127.0.0.1', 0, H.addr, H.port)` e `new Client().connect({ sock: stream, ... })`. A cadeia é resolvida por uma função pura (`resolveJumpChain` em `src/shared/ssh-hosts.ts`) que detecta ciclos e limita a profundidade a 5. O salto conta como um uso da conexão de J.

### 5. Modelo e herança (puros, em `src/shared`)
`src/shared/model/hosts.ts`: `HostGroup { id, name, parentId, defaults }`, `Host { id, name, address, port?, username?, identityId?, keyId?, jumpHostId?, keepaliveSec?, agentForward?, color?, tags[], groupId }`. `src/shared/ssh-hosts.ts`: `resolveHost(host, groups)` devolve os valores efetivos e, para cada campo, a origem (`'host' | groupId | 'default'`), usada pelo formulário ("herdado de Produção"). Arquivo `hosts.json` entra em `FILES` do `ConfigStore`.

### 6. Segredos: `SecretPort` + `secrets.json`
Nova porta em `src/main/ports.ts`: `SecretPort { isAvailable(): boolean; encrypt(text): Buffer; decrypt(buf): string }`, com adaptador em `adapters/electron.ts` sobre `safeStorage` (DPAPI no Windows). Entidades (`src/shared/model/keychain.ts`):
- `SshKey { id, name, type, fingerprint, publicKey, comment, source: 'stored' | 'file', filePath?, privateKeySecretId?, passphraseSecretId?, createdAt }`: `privateKeySecretId` existe só quando `source: 'stored'`; `filePath` só quando `source: 'file'`.
- `Identity { id, name, username, keyId?, passwordSecretId? }`.
- O renderer recebe a projeção `hasPrivateKey`, `hasPassphrase`, `hasPassword` (e `secretUnavailable` quando a decifragem falha), nunca os ids de segredo.

Arquivos: `keychain.json` (metadados) e `known_hosts.json` entram em `FILES` do `ConfigStore`, herdando a validação por zod, a recusa a sobrescrever arquivo inválido, a gravação atômica com `.bak` e a observação de mudanças externas. `secrets.json` (mapa `secretId → base64 cifrado`) fica fora do snapshot enviado ao renderer: é lido e gravado só pelo `KeychainService` (`src/main/ssh/keychain-service.ts`), com o mesmo `writeFileAtomic` e a mesma regra de não sobrescrever arquivo ilegível. Excluir uma chave ou identidade, ou substituir um segredo, apaga os segredos que ela referenciava; ao carregar, segredos sem dono são removidos (coleta de órfãos), sempre depois de gravar os metadados. O renderer recebe só os metadados (`hasPassword: true`); canais de escrita aceitam o segredo e nunca há canal de leitura dele.
Alternativa: Windows Credential Manager via `keytar`. Descartada: módulo nativo a mais, limite de tamanho que não comporta chaves RSA e projeto arquivado.

### 7. Chaves: parse e geração pelo `ssh2`
`utils.parseKey` (com frase-senha) valida o formato e extrai tipo e pública; o fingerprint SHA256 é calculado sobre o blob da pública (`src/shared/ssh-fingerprint.ts`, puro). A geração usa `utils.generateKeyPairSync('ed25519' | 'rsa', { bits: 4096, passphrase, cipher: 'aes256-ctr', comment })`, que já devolve formato OpenSSH. Chaves `source: 'file'` são lidas do disco na hora de conectar, para seguir alterações no arquivo.

### 8. Prompts de autenticação e de fingerprint pelo renderer
O main é quem decide, o renderer só pergunta. Evento `ssh:prompt` (`{ promptId, sessionKey, kind: 'hostKey-new' | 'hostKey-changed' | 'password' | 'passphrase' | 'keyboard-interactive', ... }`) e resposta `ssh:answer` (invoke, validado por zod com `promptId` conhecido e de uso único). Sem resposta em 5 minutos, a conexão é cancelada. O `hostVerifier` do `ssh2` espera essa resposta antes de seguir, o que garante que nenhuma credencial sai antes da decisão.

### 9. Known hosts
`known_hosts.json` com `{ host, port, keyType, keyBase64, addedAt }`. O leitor do `~/.ssh/known_hosts` (puro, com testes) entende entradas `[host]:porta`, listas separadas por vírgula, `@revoked` (vira bloqueio) e nomes em hash `|1|salt|hash` (comparados por HMAC-SHA1 no main). A busca considera endereço e porta; para saltos, vale o endereço visto pela conexão de salto.

### 10. Leitor do `~/.ssh/config` (puro)
`src/shared/ssh-config.ts` lê `Host`, `HostName`, `User`, `Port`, `IdentityFile` (expande `~` e `%d`/`%u` simples), `ProxyJump` (o primeiro salto de uma lista vira cadeia), `ServerAliveInterval` e `ForwardAgent`. `Match`, `Include` e tokens não suportados entram na lista de ignorados da prévia, que reaproveita o fluxo de `transfer:previewImport`/`applyImport`.

### 11. Renderer
`Tab` ganha `kind` e `hostId`; `profileId` fica vazio para SSH (são ~80 usos de `profileId` no renderer, e os que procuram o perfil de shell, como cor, ícone e família de shell, passam a tratar `kind: 'ssh'`, usando a cor do host). Nova fatia `store/hosts-slice.ts` (hosts, grupos, metadados do keychain, prompts pendentes). Componentes: `HostsSection.tsx` (na sidebar), `HostDialog.tsx`, `KeychainDialog.tsx` (chaves e identidades, também acessível em Configurações), `SshPromptDialog.tsx` e o estado de conexão no `TerminalArea`. Conectar dividindo é uma ação do menu do host (`pane.splitRight`/`splitDown` com o host como destino); Shift+Enter continua sendo "Inserir" na paleta e na sidebar.

### 12. Painel SSH em workspaces e na sessão
`workspacePaneSchema` ganha `hostId: string | null` (padrão `null`). Um painel com `hostId` é SSH e ignora `profileId`, `cwd` e `projectId`. O `command` existente vale também para SSH: o workspace pede a confirmação de sempre e o comando é enviado quando a sessão chega a "conectado"; falha ou cancelamento descartam o comando. `last-session` usa o mesmo schema.

### 13. Configurações de SSH
`settings.ssh = { agent: 'off' | 'openssh' | 'pageant' (padrão 'openssh'), keepaliveSec: 30, connectTimeoutSec: 20 }`. `Host.agentForward` (padrão `false`, herdável) liga `agentForward: true` no `connect` e só tem efeito com agente ativo. A lista de algoritmos é a padrão do `ssh2` sem `diffie-hellman-group1-sha1`, `ssh-rsa` (SHA-1) e cifras `*-cbc`, montada numa constante em `src/main/ssh/algorithms.ts`; "no matching" do `ssh2` vira "Nenhum algoritmo em comum com o servidor".

### 14. Canais novos
`hosts:save|delete|deleteGroup|saveGroup|importOpenSsh|applyOpenSshImport`, `keychain:list|importKey|generateKey|saveIdentity|setSecret|clearSecret|delete|exportKey|copyPublicKey`, `knownHosts:list|delete|importOpenSsh`, `ssh:connect { hostId | quick, cols, rows } → { sessionId }`, `ssh:reconnect`, `ssh:answer`, evento `ssh:prompt` e `ssh:state` (etapa da conexão). Todos em `ipc-contract.ts`, `ipc-channels.ts`, `ipc-schemas.ts` e um handler por recurso (`ipc/handlers/hosts.ts`, `keychain.ts`, `ssh.ts`).

## Risks / Trade-offs

- [Mudar o `PtyManager` pode quebrar abas locais] → Extrair `TerminalBackend` primeiro, sem mudar comportamento, com os testes atuais passando antes de adicionar o backend SSH.
- [Segredo vazar para logs ou erros de IPC] → Os schemas zod de escrita marcam os campos de segredo; o `registry.ts` não registra o payload desses canais; teste que garante que nenhuma resposta de `keychain:*` contém o segredo.
- [DPAPI indisponível ou perfil do Windows trocado] → `SecretPort.isAvailable()` checado antes de gravar; falha ao decifrar marca o segredo como "indisponível" em vez de quebrar o carregamento.
- [Prompt sem resposta prende a conexão] → Timeout de 5 min e cancelamento ao fechar a aba.
- [Uma conexão compartilhada cai e derruba várias abas] → Aceito (decisão 3); cada aba reconecta com um clique e o pool reabre uma conexão.
- [Servidores antigos só com algoritmos legados] → Não conectam (decisão 13), com a mensagem "Nenhum algoritmo em comum com o servidor". Aceito: reabilitar algoritmos fracos fica fora do escopo.
- [Cerca de 80 usos de `profileId` no renderer] → `kind` no `Tab` e um helper `shellProfileOf(tab)` que devolve `undefined` para SSH; o typecheck aponta os usos que precisam tratar o caso.

## Migration Plan

Só acréscimos: arquivos novos em `%APPDATA%/Gunslinger`, sem migração dos existentes. `hostId` entra no `workspacePaneSchema` com padrão `null`, então workspaces antigos continuam válidos sem mudança de `version`. Reverter a change não perde a configuração existente, mas há um efeito a conhecer: o `z.object` de uma versão anterior descarta o campo `hostId` desconhecido, e o painel SSH reabriria como **shell local padrão** (e, se tiver `command`, ofereceria rodá-lo localmente, ainda com confirmação). Por isso, antes de voltar a uma versão anterior, é preciso remover os painéis SSH dos workspaces.
