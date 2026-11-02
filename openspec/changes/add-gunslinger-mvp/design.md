## Context

Projeto novo, sem código existente. A motivação está em `proposal.md` (Why) e o comportamento esperado está nas specs em `specs/`. Restrições que moldam o design:

- Windows 10 1809+ e 11 (primeira versão com ConPTY estável). Linux e macOS não podem ficar bloqueados.
- Electron + TypeScript, xterm.js e node-pty, que são escolhas do usuário.
- `contextIsolation` ligado e IPC tipado, com o processo principal como único dono de PTY, sistema de arquivos, ambiente e configuração.
- Meta de abertura abaixo de 2 s e digitação sem atraso perceptível.
- Vários comportamentos (pasta atual, fim de comando, notificação, barra de status) dependem de **integração com o shell** (Dúvida 14 da proposta).
- O ambiente do processo do Electron é congelado no momento em que o app abre. Ferramentas instaladas depois (Node, nvm, Volta) só aparecem com a recarga explícita do ambiente.

## Goals / Non-Goals

**Goals:**
- Arquitetura em três camadas (main, preload e renderer) com um contrato de IPC único e tipado em `src/shared`.
- Camada de plataforma com interface própria: Windows implementado agora, outras plataformas com fallback.
- Caminho de dados do PTY com lotes e controle de fluxo, para saídas volumosas não travarem a UI.
- Um único `EnvironmentService` como fonte do ambiente para shells e para as consultas do app.
- Detecção de projetos (.NET e Node) por "analisadores" independentes, que alimentam o mesmo modelo de comandos de projeto.
- Configuração tolerante a falhas, com validação por campo, gravação atômica e recarga ao vivo.
- Lógica pura (variáveis, montagem de comandos de EF e Node, parsers, detecção) testável sem Electron.

**Non-Goals:**
- Atualização automática, assinatura de código e loja de apps (fica para depois do MVP).
- Renderizador próprio de terminal ou parser de VT próprio: xterm.js cuida disso.
- Gerenciar versões do Node (instalar ou trocar): o Gunslinger só lê o ambiente que nvm-windows, fnm ou Volta deixaram.
- Workspaces do npm/yarn/pnpm como conceito próprio: cada `package.json` é tratado como um pacote independente.
- Os itens fora do escopo da proposta.

## Decisions

### 1. Estrutura do repositório e ferramentas

```
src/
  main/           processo principal (Node)
    index.ts        ciclo de vida do app, janela, encerramento
    ipc/            registro dos handlers, validação de argumentos
    pty/            PtyManager: sessões, lotes, controle de fluxo, kill da árvore
    platform/       PlatformAdapter (win32.ts, posix.ts)
    env/            EnvironmentService (ambiente atual, recarga, geração)
    shells/         detecção e montagem de perfis
    integration/    argumentos e ambiente para injetar a integração de shell
    config/         ConfigStore (load/validate/watch/write) e migrações
    projects/       ProjectService + analisadores (dotnet/, node/)
    status/         StatusService (git, versões de node e dotnet)
    tools/          execução de ferramentas externas com timeout e cache
    editor/         abertura de arquivo no editor configurado
  preload/index.ts  expõe window.gunslinger (API tipada) via contextBridge
  renderer/         React: App, Tabs, TerminalHost, Sidebar, Palette, StatusBar, dialogs, store
  shared/           ipc-contract.ts, schemas (zod), variables.ts, ef-commands.ts, node-commands.ts, tipos
resources/shell-integration/  gunslinger.ps1, gunslinger.bash
```

- **Build**: `electron-vite` (Vite para main, preload e renderer, com HMR no renderer) e `electron-builder` (instalador NSIS por usuário, sem admin). *Alternativa*: Electron Forge + webpack. Vite é mais rápido e mais simples para três alvos.
- **UI**: React 18 + zustand para o estado. *Alternativa*: HTML/CSS puro. Paleta, diálogos de variáveis, editores de perfil, projetos e comandos, barra de status e prévia de importação já formam UI suficiente para que componentes compensem. O custo de React na abertura (cerca de 40 KB gzip) cabe na meta.
- **Testes**: Vitest para `shared/` e para os módulos do main com dependências injetadas (fs, execução de processos, registro), e Playwright (`_electron`) para smoke tests e2e.

### 2. Processos e segurança do Electron

- **Instância única**: `app.requestSingleInstanceLock()` logo no início do main. A segunda execução encerra na hora, e a primeira recebe `second-instance`, restaura a janela e lhe dá foco. Isso garante um único dono dos arquivos JSON e dos watchers.

- `BrowserWindow` com `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` e `webSecurity: true`, além de uma CSP restritiva (`default-src 'self'`, sem `unsafe-eval`).
- `will-navigate` e `setWindowOpenHandler` bloqueiam toda navegação. URLs externas só abrem por `shell.openExternal`, depois de validar `http:` ou `https:` no main.
- O renderer nunca envia caminhos de executável ou ambiente para rodar: ele pede "abrir aba com o perfil X" ou "executar o comando de projeto Y", e o main resolve tudo a partir da configuração validada e do `EnvironmentService`.

### 3. Contrato de IPC tipado

O arquivo `src/shared/ipc-contract.ts` declara três mapas:

