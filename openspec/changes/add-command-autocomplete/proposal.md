## Why

O Gunslinger já guarda o histórico de comandos, os comandos salvos e os scripts e comandos de .NET/Node do projeto, mas só os oferece na paleta e na busca do histórico (Ctrl+Shift+H). Enquanto o usuário digita no prompt, nada disso aparece. O Termius sugere comandos direto no terminal; aqui as sugestões podem ser ainda melhores, porque o app conhece o projeto ativo.

## What Changes

- **Sugestão inline** (texto esmaecido depois do cursor) com o comando mais provável para o que já foi digitado, aceita com `→` ou `End` no fim da linha. Aceitar só digita o texto, nunca envia Enter.
- **Lista de sugestões** com `Ctrl+Space`: várias opções com a origem de cada uma (histórico, comando salvo, script do projeto, subcomando, arquivo), navegação por setas, `Tab`/`Enter` para inserir e `Esc` para fechar.
- **Fontes**: histórico de comandos (frequência, recência e mesma pasta), comandos salvos (com o diálogo de variáveis), scripts e comandos prontos do projeto ativo (npm/yarn/pnpm, `dotnet`, EF Core), subcomandos e opções comuns de `git`, `dotnet`, `npm`/`yarn`/`pnpm` e `docker`, branches do Git e caminhos da pasta atual.
- Funciona nas abas com integração de shell (onde o app sabe o que foi digitado no prompt); em programas interativos (`vim`, `htop`, prompts do `npm init`) fica desligado.
- Não briga com o shell: `Tab` continua sendo do shell fora da lista, e no PowerShell a sugestão inline vem desligada por padrão para não duplicar a previsão do PSReadLine.
- Configurações para ligar/desligar, escolher fontes e o atalho.

## Capabilities

### New Capabilities
- `command-autocomplete`: sugestões inline e em lista no prompt do terminal, fontes de sugestão, regras de quando aparecem e como são aceitas.

### Modified Capabilities
_Nenhuma._

## Impact

- **Shared**: ranqueamento das sugestões, especificações estáticas de subcomandos (`git`, `dotnet`, `npm`, `yarn`, `pnpm`, `docker`), separação da linha digitada em palavras (aspas e escapes por shell); tudo puro com testes.
- **Main**: canais `complete:paths` (lista da pasta, com limite) e `complete:gitBranches` (via `runTool` com o ambiente do `EnvironmentService` e timeout).
- **Renderer**: leitura da linha do prompt a partir do `ShellIntegrationTracker`, camada de sugestão inline e lista sobre o xterm (`terminal/autocomplete.ts` + componente), teclas no `keyboard.ts`, seção nas configurações do terminal.
- **Settings**: `terminal.autocomplete` (`enabled`, `inline` por shell, `sources`) e ação `terminal.suggest` em `defaultKeybindings`.
