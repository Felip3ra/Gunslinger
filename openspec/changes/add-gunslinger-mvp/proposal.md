## Why

Desenvolvedores .NET que também trabalham com Node.js alternam o dia todo entre Git Bash, PowerShell, CMD e WSL e repetem à mão os mesmos comandos de Git, EF Core, npm/npx e Docker. As migrations do EF dependem do Package Manager Console, que só existe dentro do Visual Studio. O **Gunslinger** junta tudo num terminal desktop: troca de shell por abas, comandos salvos com variáveis e atalhos para projetos .NET (EF Core via `dotnet-ef`) e Node.js (scripts do `package.json`), sem depender do Visual Studio.

## What Changes

Projeto novo (greenfield). Não há código existente nem specs em `openspec/specs/`.

- **Aplicativo desktop** em Electron + TypeScript. O processo principal cuida de PTY, sistema de arquivos e configuração, e o renderer cuida da UI. Os dois conversam por IPC tipado, com `contextIsolation` ativado.
- **Perfis de shell**: detecção automática de PowerShell 5.1, PowerShell 7, CMD, Git Bash e WSL, além de perfis customizados (nome, executável, argumentos, pasta inicial, cor, ícone). Inclui a ação **Recarregar ambiente**, que relê o PATH e as variáveis de ambiente do sistema sem reiniciar o app (útil depois de instalar ou trocar a versão do Node com nvm-windows, fnm ou Volta).
- **Abas de terminal**: várias abas, cada uma com o seu shell. Atalhos Ctrl+T, Ctrl+W, Ctrl+Tab e Ctrl+Shift+Tab, menu de nova aba, cor de destaque por shell, redimensionamento correto, suporte completo a programas interativos (prompts com setas como `npx create-vite` e `npm init`, barras de progresso, Ctrl+C) e encerramento dos processos sem deixar órfãos (inclusive servidores `npm run dev`).
- **Comandos salvos**: CRUD organizado por categoria, variáveis `{nome}` com valor padrão e lista de opções, shell e pasta de destino opcionais, painel lateral recolhível. Nada é executado sem ação explícita do usuário.
- **Paleta de comandos** (Ctrl+P) com busca fuzzy em comandos salvos, scripts do projeto, comandos .NET/Node e ações do app.
- **Perfis de projeto**: nome, pasta raiz, shell padrão e variáveis. Um projeto pode ser .NET, Node.js ou os dois ao mesmo tempo, e os comandos de cada tipo aparecem lado a lado no painel.
- **Suporte a .NET**: detecção de `.sln` e `.csproj`, sugestão de `--project` e `--startup-project`, comandos prontos de EF Core via `dotnet ef` e aviso, com comando de instalação, quando o `dotnet-ef` não estiver instalado.
- **Suporte a Node.js**: detecção de `package.json` na raiz e em subpastas, scripts listados como comandos prontos, gerenciador de pacotes detectado pelo arquivo de lock (npm, yarn, pnpm), comandos prontos (instalar, adicionar pacote, adicionar pacote de desenvolvimento, npx), lista atualizada quando o `package.json` muda e aviso se o Node não estiver no PATH.
- **Barra de status**: projeto ativo, branch do Git e indicador de alterações, versão do Node e do .NET SDK quando forem relevantes, tudo atualizado quando a pasta, o repositório ou o ambiente mudam.
- **Recursos do terminal**: URLs clicáveis (inclusive `http://localhost:PORTA`), caminhos `arquivo:linha[:coluna]` abrindo no editor, busca na saída (Ctrl+F) e notificação do Windows quando um comando demorado termina com a janela fora de foco.
- **Configurações** em `%APPDATA%/Gunslinger/settings.json` (tema, fonte, atalhos, editor, perfil padrão). Um arquivo inválido não quebra o app: o erro aparece e os valores padrão são usados.
- **Importação e exportação** de comandos salvos, perfis de shell e perfis de projeto em JSON.

### Fora do escopo (trabalho futuro)

Divisão de tela (split panes), workspaces que abrem várias abas de uma vez (por exemplo API + front + shell livre), perfis de variáveis de ambiente (Dev/Homologação/Produção), integração com `launchSettings.json`, painel do Docker e gerenciador de portas, executor visual de testes (`dotnet test`, `npm test`), destaque de padrões de log, sincronização na nuvem, sistema de plugins e assistente de IA.

## Capabilities