```ts
// requisição/resposta (ipcRenderer.invoke ↔ ipcMain.handle)
interface InvokeMap {
  'profiles:list': { req: void; res: ShellProfile[] };
  'profiles:save': { req: CustomProfile; res: SaveResult };        // valida o executável
  'profiles:delete': { req: { id: string }; res: void };
  'profiles:setOverride': { req: { id: string; override: ProfileOverride }; res: void };
  'pty:create': { req: { profileId: string; cwd?: string; projectId?: string; cols: number; rows: number }; res: { sessionId: string; envGeneration: number } };
  'pty:restart': { req: { sessionId: string }; res: { sessionId: string; envGeneration: number } };
  'pty:isBusy': { req: { sessionId: string }; res: boolean };
  'config:get': { req: void; res: ConfigSnapshot };               // settings + commands + projects + erros
  'settings:update': { req: { path: string[]; value: unknown }; res: SaveResult };
  'settings:openFile': { req: void; res: OpenResult };
  'commands:save': { req: SavedCommand; res: SaveResult };
  'commands:delete': { req: { id: string }; res: void };
  'commands:renameCategory': { req: { from: string; to: string }; res: void };
  'projects:save': { req: Project; res: SaveResult };
  'projects:delete': { req: { id: string; linkedCommands: 'delete' | 'makeGlobal' }; res: void };
  'projects:analyze': { req: { root: string }; res: ProjectAnalysis };   // tipos sugeridos, .NET e pacotes Node
  'tools:check': { req: { tool: 'dotnet' | 'dotnet-ef' | 'node' | 'npm' | 'yarn' | 'pnpm'; cwd: string }; res: ToolStatus };
  'env:reload': { req: void; res: { envGeneration: number } | { error: string } };
  'state:get': { req: void; res: UiState };                        // painel, recentes
  'state:patch': { req: Partial<UiState>; res: void };
  'fs:statMany': { req: { paths: string[] }; res: boolean[] };    // validação de links
  'editor:open': { req: { file: string; line?: number; column?: number }; res: OpenResult };
  'shell:openExternal': { req: { url: string }; res: void };
  'clipboard:read': { req: void; res: string };
  'clipboard:write': { req: { text: string }; res: void };
  'notify:longCommand': { req: { sessionId: string; command: string; durationMs: number; exitCode?: number }; res: void };
  'app:confirmQuit': { req: void; res: void };                    // disparado pelo before-quit
  'transfer:export': { req: ExportSelection; res: { path: string } | null };
  'transfer:previewImport': { req: void; res: ImportPreview | null };   // abre o diálogo de arquivo no main
  'transfer:applyImport': { req: { previewId: string; decisions: ConflictDecision[] }; res: ImportResult };
}
// fire-and-forget renderer→main (baixa latência)
interface SendMap { 'pty:write': { sessionId; data }; 'pty:resize': {...}; 'pty:ack': { sessionId; bytes };
                    'session:state': { sessionId; cwd?; commandRunning?; lastExitCode? };
                    'session:activate': { sessionId } }
// eventos main→renderer
interface EventMap { 'pty:data': { sessionId; data }; 'pty:exit': { sessionId; exitCode };
                     'config:changed': ConfigSnapshot; 'profiles:changed': ShellProfile[];
                     'status:changed': { sessionId; status: StatusInfo };    // git + versões
                     'project:packagesChanged': { projectId; packages: NodePackage[] };
                     'env:changed': { envGeneration: number };
                     'notification:clicked': { sessionId } }
```

- O preload expõe `window.gunslinger.invoke<K>(channel, req)`, `send<K>` e `on<K>`, tipados pelos mapas. Só os canais do contrato são aceitos (lista branca no preload).
- No main, `registerHandler(channel, zodSchema, fn)` valida `req` antes de executar e rejeita com um erro tipado. Os schemas zod ficam em `shared/schemas` e geram os tipos (`z.infer`), o que evita duplicação.
- *Alternativa*: tRPC ou electron-trpc. Daria uma camada a mais e dependências para um contrato pequeno, então foi descartado.

### 4. Caminho de dados do PTY e teclado

