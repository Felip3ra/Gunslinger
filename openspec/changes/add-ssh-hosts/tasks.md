## 1. Preparação

- [x] 1.1 Adicionar `ssh2` e `@types/ssh2` com versão fixa e verificar que `npm install`, `npm run build` e o instalador (`npm run dist`) funcionam sem recompilar módulos nativos novos
- [x] 1.2 Extrair `TerminalBackend` do `PtyManager` com o backend local embrulhando o `IPty`, sem mudar comportamento, e verificar que `npm test` e `npm run test:e2e` continuam passando

## 2. Domínio (shared)

- [x] 2.1 Schemas zod de hosts e grupos (`model/hosts.ts`, com `agentForward` e `keepaliveSec`), chaves e identidades com `*SecretId` (`model/keychain.ts`), known hosts e `settings.ssh` (agente, keepalive, timeout), reexportados por `model.ts`, com testes de validação (endereço, porta, IPv6, `filePath` × `privateKeySecretId` conforme `source`)
- [x] 2.2 `hostId` no `workspacePaneSchema` (padrão `null`), com teste de que workspaces antigos continuam válidos
- [x] 2.3 `resolveHost` (herança com origem de cada campo), `resolveJumpChain` (ciclo e profundidade máxima) e `duplicateHost` (nome " (cópia)", mesmas referências de identidade/chave) em `src/shared/ssh-hosts.ts`, com testes
- [x] 2.4 Leitor de conexão rápida `[user@]host[:porta]` (inclui `[ipv6]:porta`), com testes
- [x] 2.5 Leitor do `~/.ssh/config` e do `~/.ssh/known_hosts` (portas, listas, `@revoked`, hash) e cálculo de fingerprint SHA256, com testes usando arquivos de exemplo

## 3. Keychain e known hosts (main)

- [x] 3.1 `SecretPort` em `ports.ts` e adaptador `safeStorage` em `adapters/electron.ts`; teste do serviço com porta falsa, incluindo cofre indisponível e falha ao decifrar
- [x] 3.2 `keychain.json` e `known_hosts.json` em `FILES` do `ConfigStore` (arquivo inválido não é sobrescrito, `.bak`, observação externa); `secrets.json` fora do snapshot, com gravação atômica; testes
- [x] 3.3 `KeychainService`: importar/colar/referenciar chave, gerar Ed25519/RSA, identidades, exclusão com lista de uso, remoção dos segredos referenciados e coleta de órfãos ao carregar; testes que verificam que nenhum retorno contém segredo nem `*SecretId`
- [x] 3.4 `KnownHostsService`: lista, aceitar, substituir, excluir e importar do OpenSSH, com testes de host novo, chave alterada, `@revoked` sem opção de prosseguir e entrada em hash
- [x] 3.5 Canais `keychain:*` e `knownHosts:*` (contrato, canais, schemas, handlers, `composition.ts`); verificar com `npm run typecheck` e `npm run lint`

## 4. Conexão SSH (main)

- [x] 4.1 `hosts.json` no `ConfigStore` e `HostService` (salvar, duplicar, excluir host/grupo com escolha de destino, validação de ciclo de saltos), com testes
- [x] 4.2 `SshConnectionPool`: acquire/release com contagem, `Promise` em andamento compartilhada por chave (um prompt para pedidos simultâneos), cadeia de saltos via `forwardOut`, keepalive, ordem de autenticação e evento de queda; testes com `Client` falso, inclusive dois `acquire` simultâneos com um só prompt
- [x] 4.3 Agente (`settings.ssh.agent`: OpenSSH `\\.\pipe\openssh-ssh-agent` ou Pageant), `agentForward` por host e lista de algoritmos sem os fracos (`src/main/ssh/algorithms.ts`), com testes das opções passadas ao `connect`
- [x] 4.4 Prompts `ssh:prompt`/`ssh:answer` (host novo, chave alterada, revogada, senha, frase-senha, keyboard-interactive) com `promptId` de uso único, timeout de 5 min e cancelamento; testes de que nenhuma credencial é enviada antes da decisão do fingerprint
- [x] 4.5 Backend SSH do `TerminalBackend` (canal `shell` com tamanho e `xterm-256color`), `kind`/`hostId` no `SessionInfo`, reconectar; testes no `pty-manager.test.ts`
- [x] 4.6 Consumidores do `SessionInfo`: `pid: number | null`; `StatusService` ignora SSH; `PortService` só sessões locais; `tracker`/`listDescendants` só locais; `isBusy`/`busyCount` falsos para SSH; `quit-flow` encerra conexões pelo pool; um teste por consumidor
- [x] 4.7 Mensagens de erro em português (DNS, recusada, timeout, autenticação, nenhum algoritmo em comum) a partir dos erros do `ssh2`, com testes da tradução
- [x] 4.8 Canais `hosts:*` e `ssh:*` e importação do `~/.ssh/config` pela prévia de `transfer`; exportação de hosts sem segredos, com teste do arquivo exportado

## 5. Renderer

- [x] 5.1 Fatia `hosts-slice.ts`, `Tab` com `kind`/`hostId` e helper `shellProfileOf(tab)` tratando SSH nos usos de `profileId` (cor, ícone, família de shell); verificar com `npm run typecheck`
- [x] 5.2 `TerminalArea` mostra etapas, erro com "Tentar de novo"/"Editar host" e "Conexão encerrada" com "Reconectar" (Enter também)
- [x] 5.3 Seção "Hosts" na sidebar (grupos, busca, tags, cor, conexão rápida, menu com Duplicar e "Conectar dividindo à direita/abaixo") e "Conectar: <host>" na paleta via `actions.ts`, sem mudar o significado de Shift+Enter
- [x] 5.4 `HostDialog` e `HostGroupDialog` com valores herdados e origem, encaminhamento do agente, validação de campos e de ciclo
- [x] 5.5 `KeychainDialog` (chaves: importar, colar, referenciar, gerar, copiar pública, exportar; identidades; "Senha salva" com Substituir/Apagar; "indisponível") e seções "Hosts conhecidos" e "SSH" (agente, keepalive, timeout) em Configurações
- [x] 5.6 `SshPromptDialog` (fingerprint novo, aviso de chave alterada com confirmação de substituição, chave revogada sem prosseguir, senha, frase-senha, keyboard-interactive com "Salvar no keychain" desmarcado)
- [x] 5.7 Barra de status com `usuário@endereço` em abas SSH; workspaces e última sessão guardam painéis SSH por `hostId`, reabrem como "Desconectado"/"Host não encontrado" e enviam o `command` do workspace só depois de conectar (descartado se falhar)

## 6. Verificação

- [x] 6.1 e2e contra um servidor SSH local de teste (servidor `ssh2` no próprio teste ou container `linuxserver/openssh-server`): host novo pede fingerprint, senha pedida e salva, segunda conexão sem prompt, chave alterada bloqueia, dois painéis simultâneos com um prompt só, queda mostra "Reconectar", reabrir o app não conecta sozinho, workspace com comando inicial em painel SSH
- [ ] 6.2 Verificar manualmente com o `ssh-agent` do Windows e com um host de salto real, e registrar o resultado no PR
