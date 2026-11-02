## 1. Fundação do projeto

- [x] 1.1 Criar projeto com electron-vite (TypeScript, React) com alvos main, preload e renderer; configurar ESLint, Prettier e `tsconfig` estrito
- [x] 1.2 Configurar Vitest para `src/shared` e `src/main` e Playwright `_electron` com um teste smoke que abre a janela
- [x] 1.3 Adicionar node-pty e `@vscode/windows-process-tree`, configurar `electron-rebuild` no `postinstall` e validar que os módulos carregam no main
- [x] 1.4 Criar a `BrowserWindow` com `contextIsolation`, `sandbox`, `nodeIntegration: false`, CSP e bloqueio de navegação/`window.open` (teste: renderer não acessa `require`/`process`)
- [x] 1.5 Configurar electron-builder (NSIS por usuário, AppUserModelID `com.gunslinger.app`, atalho no Menu Iniciar) e gerar um instalador de teste
- [x] 1.6 Implementar instância única (`requestSingleInstanceLock`, `second-instance` restaura e foca a janela) com teste e2e
- [x] 1.7 Configurar CI no Windows (GitHub Actions `windows-latest`): lint, Vitest, rebuild do node-pty, build e smoke e2e que abre um PTY
- [x] 1.8 Criar `CLAUDE.md` com estrutura de pastas, regras de IPC, uso de `process.platform` só em `platform/`, idioma do código e convenções de teste, e preencher o `context` de `openspec/config.yaml`

## 2. IPC tipado, plataforma e ambiente

- [x] 2.1 Criar `shared/ipc-contract.ts` com todos os canais listados no design (InvokeMap, SendMap, EventMap) e schemas zod em `shared/schemas`
- [x] 2.2 Implementar no preload `window.gunslinger.invoke/send/on` com lista branca de canais
- [x] 2.3 Implementar `registerHandler` no main com validação zod e erros tipados (teste unitário: argumento inválido é rejeitado)
- [x] 2.4 Definir a interface `PlatformAdapter` com `win32.ts` (stubs) e `posix.ts` (fallback com `$SHELL`)
- [x] 2.5 Implementar `EnvironmentService` (geração 0 = ambiente do lançamento) e `tools/` para executar ferramentas externas com o ambiente atual e timeout
- [x] 2.6 Implementar `readSystemEnvironment` no Windows (registro HKLM/HKCU, expansão de `REG_EXPAND_SZ`, PATH máquina+usuário, variáveis voláteis mantidas) com testes sobre saídas de `reg query` gravadas

## 3. Configuração

- [x] 3.1 Implementar `ConfigStore`: resolução de `%APPDATA%\Gunslinger`, criação dos arquivos padrão na primeira execução
- [x] 3.2 Implementar leitura com jsonc-parser + validação por campo com fallback para padrão e coleta de `ConfigIssue` (testes: JSON quebrado, campo inválido, arquivo ausente)
- [x] 3.3 Implementar gravação atômica (tmp + rename + `.bak`), bloqueio de escrita em arquivo ilegível e edição de `settings.json` preservando comentários
- [x] 3.4 Implementar watcher com debounce e ignorar escritas próprias; emitir `config:changed`
- [x] 3.5 Implementar estrutura de migração por `version` e modo somente leitura para versões futuras
- [x] 3.6 Exibir no renderer o banner não bloqueante de erros de configuração, que some ao corrigir

## 4. Detecção de shells e perfis

- [x] 4.1 Implementar detectores de PowerShell 5.1, pwsh (todas as origens) e CMD com fs/env injetáveis (testes unitários com fakes)
- [x] 4.2 Implementar detector de Git Bash (registro, locais padrão, scoop, derivação a partir do `git.exe` no PATH)
- [x] 4.3 Implementar detector de WSL via registro Lxss com fallback `wsl -l -q` (decodificação UTF-16LE, filtro `docker-desktop*`) e leitura do shell padrão da distribuição para decidir a integração
- [x] 4.4 Mesclar perfis detectados + overrides + customizados; cores padrão por tipo; fallback do perfil padrão (testes)
- [x] 4.5 Cache da detecção em `state.json`, redetecção assíncrona e evento `profiles:changed`
- [x] 4.6 Validação de executável ao salvar perfil customizado (canal `profiles:save`)

## 5. Sessões de PTY e abas