- **Saída**: o `PtyManager` acumula o `onData` de cada sessão e envia um lote a cada 5 ms ou ao chegar a 64 KB. **Controle de fluxo**: o renderer envia `pty:ack` com os bytes processados no callback de `term.write`. Com mais de 1 MB sem confirmação, o main chama `pty.pause()`, e retoma abaixo de 256 KB (mesma técnica do VS Code).
- **Entrada**: `term.onData` → `send('pty:write')`, sem `invoke`, para evitar ida e volta.
- **xterm.js**: addons `fit`, `web-links` e `search` (pedidos), mais `unicode11` (largura correta de emoji e CJK) e `webgl` (desempenho), com fallback automático para o renderizador DOM se o contexto WebGL for perdido.
- **Programas interativos**: o xterm.js já implementa modo de cursor de aplicação (DECCKM), tela alternativa, bracketed paste e relatórios de mouse. O ConPTY traduz isso para programas Windows nativos. O cuidado do app é **não interceptar** teclas além dos atalhos registrados. `macOptionIsMeta` e `altClickMovesCursor` ficam desligados, e Alt+tecla passa como ESC+tecla.
- **Atalhos**: `attachCustomKeyEventHandler` consulta o `ActionRegistry`. Combinações registradas são consumidas e não chegam ao PTY. Todo o resto vai para o xterm.js.
- **Ctrl+C / Ctrl+V** (Dúvida 12): o mesmo handler verifica `term.hasSelection()`. Com seleção, Ctrl+C copia e limpa a seleção; sem seleção, a tecla segue como `\x03`. Ctrl+Shift+C sempre copia. Ctrl+V e Ctrl+Shift+V usam `term.paste(clipboard)`, que respeita o bracketed paste. No Windows, `\x03` vira `CTRL_C_EVENT` pelo ConPTY para o grupo de processos em primeiro plano, inclusive `node` iniciado por `npm.cmd`.
- Cada aba guarda a sua instância `Terminal` fora da árvore React (mapa em um módulo `TerminalRegistry`), para trocar de aba sem recriar o terminal nem perder o histórico. Abas inativas ficam com `visibility: hidden`, e `fit()` roda ao ativar a aba.
- **Resize**: um `ResizeObserver` no container chama `fit()` com debounce de 50 ms e depois `send('pty:resize')`. Mudança de fonte também dispara `fit()`.
- **node-pty**: versão 1.1 (binários N-API pré-compilados) com `useConpty: true` e `useConptyDll: false`. O ConPTY embutido no node-pty (1.23) descarta as sequências OSC 9;9 e 133 da integração com o shell; o ConPTY do sistema as repassa. A versão 1.0 foi descartada porque exige compilar o winpty, que falha no Windows.

### 5. Ambiente e "Recarregar ambiente"

- O `EnvironmentService` guarda `{ env: Record<string,string>, generation: number }`. A geração 0 é o `process.env` do lançamento.
- **Recarga no Windows**: lê `HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment` e `HKCU\Environment` com `reg.exe query` (assíncrono) e expande `REG_EXPAND_SZ` (`%USERPROFILE%` etc.) com o próprio ambiente montado. A regra de combinação é a do Windows no login:
  - PATH = PATH da máquina + `;` + PATH do usuário;
  - as outras variáveis do usuário sobrescrevem as da máquina;
  - variáveis "voláteis" do processo que não estão no registro (`USERNAME`, `COMPUTERNAME`, `APPDATA`, `SystemRoot` etc.) são mantidas da geração atual.
- O resultado vira a geração `n+1` e é publicado com `env:changed`. Quem consome o ambiente (`PtyManager.create`, `tools/`, `StatusService`, `editor/`, detecção de shells) sempre pede o ambiente atual ao serviço, nunca ao `process.env`.
- Cada sessão de PTY guarda a `envGeneration` com que foi criada. O renderer marca como "ambiente desatualizado" as abas com geração menor que a atual. `pty:restart` encerra e recria a sessão com o mesmo perfil e a última pasta conhecida (Dúvida 10).
- **Por que o registro e não `cmd /c set`**: um processo filho herda o ambiente congelado do Electron, então só a leitura do registro reflete mudanças feitas por instaladores (Node, nvm-windows, Volta, fnm). O nvm-windows troca a versão por um symlink (`NVM_SYMLINK`), e o Volta usa shims que resolvem a versão por pasta. Em ambos o PATH não muda ao trocar de versão, então a versão nova já aparece no próximo `node -v`, e a recarga só é necessária quando o PATH em si mudou.
- *Alternativa*: escutar `WM_SETTINGCHANGE` para recarregar sozinho. Exige um módulo nativo e pode reiniciar coisas sem o usuário pedir. Fica para depois do MVP.

### 6. Detecção de shells (Windows)

O `PlatformAdapter.detectShells(env)` roda de forma **assíncrona** e cada detector é independente:

| Shell | Estratégia | Executável / args |
|---|---|---|
| PowerShell 5.1 | `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` | `-NoLogo` |
| PowerShell 7+ | `%ProgramFiles%\PowerShell\<ver>\pwsh.exe` (maior versão), `%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe` (Store), `~\.dotnet\tools\pwsh.exe`, busca no PATH | `-NoLogo` |
| CMD | `%ComSpec%` | — |
| Git Bash | Registro `HKLM`/`HKCU\SOFTWARE\GitForWindows\InstallPath`, depois `%ProgramFiles%\Git`, `%LOCALAPPDATA%\Programs\Git`, scoop, e por fim a raiz derivada de `git.exe` no PATH (`<raiz>\cmd\git.exe`) | `<raiz>\bin\bash.exe` (nunca `git-bash.exe`, que abre o mintty); argumentos na seção 7 |
| WSL | Registro `HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss\*\DistributionName`, com fallback para `wsl.exe --list --quiet` (**saída em UTF-16LE**). Distribuições `docker-desktop*` são ignoradas | `wsl.exe -d <distro> --cd <dir>` |

- IDs estáveis: `builtin.powershell`, `builtin.pwsh`, `builtin.cmd`, `builtin.gitbash` e `builtin.wsl.<distro>`. Os ajustes do usuário (`profiles.overrides[id]`) são aplicados por cima de cada detecção.
- **Abertura rápida**: o resultado da última detecção fica em `state.json`. A primeira aba abre com o perfil em cache (ou com `%ComSpec%`, que é instantâneo), e a nova detecção roda em segundo plano e envia `profiles:changed`. A detecção é refeita a cada recarga do ambiente.
- Cores padrão: PowerShell `#3b78ff`, pwsh `#2f6fd6`, Git Bash `#3fb950`, CMD `#8b949e` e WSL `#e95420`.

