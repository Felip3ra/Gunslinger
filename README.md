# Gunslinger

Terminal desktop para Windows 10/11 feito para quem trabalha com .NET e Node.js: abas com PowerShell, CMD, Git Bash e WSL, comandos salvos com variáveis, comandos prontos de EF Core (`dotnet ef`) e dos scripts do `package.json`, e uma barra de status com branch do Git e versões do Node e do .NET.

## Instalação

Baixe e execute `Gunslinger-Setup.exe` (site e manual em [`site/`](site/README.md)). A instalação é por usuário (não pede administrador), cria o atalho no Menu Iniciar e mantém suas configurações ao desinstalar.

Para gerar o instalador a partir do código:

```bash
npm install
npm run dist        # instalador em dist/
```

Requisitos de desenvolvimento: Node.js 20+, npm e, para recompilar `@vscode/windows-process-tree`, o Visual Studio Build Tools com C++. O `node-pty` usa binários pré-compilados.

## Uso rápido

| Ação | Atalho padrão |
|---|---|
| Nova aba (perfil padrão) | Ctrl+T |
| Fechar aba | Ctrl+W |
| Próxima / anterior | Ctrl+Tab / Ctrl+Shift+Tab |
| Paleta de comandos | Ctrl+P |
| Buscar na saída | Ctrl+F |
| Painel lateral | Ctrl+B |
| Copiar / colar | Ctrl+Shift+C / Ctrl+Shift+V (Ctrl+C com seleção também copia) |
| Configurações | Ctrl+, (ou a engrenagem à direita das abas) |
| Buscar no histórico de comandos | Ctrl+Shift+H |
| Dividir painel à direita / abaixo | Alt+Shift+= / Alt+Shift+- |
| Próximo / anterior painel | Alt+→ / Alt+← |

Ctrl+W fecha o painel ativo (a aba fecha junto com o último painel); as divisórias entre painéis podem ser arrastadas. O menu ▾ ao lado do + abre uma aba com qualquer perfil. Ctrl+clique abre URLs no navegador e caminhos como `Program.cs(42,13)` ou `src/App.tsx:10:5` no editor.

> **Atenção, usuários de Bash/WSL:** Ctrl+W, Ctrl+T, Ctrl+P, Ctrl+F e Ctrl+B também são atalhos do readline (apagar palavra, trocar letras, histórico, mover o cursor). Por padrão o Gunslinger os usa para as ações acima. Para devolvê-los ao shell, troque-os em **Configurações → Atalhos** (por exemplo, Ctrl+Shift+W). A tela avisa quando uma combinação conflita com o readline.

## Docker e portas