- [x] 5.1 Implementar `PtyManager.create/write/resize/kill` com ConPTY, ambiente vindo do `EnvironmentService`, `envGeneration` por sessão e evento `pty:exit`
- [x] 5.2 Implementar batching de saída (5 ms / 64 KB) e controle de fluxo com `pty:ack`, pause/resume (teste: 100.000 linhas sem travar a UI)
- [x] 5.3 Criar `TerminalRegistry` e `TerminalHost` no renderer com xterm.js + addons fit, unicode11, webgl (fallback DOM), web-links e search
- [x] 5.4 Implementar barra de abas com ícone, cor e título (OSC 0/2), ativação e manutenção das instâncias ao trocar de aba
- [x] 5.5 Implementar menu de nova aba com os perfis visíveis
- [x] 5.6 Implementar `ActionRegistry` + atalhos (Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab) interceptados antes do PTY, com navegação circular; combinações não registradas seguem para o shell
- [x] 5.7 Implementar Ctrl+C com/sem seleção, Ctrl+Shift+C, Ctrl+V/Ctrl+Shift+V com bracketed paste
- [x] 5.8 Implementar redimensionamento com ResizeObserver + debounce e fit ao ativar aba/mudar fonte
- [x] 5.9 Implementar tela de processo encerrado (código de saída, Reiniciar/Fechar), fechamento automático no código 0, erro de inicialização e fechar a janela com a última aba
- [ ] 5.10 Teste manual/e2e de programas interativos: `npx create-vite@latest` (setas), `npm init`, barra de progresso do `npm install`, `vim`/`less` no WSL, Ctrl+C em `npm run dev`

## 6. Integração com o shell e ciclo de vida

- [ ] 6.1 Escrever `gunslinger.ps1` envolvendo `prompt` (OSC 9;9, 133;A/B/D com `$?`/`$LASTEXITCODE`), enviado via `-EncodedCommand`; validar com perfil contendo oh-my-posh e com política de execução `Restricted` no PowerShell 5.1
- [ ] 6.2 Escrever `gunslinger.bash` emulando login (`/etc/profile`, depois `~/.bash_profile`/`~/.bash_login`/`~/.profile` ou `~/.bashrc`), PROMPT_COMMAND, PS0, `cygpath`/`wslpath`; validar no Git Bash (prompt com branch preservado) e no WSL
- [x] 6.3 Montar argumentos/ambiente de integração por tipo de shell (incluindo `PROMPT` do CMD) e opção `shellIntegration` por perfil
- [x] 6.4 Registrar handlers OSC 9;9 e 133 no renderer; detecção de início por Enter quando não há 133;C; enviar `session:state`
- [x] 6.5 Implementar detecção de aba ocupada (integração ou `windows-process-tree`) e confirmação ao fechar aba
- [x] 6.6 Implementar kill da árvore (captura de descendentes, `pty.kill`, `taskkill /T /F` após 1,5 s e kill dos descendentes capturados) e fluxo `before-quit` com confirmação e espera de até 3 s
- [x] 6.7 Teste e2e: fechar aba e fechar app com `npm run dev` (Vite) e `dotnet watch` rodando libera as portas e não deixa processos órfãos

## 7. Recarregar ambiente

- [x] 7.1 Implementar `env:reload` (nova geração, `env:changed`, invalidação de caches de `tools/`, redetecção de shells)
- [x] 7.2 Marcar abas com geração antiga como "ambiente desatualizado" e implementar `pty:restart` (mesmo perfil e última pasta)
- [x] 7.3 Registrar a ação na paleta e nos avisos de ferramenta ausente; erro de leitura mantém o ambiente anterior
- [ ] 7.4 Teste manual: instalar Node com o app aberto, recarregar e verificar `node` em aba nova; trocar versão com nvm-windows

## 8. Comandos salvos