### 7. Integração com o shell (pasta atual e marcas de comando)

Sequências usadas: `OSC 9;9;<caminho Windows>` (pasta atual, formato do Windows Terminal) e `OSC 133;A/B/C/D[;exit]` (prompt, início e fim de comando). O Gunslinger **nunca altera** os arquivos de perfil do usuário. A injeção acontece só pelos argumentos e pelo ambiente da sessão, e pode ser desligada por perfil (`shellIntegration: false`).

- **PowerShell (5.1/7)**: `-NoLogo -NoExit -EncodedCommand <base64 UTF-16LE do script>`. O conteúdo de `gunslinger.ps1` é embutido no comando, e não carregado de um arquivo. Assim a política de execução não se aplica: no PowerShell 5.1 a política padrão do Windows cliente é `Restricted` e bloquearia um `.ps1`. Também não é preciso `-ExecutionPolicy Bypass`, que liberaria scripts do perfil do usuário que hoje ele não roda. O perfil do usuário continua sendo carregado antes. O script **envolve** a função `prompt` existente (compatível com oh-my-posh e starship) para emitir `133;D;<código>`, `9;9;$PWD`, `133;A` e, depois do prompt original, `133;B`. O código vem de `$?` e `$LASTEXITCODE`: `$LASTEXITCODE` é o código de programas nativos (como `npm`), e `$?` indica a falha de cmdlets.
- **Git Bash**: com integração, `bash.exe --rcfile <resources>/gunslinger.bash -i`. Como `--rcfile` não funciona junto com `--login`, o rcfile **emula o login**: carrega `/etc/profile` (que monta o PATH do MSYS e o prompt com a branch do Git) e depois o primeiro que existir entre `~/.bash_profile`, `~/.bash_login` e `~/.profile`, ou `~/.bashrc` se nenhum existir. Sem integração, `bash.exe --login -i`. O script adiciona ao `PROMPT_COMMAND` a emissão de `133;D;$?`, `9;9;$(cygpath -w "$PWD")` e `133;A`, e usa `PS0` para `133;C`.
- **WSL**: `wsl.exe -d <distro> --cd <dir> -- bash -c 'exec bash --rcfile "$(wslpath -u "<caminho Windows>")" -i'`. O script é copiado para `%APPDATA%\Gunslinger\integration\`, e o caminho é convertido dentro da própria distribuição (`wslpath -u`), o que funciona mesmo com raiz de montagem diferente de `/mnt`. O rcfile emula o login como no Git Bash (`/etc/profile` e depois `~/.profile` ou `~/.bashrc`). A pasta atual é enviada com `wslpath -w`, o que gera `\\wsl.localhost\<distro>\…` para pastas nativas do Linux. Na primeira detecção, o shell padrão da distribuição é lido com `wsl.exe -d <distro> -- sh -c 'getent passwd "$USER" | cut -d: -f7'`. Se não for bash, o perfil é criado com a integração desligada e abre com `wsl.exe -d <distro> --cd <dir>`.
- **CMD**: variável de ambiente `PROMPT=$e]9;9;$P$e\$e]133;A$e\$P$G`. O CMD não informa o código de saída nem o início do comando.
- **Início de comando sem `133;C`** (CMD): o renderer marca o início quando o usuário pressiona Enter depois de uma marca `133;A`.
- O parsing é feito **no renderer** com `term.parser.registerOscHandler` (robusto a sequências divididas entre lotes). O renderer envia `session:state` ao main, que usa esses dados para o `StatusService` e para as notificações.

### 8. Ciclo de vida dos processos

- **Busy** (para confirmar o fechamento): `commandRunning` vindo da integração. Para abas sem integração, o main consulta a árvore de processos com `@vscode/windows-process-tree` (módulo nativo, rápido) e considera a aba ocupada se houver descendentes do shell.
- **Kill**: antes de encerrar, o main **captura a lista de descendentes** com `windows-process-tree`, porque `npm.cmd` → `node` → `esbuild` formam uma cadeia, e o `node` do Vite pode ficar sem pai visível depois que o shell morre. Depois chama `pty.kill()`, que fecha o ConPTY e envia `CTRL_CLOSE_EVENT` aos processos do console. Depois de 1,5 s, `taskkill /PID <pid> /T /F` roda no shell, e `taskkill /PID <pid> /F` em cada descendente capturado que ainda existir.
- **Saída do app**: `before-quit` → consulta as abas ocupadas → confirmação → kill de todas as sessões em paralelo → espera de até 3 s → `app.exit()`. Em uma falha grave do main, os handles do ConPTY se fecham com o processo, e os filhos de console recebem o evento de fechamento.
- **Exit code 0** fecha a aba. Outros códigos mantêm a aba com "Reiniciar" e "Fechar" (spec terminal-tabs).

### 9. Configuração

- **Arquivos** em `app.getPath('userData')` (`%APPDATA%\Gunslinger`): `settings.json` (preferências e perfis de shell), `commands.json`, `projects.json` e `state.json` (estado interno de UI, recentes e cache de detecção, não documentado para edição).
- **Modelo** (resumo):

```jsonc
// settings.json
{ "version": 1,
  "defaultProfile": "builtin.pwsh",
  "appearance": { "fontFamily": "Cascadia Mono, Consolas, monospace", "fontSize": 14, "cursorStyle": "bar",
                  "scrollback": 10000,
                  "theme": { "background": "#0d1117", "foreground": "#c9d1d9", "cursor": "#58a6ff",
                             "selection": "#264f78", "ansi": ["#000000", "... 16 cores"] } },
  "editor": { "command": "code", "args": ["-g", "{file}:{line}:{column}"] },
  "notifications": { "longCommand": { "enabled": true, "thresholdSeconds": 10 } },
  "keybindings": { "tab.new": "Ctrl+T", "tab.close": "Ctrl+W", "tab.next": "Ctrl+Tab",
                   "tab.prev": "Ctrl+Shift+Tab", "palette.open": "Ctrl+P", "terminal.find": "Ctrl+F",
                   "sidebar.toggle": "Ctrl+B", "terminal.copy": "Ctrl+Shift+C", "terminal.paste": "Ctrl+Shift+V",
                   "env.reload": null },
  "terminal": { "copyOnCtrlCWithSelection": true },
  "profiles": {
    "overrides": { "builtin.powershell": { "hidden": true } },
    "custom": [ { "id": "uuid", "name": "Node REPL", "executable": "node.exe", "args": [],
                  "cwd": null, "color": "#43853d", "icon": "builtin:node", "shellIntegration": false } ] } }