**Docker e portas** (paleta) lista as portas TCP em escuta com o processo dono e, quando o processo nasceu de uma aba do Gunslinger, a aba (clique para ir até ela). **Encerrar processo** pede confirmação e encerra a árvore do processo. A seção de containers usa o CLI do Docker (`docker ps -a`): iniciar, parar, reiniciar, remover, e **Logs**/**Shell** abrem uma aba nova com `docker logs -f` ou `docker exec -it ... sh`. Sem Docker instalado ou com o daemon parado, o painel mostra o motivo. A lista se atualiza a cada 5 s.

## Executor de testes

Com um projeto aberto, **Executor de testes** (paleta) lista os projetos de teste .NET (xUnit, NUnit, MSTest) e os pacotes Node com Vitest ou Jest. Os testes rodam fora do terminal e o painel mostra aprovados, falhas e ignorados, com mensagem e stack trace (caminhos clicáveis), **Rodar só este**, **Rodar só as falhas**, cancelamento e a saída bruta. No Node, o app usa o script `test` do pacote com o reporter JSON do framework.

## Perfis de ambiente

Em **Configurações > Ambientes**, crie conjuntos de variáveis (por exemplo Dev, Homologação, Produção, com `ASPNETCORE_ENVIRONMENT` e connection strings). Na paleta:

- **Nova aba com ambiente: <nome>**: as variáveis entram no processo do shell (não aparecem no histórico).
- **Aplicar ambiente: <nome>**: digita `set`/`$env:`/`export` na aba ativa, com pré-visualização. Ambientes marcados como sensíveis pedem confirmação explícita.

A aba mostra o ambiente ativo com a cor dele, e a barra de status mostra o nome. Os valores ficam em texto puro no `settings.json`: evite guardar segredos de produção ali.

## Destaque de logs

Erros (vermelho), avisos (amarelo) e sucesso (verde) são destacados na saída: mensagens do MSBuild, níveis `fail:`/`warn:` do ASP.NET Core, `npm WARN`, resultados de testes. O destaque é só visual (copiar e buscar veem o texto original) e não age em programas de tela cheia. Ligue e desligue com **Alternar destaque de logs** na paleta, ou personalize em `settings.json`:

```jsonc
"logHighlight": {
  "enabled": true,
  "rules": [{ "pattern": "PEDIDO-\\d+", "ignoreCase": false, "foreground": "#58a6ff" }]
}
```

## Workspaces

Monte as abas e painéis do dia (por exemplo API + front + shell livre) e use **Salvar abas como workspace** na paleta. Depois, **Abrir workspace: <nome>** recria tudo, com perfis, pastas e projetos. Em **Gerenciar workspaces**, defina um comando inicial por painel (como `dotnet watch run` ou `npm run dev`); ao abrir, o app lista os comandos e só os executa depois da sua confirmação. Os workspaces ficam em `%APPDATA%\Gunslinger\workspaces.json`.

## Abas como administrador

No menu ▾ de nova aba, o botão **🛡 Admin** ao lado de PowerShell, CMD e Git Bash abre o shell elevado (também na paleta: "Nova aba como administrador"). A confirmação é sempre o UAC do Windows.

- Com o **sudo do Windows em modo inline** (Windows 11 24H2+: Configurações > Sistema > Para desenvolvedores > Habilitar sudo, ou `sudo config --enable normal` como administrador) ou com o **gsudo** instalado, a aba elevada fica dentro do Gunslinger, marcada com 🛡.
- Sem nenhum dos dois, o shell elevado abre numa janela separada do Windows.

## Plugins

Plugins são **só dados**: uma pasta em `%APPDATA%\Gunslinger\plugins\` com um `plugin.json` (aceita comentários). Nenhum código de plugin é executado. Contribuições de plugins aparecem junto com as suas, marcadas com o nome do plugin e sem editar/excluir; comandos seguem as mesmas regras de execução dos comandos salvos.

```jsonc
{
  "id": "kit-loja",            // minúsculas, números, "." e "-"
  "name": "Kit Loja",
  "version": "1.0.0",
  "description": "Atalhos do time",
  "contributes": {
    "commands": [{ "id": "db", "name": "Subir banco", "command": "docker compose up -d db" }],
    "workspaces": [{ "id": "full", "name": "Loja", "tabs": [{ "type": "pane", "pane": { "command": "npm run dev" } }] }],
    "profiles": [{ "id": "node", "name": "Node REPL", "executable": "node.exe" }],   // id final: plugin.kit-loja.node
    "themes": [{ "id": "escuro", "name": "Loja Escuro", "theme": { "background": "#101010", "foreground": "#e0e0e0", "cursor": "#ffffff", "selection": "#333333", "ansi": ["#000000", "..."] } }],
    "logHighlight": [{ "pattern": "PEDIDO-\\d+", "foreground": "#ff79c6" }]
  }
}
```

Em **Configurações > Plugins** ficam a lista, os erros de validação (chave desconhecida, `id` repetido, JSON inválido), ativar/desativar (`plugins.disabled` no `settings.json`), abrir a pasta e recarregar. Mudanças na pasta entram sem reiniciar. Temas de plugins aparecem em **Aparência > Aplicar tema** e são copiados para as suas cores.

## Cores

Em **Configurações > Aparência** dá para mudar as cores da interface (fundo, painéis, realce, borda, texto, texto secundário, destaque, erro, aviso e sucesso) e as do terminal (fundo, texto, cursor, seleção e as 16 cores ANSI). As cores de perfis e ambientes usam o mesmo seletor.

Clicar numa cor abre o seletor:

- campo **hexadecimal**, que aceita `#rrggbb`, `#rgb`, `rgb(18, 52, 86)` ou `18, 52, 86`;
- controles **R, G e B** (barra e número, de 0 a 255) e a prévia da cor atual ao lado da nova;
- a **paleta**: **+ Salvar cor** guarda a cor, o botão direito remove, um clique duplo aplica e **Restaurar paleta** volta às sugeridas.

A cor só é gravada em **Aplicar** (ou Enter no campo hexadecimal); Esc ou clicar fora descarta. As cores ficam em `appearance.ui`, `appearance.theme` e `appearance.palette` no `settings.json`, e **Restaurar cores padrão** volta a interface ao original.

## Configuração

Os arquivos ficam em `%APPDATA%\Gunslinger`:

| Arquivo | Conteúdo |
|---|---|
| `settings.json` | tema, fonte, atalhos, editor, perfil padrão, notificações e perfis de shell (aceita comentários) |
| `commands.json` | comandos salvos |
| `projects.json` | perfis de projeto |
| `workspaces.json` | workspaces |
| `history/` | snapshots do histórico de dados |
| `state.json` | estado interno (painel, recentes, cache de detecção), não editar |

Mudanças feitas direto nos arquivos são aplicadas sem reiniciar. Se um arquivo ficar inválido, o app continua abrindo com os valores padrão, mostra um aviso com a linha do erro e não grava nada nesse arquivo até você corrigi-lo (a versão anterior fica em `<arquivo>.bak`).

### Histórico de dados

A cada mudança em configurações, comandos, projetos ou workspaces (pela interface ou editando os arquivos), o Gunslinger guarda uma versão em `history/`, sem repetir estados iguais. Em **Configurações > Histórico** (ou **Histórico de dados** na paleta) dá para criar um ponto de restauração com nome, restaurar qualquer versão (o estado atual fica salvo como "Antes de restaurar") e excluir versões. Ficam as 50 versões automáticas mais recentes; pontos com nome só saem se você excluir. O histórico é local: nada é enviado para fora da máquina.

Editor padrão: VS Code (`code -g {file}:{line}:{column}`). Para outro editor:

```jsonc
"editor": { "command": "notepad++", "args": ["-n{line}", "{file}"] }
```

## Comandos salvos e projetos

- Variáveis no formato `{nome}` são pedidas antes de executar, com pré-visualização do comando final. `{{` e `}}` geram chaves literais, e trechos como `{ $_.Name }` do PowerShell não viram variáveis.
- **Executar** envia o comando com Enter; **Inserir** só digita o texto no prompt. Nada é executado sem uma dessas ações.
- Projetos (botão ◆ no painel) podem ser .NET, Node.js ou os dois. Para .NET, o app sugere `--project` e `--startup-project` e oferece os comandos de migrations; para Node, lista os scripts de cada `package.json` (inclusive em subpastas) usando o gerenciador detectado pelo campo `packageManager` ou pelo arquivo de lock (npm, yarn, pnpm ou bun).
- Perfis customizados aceitam um ícone embutido ou uma imagem `.png`, `.ico` ou `.svg` (até 256 KB), escolhida em **Escolher imagem…**.
- Projetos .NET com `Properties/launchSettings.json` ganham o grupo **Perfis de execução**: cada perfil do tipo Project vira `dotnet run` e `dotnet watch run` com `--launch-profile` (URLs e variáveis na descrição).
- **Importar/Exportar** (paleta) troca comandos, perfis customizados e projetos em JSON, com prévia e resolução de conflitos.

## Integração com o shell

Para saber a pasta atual de cada aba e quando um comando começa e termina (usado pela barra de status, pelos links relativos e pelas notificações), o Gunslinger injeta um trecho no prompt **sem alterar seus arquivos de perfil**:

- **PowerShell:** script enviado via `-EncodedCommand` depois do seu `$PROFILE`. Funciona com a política de execução `Restricted` e envolve o seu `prompt` (oh-my-posh e starship continuam funcionando).
- **Git Bash / WSL:** `bash --rcfile`, que carrega `/etc/profile` e o seu `~/.bash_profile`/`~/.profile`/`~/.bashrc` como num login.
- **CMD:** variável `PROMPT`.

Para desligar em um perfil, use `"shellIntegration": false` em `profiles.overrides.<id>` (perfis detectados) ou no perfil customizado. Sem integração, a aba usa a pasta inicial e não gera notificações de comando demorado.

## Recarregar ambiente

Quando um instalador ou o `setx` muda as variáveis de ambiente, o Windows avisa os programas abertos e o Gunslinger relê as variáveis do usuário e do sistema no Registro sozinho (só cria um ambiente novo se algo mudou de fato). Para mudanças que não avisam (como `reg add` ou nvm-windows), use **Recarregar ambiente** na paleta. Abas novas usam o ambiente novo; abas abertas mostram "ambiente desatualizado" na barra de status, com a opção de reiniciar.

Com o `fnm` por sessão (`fnm env --use-on-cd`), o PowerShell e o Bash informam a versão do Node ativa na aba, e a barra de status mostra essa versão.

## Sessão, histórico de comandos e processos

- **Última sessão:** ao abrir, o app reabre as abas e painéis que estavam abertos (perfil, pasta e projeto; nenhum comando é executado). Desligue em **Configurações > Terminal e editor**.
- **Histórico de comandos:** **Ctrl+Shift+H** busca nos comandos digitados em todas as abas. Enter escreve o comando no terminal ativo sem executar; Ctrl+Enter executa. Ficam os 500 mais recentes, sem repetição, no `state.json`. Comandos começados por espaço não são guardados; dá para desligar e limpar o histórico em **Configurações > Terminal e editor**.
- **Processos que saem da aba:** cada aba acompanha tudo o que o shell iniciou, inclusive processos que saem da árvore dela (`start`, servidores em segundo plano). Ao fechar a aba ou o app, os que continuam rodando são listados com **Encerrar** ou **Manter rodando**. A opção **Ao fechar uma aba…** troca para encerrar sempre ou manter sempre. Sair com `exit` mantém os processos.

## Atualizações

O app instalado procura versões novas nas releases do GitHub ao abrir e a cada 4 horas, baixa em segundo plano e mostra **Versão X pronta · Reiniciar** na barra de status. A instalação acontece ao reiniciar pelo botão ou na próxima vez que o app fechar. Em **Configurações > Sobre e atualizações** ficam a versão, **Procurar atualizações** e a opção de desligar a verificação automática.

Para publicar uma versão: `npm version 0.2.0` e `git push --follow-tags`. O workflow `release.yml` confere se a tag é igual à versão do `package.json`, gera o instalador e publica a release com o `latest.yml` que a atualização automática lê.

## Limitações conhecidas

- **fnm no CMD:** o CMD não tem como informar a versão do Node da sessão; a barra de status mostra a do ambiente do app.
- **WSL:** em pastas internas da distribuição, a barra de status mostra o Git (consultado pelo `git` do Linux), mas não mostra as versões de Node e .NET. Distribuições cujo shell padrão não é bash abrem sem integração.
- **Git Bash e emoji:** o console do MSYS não repassa caracteres fora do plano básico do Unicode (como emoji). Acentos e CJK funcionam; no CMD, PowerShell e WSL o emoji aparece normalmente.
- **ConPTY:** o app usa o ConPTY do sistema. O ConPTY embutido no node-pty descarta as sequências da integração com o shell.
- **Serviços e abas elevadas:** serviços do Windows não são filhos do shell, e o Gunslinger não acompanha os processos de abas como administrador; esses não entram na pergunta ao fechar a aba.
- **Assinatura:** o instalador não é assinado; o SmartScreen avisa no primeiro download ("Mais informações > Executar assim mesmo").
- Notificações do Windows dependem do atalho no Menu Iniciar criado pelo instalador; rodando via `npm run dev`, podem não aparecer.

## Desenvolvimento

Veja [CLAUDE.md](CLAUDE.md) para a estrutura e as regras do código, e [openspec/changes/add-gunslinger-mvp](openspec/changes/add-gunslinger-mvp) para a especificação do MVP. Trabalho futuro em [docs/BACKLOG.md](docs/BACKLOG.md).

```bash
npm run dev        # app com HMR
npm test           # unitários (Vitest)
npm run test:e2e   # build + Playwright
npm run lint && npm run typecheck
```

O VS Code define `ELECTRON_RUN_AS_NODE=1` no terminal integrado; remova a variável para rodar o Electron fora dos scripts de teste.