- [x] 8.1 Implementar `shared/variables.ts` (tokenizer, escape `{{ }}`, render) com testes, incluindo `{ $_.Name }`
- [x] 8.2 Definir o tipo `RunnableCommand` e o fluxo comum de execução (preflight → diálogo de variáveis → confirmação → envio)
- [x] 8.3 Implementar canais `commands:save/delete` e regras de categoria (renomear em massa, remoção de vazias)
- [x] 8.4 Implementar painel lateral recolhível (comandos salvos por categoria, filtro, persistência de estado/largura, atalho Ctrl+B)
- [x] 8.5 Implementar formulário de criar/editar/duplicar comando, com definição de variáveis (rótulo, padrão, opções) e confirmação de exclusão
- [x] 8.6 Implementar diálogo de variáveis com seletor de opções, validação de vazio, pré-visualização e cancelamento sem envio
- [x] 8.7 Implementar envio "Executar" e "Inserir" e resolução do terminal de destino (aba ativa, nova aba, aguardar primeiro prompt), pergunta de troca de pasta e aviso de terminal ocupado
- [x] 8.8 Implementar `shared/cd-command.ts` (PowerShell, CMD com `/d`, Git Bash, WSL, custom → aba nova) com testes de espaços, aspas e outros drives
- [x] 8.9 Implementar fallback de perfil de destino ausente (aviso, confirmação, alerta no painel, sem apagar a referência)
- [x] 8.10 Implementar comandos vinculados a projeto (visíveis só com o projeto ativo) e a pergunta "excluir ou tornar globais" ao excluir o projeto
- [x] 8.11 Teste: nenhuma rota (abrir app, importar, selecionar, aviso de ferramenta) envia comando sem ação explícita

## 9. Perfis de projeto

- [x] 9.1 Implementar canais `projects:save/delete` com validação da pasta raiz e modelo com `types`, `variables` e `packageManagerOverrides`
- [x] 9.2 Implementar varredura única da pasta (BFS 4 níveis, exclusões, assíncrona e cancelável) que alimenta os analisadores
- [x] 9.3 Implementar UI de cadastro de projeto com sugestão de tipos (.NET/Node) e variáveis editáveis
- [x] 9.4 Implementar "Abrir projeto" (aba vinculada, projeto ativo por aba, fallback quando o shell do projeto não existe) e "Reanalisar projeto"
- [x] 9.5 Implementar seção do projeto no painel com grupos por tipo lado a lado ("EF Core", "Node: <pacote>")
- [x] 9.6 Implementar resolução de variáveis de projeto em comandos salvos (pré-preenchidas e editáveis)

## 10. Suporte a .NET

- [x] 10.1 Implementar analisador .NET (heurísticas de Sdk.Web/Exe/EF Core, múltiplos candidatos) com testes em fixtures
- [x] 10.2 Implementar `shared/ef-commands.ts` (modelos e builder com flags condicionais e aspas) com testes
- [x] 10.3 Expor comandos EF no painel e na paleta, desabilitados sem projeto .NET ativo; confirmação em `migrations remove`
- [x] 10.4 Implementar preflight de SDK/`dotnet-ef` (global e manifesto local), sem bloquear: aviso com "Instalar", "Executar mesmo assim" e "Cancelar"; ignorado em abas WSL; cache só do resultado positivo

## 11. Suporte a Node.js

- [x] 11.1 Implementar analisador Node: pacotes por `package.json`, leitura de `scripts`, `name` e `packageManager`, com testes em fixtures (raiz, subpasta, monorepo)
- [x] 11.2 Implementar resolução do gerenciador (override → `packageManager` → lock subindo até a raiz → npm; vários locks → aviso) e versão do yarn, com testes
- [x] 11.3 Implementar `shared/node-commands.ts` (instalar, adicionar, adicionar dev, executar script, npx/dlx por gerenciador) com testes da tabela da spec
- [x] 11.4 Expor scripts e comandos prontos no grupo "Node: <pacote>" e na paleta, executando na pasta do pacote; "Inserir" permite acrescentar argumentos
- [x] 11.5 Implementar watcher das pastas dos pacotes (package.json e locks), debounce, `project:packagesChanged` e estado `stale` com JSON inválido
- [x] 11.6 Implementar preflight de `node` e do gerenciador, sem bloquear: aviso com "Executar mesmo assim", "Recarregar ambiente" e "Cancelar" e sugestão de `corepack enable`; ignorado em abas WSL (teste com Node só disponível via fnm no perfil do shell)
- [x] 11.7 Implementar escolha manual do gerenciador por pacote nas configurações do projeto

## 12. Barra de status