// commands.json
{ "version": 1, "commands": [ { "id": "uuid", "name": "Nova branch", "command": "git switch -c {branch}",
    "description": "", "category": "Git", "targetProfileId": null, "cwd": null, "projectId": null,
    "variables": { "branch": { "label": "Nome da branch", "default": "feature/", "options": [] } } } ] }

// projects.json
{ "version": 1, "projects": [ { "id": "uuid", "name": "Loja", "rootPath": "C:\\src\\Loja",
    "defaultProfileId": "builtin.pwsh",
    "types": { "dotnet": true, "node": true },
    "variables": { "project": "src\\Loja.Infra\\Loja.Infra.csproj", "startupProject": "src\\Loja.Api\\Loja.Api.csproj" },
    "node": { "packageManagerOverrides": { "frontend": "pnpm" } } } ] }
```

- **Referências entre arquivos** (nenhuma é apagada sozinha):
  - `commands[].targetProfileId` e `projects[].defaultProfileId` apontando para um perfil que não existe → o perfil padrão é usado depois de um aviso, e o item mostra o alerta no painel;
  - `commands[].projectId` → excluir o projeto pergunta "excluir comandos" ou "tornar globais" (`projectId = null`) e grava os dois arquivos em sequência, com `commands.json` primeiro;
  - na importação, `projectId` desconhecido vira `null` e `targetProfileId` desconhecido é mantido e marcado;
  - `profiles.overrides` de perfis detectados que deixaram de existir (por exemplo, uma distribuição WSL renomeada) ficam guardados e não aparecem na UI.
- Os pacotes Node e os projetos .NET encontrados **não** são gravados em `projects.json`. Eles são recalculados ao abrir o projeto, para não ficarem desatualizados. Só as escolhas do usuário (tipos, variáveis, gerenciador forçado) são persistidas.
- **Leitura**: `jsonc-parser` (aceita comentários e informa linha e coluna dos erros). Depois, validação **por campo** com zod: cada campo inválido vira o valor padrão e gera um `ConfigIssue { file, path, line?, message }`. Se o JSON não puder ser lido, o arquivo inteiro usa os padrões e fica marcado como `readOnlyUntilFixed`, e as gravações da UI nesse arquivo são recusadas (spec settings).
- **Gravação**: escrever em `<arquivo>.tmp`, fazer `fsync` e depois `rename` (substituição atômica no NTFS). Antes de sobrescrever, a última versão válida é copiada para `<arquivo>.bak`. Para o `settings.json`, edições feitas pela UI usam `jsonc-parser.modify`, o que preserva os comentários do usuário.
- **Recarga**: `fs.watch` na pasta, com debounce de 200 ms. As gravações do próprio app são ignoradas por hash do conteúdo.
- **Migrações**: `migrations[version]` é aplicado ao carregar. Arquivos com `version` maior que a suportada são abertos em modo somente leitura, com aviso.

### 10. Comandos salvos e variáveis

- **`shared/variables.ts`**: o tokenizer usa `/\{\{|\}\}|\{([A-Za-z_][A-Za-z0-9_]*)\}/g`, e o resultado é `{ text, variables: string[] }` mais `render(values)`. Assim, `{ $_.Name }` do PowerShell fica como texto e `{{`/`}}` viram chaves literais. Os valores **não** recebem aspas automaticamente. Os modelos embutidos colocam aspas onde for preciso (`"{project}"`), e a prévia mostra o texto exato que será enviado.
- **Ordem de resolução**: variáveis do projeto ativo → `default` da variável → entrada do usuário. O diálogo mostra todas as variáveis, com as do projeto já preenchidas (Dúvida 3).
- **Envio**: "Inserir" usa `term.paste(text)` (respeita o bracketed paste e converte `\n`). "Executar" faz `paste` e depois envia `\r`. Numa aba nova, o envio espera a primeira marca `133;A` ou, sem integração, 300 ms sem saída (com teto de 5 s).
- **Troca de pasta por shell** (`shared/cd-command.ts`, função pura com testes). O tipo de shell vem do perfil (`powershell`, `cmd`, `gitbash`, `wsl`, ou `custom`):

| Shell | Comando | Caminho |
|---|---|---|
| PowerShell | `Set-Location -LiteralPath '<p>'` (aspas simples duplicadas no caminho) | Windows |
| CMD | `cd /d "<p>"` | Windows |
| Git Bash | `cd '<p>'` (`'` vira `'\''`) | `C:\a b` → `/c/a b` |
| WSL | `cd '<p>'` | `C:\x` → resultado de `wslpath -u` (consultado uma vez por distribuição para descobrir a raiz de montagem); `\\wsl.localhost\<distro>\home\u` → `/home/u` |
| custom | não digita nada: abre uma aba nova com `cwd` | — |

  A pergunta de troca de pasta só aparece quando a pasta atual da aba é conhecida e diferente. Sem integração (pasta desconhecida), o app pergunta sempre.
- **Comandos de projeto e perfil de destino**: comandos de EF e de Node não têm perfil de destino próprio. Eles vão para a aba ativa se ela estiver vinculada ao projeto; se não estiver, para uma aba nova com o shell padrão do projeto.
- **Modelo único de comando executável**: comandos salvos, scripts, comandos de Node e de EF viram um `RunnableCommand { id, source, title, text, cwd?, targetProfileId?, variables, confirm?, preflight? }`. Painel, paleta e diálogo de variáveis só conhecem esse tipo. `preflight` aponta para a verificação de ferramenta (`dotnet-ef`, `node`, gerenciador de pacotes) que roda antes do diálogo. O preflight **nunca bloqueia**: se a ferramenta não for encontrada, o diálogo de aviso oferece "Executar mesmo assim", "Recarregar ambiente" (ou "Instalar", no caso do `dotnet-ef`) e "Cancelar". Isso acontece porque o PATH do shell pode ter ferramentas que o app não vê (fnm, ativação feita pelo perfil do shell). O preflight é pulado quando a aba de destino é WSL. O resultado positivo fica em cache por geração de ambiente, e o negativo é verificado de novo a cada tentativa.
- **IDs estáveis para itens gerados**: scripts usam `node:<projectId>:<pasta relativa>:<script>`, comandos de Node usam `nodecmd:<projectId>:<pasta>:<tipo>` e comandos de EF usam `ef:<projectId>:<tipo>`. Os "recentes" da paleta usam esses IDs.

### 11. Projetos e analisadores

- O `ProjectService.analyze(root)` percorre a pasta **uma vez** (busca em largura, até 4 níveis, ignorando `bin`, `obj`, `node_modules` e pastas iniciadas por `.`) e entrega os arquivos aos analisadores `dotnet` e `node`. Cada analisador devolve `{ detected: boolean, ... }`, e o resultado é usado para sugerir os tipos e montar os grupos do painel.
- **Analisador .NET**: lê cada `.csproj` como texto (regex no atributo `Sdk`, em `PackageReference Include="Microsoft.EntityFrameworkCore` e em `<OutputType>Exe`). Não é preciso parser XML completo. Sugere `project` e `startupProject` (spec dotnet-support).
- **`shared/ef-commands.ts`**: modelos embutidos (não ficam no `commands.json`, então atualizações do app chegam a todos) e o builder `buildEfCommand(kind, projectVars)`, que adiciona `--project` e `--startup-project` só quando estão definidos (Dúvida 2). `migrations remove` sempre pede confirmação.
- **Analisador Node**: para cada `package.json`, lê `name`, `scripts` e `packageManager`. O gerenciador é resolvido como na spec node-support: override → `packageManager` → arquivo de lock subindo até a raiz → npm. Para yarn, a versão principal vem de `packageManager` ou da presença de `.yarnrc.yml` (yarn 2+) e decide entre `npx` e `yarn dlx` (Dúvida 6).
- **`shared/node-commands.ts`**: tabela de modelos por gerenciador (instalar, adicionar, adicionar como dev, executar script, npx) e o builder `buildNodeCommand(kind, pm, args)`. O nome de script é passado sem aspas quando casa com `^[\w:.-]+$`, e com aspas quando não casa.
- **Atualização de `package.json`**: o `ProjectService` observa, com `fs.watch` não recursivo, **as pastas** dos pacotes conhecidos (editores salvam via rename, o que quebra o watch direto no arquivo) e filtra `package.json` e os arquivos de lock. Usa debounce de 300 ms, faz um novo parse e envia `project:packagesChanged`. Com JSON inválido, mantém a última versão válida, marcada como `stale`. Pastas novas só são descobertas em "Reanalisar projeto" ou ao reabrir o projeto, porque observar a raiz inteira de forma recursiva inundaria o watcher com eventos de `node_modules`.
- **Verificação de ferramentas** (`tools/`): `dotnet --version`; `dotnet tool list --global` e, se houver `.config/dotnet-tools.json`, `dotnet tool list --local`; `node -v`; `<pm> --version`. Tudo roda com o ambiente atual e timeout de 10 s, e o cache é invalidado quando muda a geração do ambiente.