### New Capabilities
- `app-platform`: base do app. Tempo de abertura, isolamento entre o processo principal e o renderer, encerramento limpo e caminho aberto para Linux/macOS.
- `shell-profiles`: detecção automática de shells, perfis customizados e recarga do ambiente do sistema.
- `terminal-tabs`: abas, atalhos, cor por shell, redimensionamento, programas interativos, ciclo de vida do processo e rastreamento da pasta atual.
- `saved-commands`: comandos salvos, categorias, variáveis, destino de execução e painel lateral.
- `command-palette`: paleta Ctrl+P com busca fuzzy em comandos, scripts e ações.
- `project-profiles`: cadastro de projetos, tipos (.NET, Node ou ambos), abertura, projeto ativo e variáveis de projeto.
- `dotnet-support`: detecção de `.sln`/`.csproj`, comandos de EF Core e verificação do `dotnet-ef`.
- `node-support`: detecção de `package.json`, scripts, gerenciador de pacotes, comandos prontos de Node e verificação do Node.
- `status-bar`: projeto ativo, status do Git e versões de Node e .NET SDK.
- `terminal-enhancements`: links clicáveis, busca na saída e notificação de comandos demorados.
- `settings`: `settings.json`, tema, fonte, atalhos, editor, perfil padrão e tolerância a configuração inválida.
- `data-import-export`: importação e exportação de comandos e perfis em JSON.

### Modified Capabilities
_Nenhuma: não há specs existentes._

## Impact

- **Código**: repositório novo com `src/main` (processo principal), `src/preload`, `src/renderer` (UI) e `src/shared` (contratos de IPC e tipos de configuração).
- **Dependências**: Electron, TypeScript, xterm.js (addons fit, web-links e search), node-pty (módulo nativo que precisa ser recompilado para a versão do Electron), React, validação de schema para a configuração e um empacotador para gerar o instalador do Windows.
- **Sistema**: grava arquivos em `%APPDATA%/Gunslinger`, lê variáveis de ambiente do Registro do Windows, inicia shells via ConPTY e chama `git`, `dotnet`, `node` e o editor configurado como processos externos.
- **Ferramentas externas opcionais**: Git, .NET SDK e `dotnet-ef`, Node.js (npm, yarn ou pnpm) e VS Code. O app precisa funcionar sem elas e só desativa os recursos que dependem de cada uma.

## Decisões

As dúvidas levantadas na proposta foram resolvidas assim. As specs, o design e as tarefas já seguem estas decisões.

**Comandos e projetos**
1. **Executar × Inserir**: "Executar" envia o texto com Enter. "Inserir" só digita o texto no prompt.
2. **Flags de EF**: todos os comandos de EF recebem `--project`/`--startup-project` quando o projeto as define.
3. **Variáveis de projeto**: são preenchidas sozinhas e aparecem na pré-visualização, onde podem ser editadas.
4. **Escopo dos comandos salvos**: globais por padrão, com vínculo opcional a um projeto. Comandos vinculados só aparecem com o projeto ativo, e excluir o projeto pergunta se os comandos são excluídos ou viram globais.

**Node.js**
5. **Gerenciador de pacotes**: escolha manual no projeto → campo `packageManager` → arquivo de lock (procurado até a raiz do projeto) → npm. Com vários arquivos de lock, usa npm e avisa.
6. **npx**: npm e yarn 1 usam `npx`, pnpm usa `pnpm dlx` e yarn 2+ usa `yarn dlx`.
7. **Subpastas e monorepos**: cada `package.json` (até 4 níveis, fora de `node_modules`) é um grupo próprio, e seus comandos rodam na pasta dele.
8. **Versão do Node**: consultada com o ambiente do app, na pasta da aba. Com fnm por sessão ela pode divergir da versão do shell; a limitação fica documentada.
9. **Relevância das versões**: Node aparece em projetos Node ou abaixo de um `package.json`; .NET aparece em projetos .NET ou abaixo de `.sln`, `.slnx`, `.csproj` ou `global.json`.
10. **Recarregar ambiente**: só abas novas usam o ambiente novo. As abertas mostram "ambiente desatualizado" e a opção "Reiniciar aba".

**Teclado**
11. **Atalhos**: Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+Shift+Tab, Ctrl+P, Ctrl+F e Ctrl+B são interceptados em todas as abas, mesmo onde conflitam com o Bash/readline. Todos são configuráveis, e a tela de atalhos avisa sobre esses conflitos.
12. **Ctrl+C**: copia se houver seleção e interrompe se não houver. Ctrl+Shift+C sempre copia, e Ctrl+V/Ctrl+Shift+V colam.

**Outros**
13. **Git**: aparece na barra de status, mais um ponto no título da aba quando há alterações.
14. **Integração com o shell**: scripts injetados na inicialização do PowerShell, do Bash e do CMD, sem alterar os arquivos de perfil do usuário, com opção de desligar por perfil.
15. **WSL**: um perfil por distribuição.
16. **Importação**: prévia com "Substituir", "Manter ambos" ou "Ignorar" para cada conflito.
17. **Ícones**: conjunto embutido mais caminho opcional para `.png`/`.ico`.
18. **Meta de abertura**: menos de 2 s até o primeiro prompt, numa máquina com 4 núcleos, 8 GB de RAM, SSD e Windows 10/11, com o perfil de shell padrão.
19. **Ferramenta ausente**: a verificação de `node`, gerenciador de pacotes e `dotnet-ef` avisa e oferece "Executar mesmo assim", sem bloquear, e não é feita em abas WSL.
20. **Instância única**: abrir o app de novo traz a janela existente para a frente.
21. **Tamanho da change**: o MVP continua numa única change, implementada na ordem de dependência das tarefas.