- [x] 12.1 Implementar componente de barra de status (projeto, pasta, Git, Node, .NET) ligado à aba ativa
- [x] 12.2 Implementar parser de `git status --porcelain=v2 --branch` (branch, detached, alterações) com testes
- [x] 12.3 Implementar consultas Git do `StatusService` (cache de repositório, fila, timeout 5 s com fallback para branch, `GIT_OPTIONAL_LOCKS=0`) e watchers do git dir com refcount
- [ ] 12.4 Suportar pastas WSL (`wsl.exe git -C`) e `/mnt/<drive>`
- [x] 12.5 Implementar regra de relevância (marcadores subindo a árvore + tipo do projeto) e consultas `node -v`/`dotnet --version` na pasta da aba, com cache por pasta e geração
- [x] 12.6 Ligar gatilhos: mudança de pasta, troca de aba, fim de comando, `env:changed`; ponto no título da aba quando há alterações; clique em "não encontrado" aciona "Recarregar ambiente"

## 13. Paleta de comandos

- [x] 13.1 Construir índice de itens (comandos salvos, scripts e comandos Node, EF, ações do `ActionRegistry`, perfis, projetos) e histórico de recentes
- [x] 13.2 Implementar busca fuzzy com normalização de acentos e pesos por campo, com destaque dos caracteres (testes de ranking)
- [x] 13.3 Implementar UI da paleta (Ctrl+P, setas, Enter, Shift+Enter, Esc, "Nenhum resultado") integrada ao fluxo comum de execução
- [x] 13.4 Medir atualização < 50 ms com 1.000 itens

## 14. Recursos do terminal

- [x] 14.1 Implementar handler de URLs e de hiperlinks OSC 8 com validação de esquema no main e cobertura de `localhost`, `127.0.0.1` e `[::1]` com porta
- [x] 14.2 Implementar link provider de arquivos (`:linha:col` e `(linha,col)`, `/` e `\`), resolução relativa à cwd, conversão WSL e validação em lote com cache
- [x] 14.3 Implementar abertura no editor por modelo de argumentos, tratamento de `.cmd` com escape e fallback `shell.openPath`
- [x] 14.4 Implementar barra de busca (Ctrl+F) com destaques, contador, opções (maiúsculas, palavra, regex) e tratamento de regex inválida
- [x] 14.5 Implementar notificação de comando demorado (limite configurável, apenas fora de foco, sucesso/erro, clique ativa a aba)

## 15. Tela de configurações

- [x] 15.1 Implementar tela de configurações (tema, fonte, cursor, scrollback, editor, perfil padrão, notificações, cópia com Ctrl+C) e ação "Abrir settings.json"
- [x] 15.2 Implementar editor de atalhos com detecção de conflitos, aviso de conflito com readline e aplicação ao vivo
- [x] 15.3 Criar o conjunto de ícones embutidos (PowerShell, CMD, Git Bash, Linux/WSL, Node, .NET, genéricos) e implementar editor de perfis (customizados e overrides de detectados: ocultar, cor, ícone embutido ou `.png`/`.ico`, args, pasta)
- [x] 15.4 Aplicar mudanças de tema/fonte em todas as abas abertas sem reiniciar

## 16. Importação e exportação

- [x] 16.1 Implementar schema do formato `gunslinger-export` v1 e exportação seletiva (por categoria, perfis customizados, projetos) com aviso de caminhos locais
- [x] 16.2 Implementar `transfer:previewImport` (validação, detecção de conflitos) e tela de prévia com texto completo dos comandos
- [x] 16.3 Implementar `transfer:applyImport` com decisões Substituir/Manter ambos/Ignorar (por item e em lote), perfis indisponíveis, `projectId` desconhecido virando global e `targetProfileId` desconhecido marcado
- [x] 16.4 Testes: arquivo inválido não altera nada; importação não envia nada a terminais

## 17. Qualidade e entrega

- [x] 17.1 Medir tempo de abertura (lançamento → primeiro prompt) e otimizar até < 2 s na máquina de referência
- [x] 17.2 Medir latência de eco (< 50 ms) e validar cores 16/256/24 bits, Unicode/emoji e programas de tela cheia
- [ ] 17.3 Executar checklist manual Windows 10 e 11: todos os shells, WSL, notificações, links, EF em projeto real, projeto misto .NET + React com npm, yarn e pnpm, nvm-windows/Volta/fnm
- [x] 17.4 Escrever README (instalação, configuração, integração com shell e como desligar, limitações de versão do Node com fnm) e registrar itens fora do escopo como backlog