### 12. Barra de status

- O `StatusService` mantém um `StatusInfo { git?, node?, dotnet? }` por sessão e recalcula quando chega `session:state` com pasta nova, `session:activate`, fim de comando (`133;D`), `env:changed` ou uma mudança observada no git dir.
- **Git**: `git rev-parse --show-toplevel --git-dir` (com cache por pasta) e `git status --porcelain=v2 --branch --untracked-files=normal`, com `GIT_OPTIONAL_LOCKS=0` (não disputa o `index.lock`) e timeout de 5 s. Se der timeout, cai para `git symbolic-ref --short HEAD` (só a branch). Os watchers do git dir (`HEAD`, `index`, `refs/`) usam debounce de 300 ms e são compartilhados por repositório com contagem de referências. Fica no máximo uma consulta em andamento por repositório.
- **WSL**: pastas `\\wsl.localhost\…` são consultadas com `wsl.exe -d <distro> git -C <caminho linux> …` (o Git do Windows sobre UNC é lento e esbarra em `safe.directory`). Pastas `/mnt/<drive>` usam o Git do Windows sobre o caminho convertido. As versões de Node e .NET não são mostradas para pastas nativas do WSL no MVP.
- **Relevância** (Dúvida 9): subir da pasta atual até a raiz do disco procurando `package.json` (Node) e `.sln`/`.slnx`/`.csproj`/`global.json` (.NET), com cache por pasta. O tipo do projeto ativo também conta como relevante.
- **Versões**: `node -v` e `dotnet --version` executados **na pasta da aba** (`cwd`), para respeitar `global.json` e os shims do Volta. O cache é por `(pasta mais próxima com marcador, geração do ambiente)`, e o fim de comando invalida o cache só da aba ativa, com debounce de 1 s. Com fnm em `--use-on-cd`, a versão ativa dentro do shell pode ser diferente da mostrada (Dúvida 8). A limitação é documentada.

### 13. Paleta de comandos

- O índice é montado no renderer a partir da configuração, dos `RunnableCommand` do projeto ativo e das ações registradas (`ActionRegistry`, onde cada ação tem id, título, atalho e `run`). Os atalhos de teclado e a paleta usam o mesmo registro, o que garante consistência.
- **Busca**: `fuzzysort`, com o texto normalizado (`NFD` sem diacríticos e em minúsculas) e pesos: nome ×1, categoria/origem e descrição ×0,6, texto do comando ×0,4. "Recentes" ficam em `state.json`.

### 14. Links, busca e notificações

- **URLs**: addon `web-links` com handler que chama `shell:openExternal`, e o main só aceita `http` e `https`. Os hiperlinks OSC 8 passam pelo `linkHandler` do xterm.js, com a mesma validação de esquema. A regex padrão do addon já cobre `http://localhost:5173/`. Uma regex própria cobre `http://[::1]:PORTA` e endereços sem barra final.
- **Arquivos**: um `ILinkProvider` próprio, com regex para `caminho(:linha(:col)?)` e `caminho(linha,col)` (formato do MSBuild e do `tsc`), aceitando `/` e `\`. Os caminhos candidatos de cada linha visível são resolvidos em relação à pasta da aba e validados em lote por `fs:statMany` (cache LRU de 30 s). Caminhos WSL são convertidos pelo adaptador de plataforma.
- **Editor**: `args` com os marcadores `{file}`, `{line}` e `{column}`, executado **sem shell**. Se o executável resolvido for `.cmd` ou `.bat` (caso do `code`), o main chama `cmd.exe /d /s /c` com cada argumento escapado. O caminho já foi validado como arquivo existente, o que limita injeção. Se o editor falhar, o main usa `shell.openPath` como alternativa.
- **Busca**: addon `search` com `decorations` para destacar todas as ocorrências e o contador "n de m". Regex inválida é capturada e mostrada como erro na barra.
- **Notificação**: o renderer calcula a duração (de `133;C` ou Enter até `133;D`) e pede `notify:longCommand` ao main. O main verifica `!win.isFocused()` e o limite configurado e mostra uma `Notification` do Electron. O clique chama `win.show()` e `focus()` e envia `notification:clicked`. É preciso chamar `app.setAppUserModelId('com.gunslinger.app')`, e o instalador cria o atalho no Menu Iniciar (sem ele, toasts podem não aparecer no Windows).

### 15. Importação e exportação

- **Formato**: `{ "format": "gunslinger-export", "version": 1, "exportedAt": "...", "commands": [], "profiles": [], "projects": [] }`, validado por zod.
- **Importação em duas fases**: `transfer:previewImport` devolve itens e conflitos (por id, ou por nome dentro da mesma categoria/tipo) sem gravar nada. `transfer:applyImport` recebe as decisões e grava atomicamente. O fluxo nunca toca em PTYs.

### 16. Camada de plataforma

`PlatformAdapter { detectShells(env); fallbackShell(); configDir(); readSystemEnvironment(); killTree(pid, descendants); listDescendants(pid); toHostPath(p, session); openEditor(...) }`. O `win32.ts` é completo. O `posix.ts` usa `$SHELL`, `kill -TERM -pgid`, caminhos POSIX e `readSystemEnvironment()` que devolve o ambiente atual sem mudanças, e serve só como fallback mínimo para o app abrir. Nenhum código fora de `platform/` pode testar `process.platform`.

## Risks / Trade-offs

- [node-pty é nativo e depende da ABI do Electron] → fixar as versões, rodar `electron-rebuild` no `postinstall` e fazer um teste e2e que abre um PTY na CI do Windows.
- [A integração com o shell pode conflitar com prompts customizados (oh-my-posh, starship, clink)] → envolver o `prompt` em vez de substituir, permitir desligar por perfil e degradar como descrito nas specs. A política de execução do PowerShell não afeta a integração, porque o script vai embutido em `-EncodedCommand`.
- [O preflight não bloqueia, então um comando pode ser enviado sem a ferramenta] → o próprio shell mostra o erro "comando não encontrado". O aviso prévio continua servindo de orientação.
- [Atalhos com Ctrl puro (W, T, P, F) roubam teclas do readline no Bash e no WSL] → todos são configuráveis, o conflito está registrado na Dúvida 11, e a tela de atalhos avisa quando uma combinação também é usada pelo readline.
- [`npm run dev` pode deixar o `node` vivo depois de `taskkill /T`, se ele perdeu o pai] → capturar os descendentes **antes** de matar o shell e encerrar cada PID capturado; teste e2e verificando que a porta fica livre.
- [`taskkill /T` não alcança processos que se desligaram da árvore (por exemplo, iniciados com `start`)] → aceito no MVP. Avaliar Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`) com um helper nativo depois.
- [A recarga de ambiente pelo registro pode não reproduzir exatamente o ambiente de um login novo (variáveis definidas por scripts de logon ou GPO)] → manter as variáveis voláteis do processo, mostrar a origem do PATH num diagnóstico e documentar a limitação.
- [A versão do Node mostrada pode divergir da usada no shell com fnm por sessão] → limitação documentada (Dúvida 8). Se for importante, o script de integração pode emitir a versão numa sequência OSC própria.
- [Monorepos grandes deixam a varredura lenta] → limite de 4 níveis, exclusões, varredura assíncrona e fora da abertura do app, e cancelamento quando o projeto é fechado.
- [Repositórios grandes deixam o `git status` lento] → timeout de 5 s, fila por repositório, `GIT_OPTIONAL_LOCKS=0` e queda para só a branch.
- [A meta de 2 s pode estourar com React, xterm, detecção e análise de projetos] → tudo isso roda de forma assíncrona e com cache, nenhuma operação síncrona de I/O no main durante a abertura, `import()` sob demanda de editores, paleta e import/export, e medição automatizada (`performance.mark` do lançamento até o primeiro `133;A` ou primeira saída).
- [Abrir `code.cmd` exige passar pelo `cmd.exe`, com risco de injeção] → só abrir caminhos validados como arquivos existentes, escapar cada argumento e recusar caracteres de controle.
- [Notificações do Windows dependem do AppUserModelID e do atalho no Menu Iniciar] → configurar no instalador. Em modo dev, documentar que toasts podem não aparecer.
- [WebGL pode falhar em VMs ou drivers antigos] → fallback automático para o renderizador DOM.

## Migration Plan

Projeto novo, sem migração de dados. Distribuição: instalador NSIS por usuário (`%LOCALAPPDATA%\Programs\Gunslinger`), sem privilégios de administrador. A desinstalação mantém `%APPDATA%\Gunslinger`. O campo `version` de cada arquivo permite migrações em versões futuras, e um `.bak` é mantido antes de cada migração.

## Open Questions

As dúvidas que mudavam o comportamento foram resolvidas e estão na seção **Decisões** de `proposal.md`. As referências "Dúvida N" neste documento apontam para os itens de mesmo número dessa seção. Restam só dúvidas que podem esperar sem afetar specs ou tarefas:

- Ícone e identidade visual do Gunslinger.
- Certificado de assinatura de código (afeta só o aviso do SmartScreen na instalação).
- Atualização automática (electron-updater) depois do MVP.
- Suporte a `bun` (`bun.lockb`/`bun.lock`) como quarto gerenciador de pacotes.

## Notas de implementação

Ajustes feitos durante a implementação, em relação às decisões acima:

- **ConPTY do sistema** (`useConptyDll: false`): o ConPTY embutido no node-pty 1.1 descarta as sequências OSC 9;9 e 133. Ver seção 4.
- **Confirmação de saída no main**: o fechamento com abas ocupadas usa o diálogo nativo do Electron (`dialog.showMessageBox`), sem ida e volta ao renderer; os canais `app:confirmQuit`/`app:quitConfirmed` foram removidos do contrato.
- **"Ocupado" com integração**: quando o shell já emitiu marcas da integração, o estado ocupado vem só delas. O `bin\bash.exe` do Git é um lançador que sempre tem um processo filho, o que daria falso positivo pela árvore de processos.
- **Status do Git e árvore de trabalho**: além do git dir, o `StatusService` observa a árvore de trabalho de forma recursiva (ignorando `.git`, `node_modules`, `bin` e `obj`), para refletir arquivos salvos por outros programas sem passar pelo índice.
- **Texto do comando para notificações**: lido do buffer no fim do comando (seguindo linhas quebradas), porque no Enter o eco das últimas teclas pode ainda não ter chegado.
- **`projects:analyze` com `projectId` opcional**: liga a observação dos `package.json` do projeto aberto.
- **`editor:open` com `useDefaultApp`**: alternativa "abrir com o programa padrão" quando o editor falha.
- **Ações `data.import`/`data.export`** no registro de ações (sem atalho padrão), o que as coloca também na paleta.
- **Git Bash e emoji**: o MSYS não repassa caracteres fora do BMP pelo console; limitação documentada no README.
