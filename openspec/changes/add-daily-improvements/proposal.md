## Why

Pequenos atritos do dia a dia: o app sempre abre com uma aba só, mesmo que o usuário trabalhe com várias; não há como achar um comando digitado em outra aba; projetos com `bun` caem no npm; ícones de perfil por arquivo aparecem como um bloco de cor; e as configurações só abrem pelo atalho ou pela paleta.

## What Changes

- **Última sessão**: as abas e painéis abertos (perfil, pasta e projeto, sem comandos) são gravados e reabertos ao iniciar (`session.restore`, ligado por padrão).
- **Histórico de comandos**: os comandos digitados em todas as abas ficam guardados (até 500, sem repetição, sem os começados por espaço) e são buscados com **Ctrl+Shift+H**. Enter escreve o comando no terminal; Ctrl+Enter executa. Opção `terminal.commandHistory` e botão **Limpar histórico**.
- **bun** como quarto gerenciador de pacotes (`bun.lock`/`bun.lockb`, campo `packageManager`, `bun add --dev`, `bunx`).
- **Ícones de perfil por arquivo** (`.png`, `.ico`, `.svg`, `.jpg`, `.gif`, `.webp` até 256 KB), lidos pelo main e enviados como data URL; botão **Escolher imagem…** no formulário de perfil.
- **Botão de configurações** (engrenagem) fixo à direita da barra de abas.

A notificação de comando demorado já informava sucesso ou falha com o código de saída; nada muda nela.

## Capabilities

### New Capabilities
- `daily-improvements`: sessão, histórico de comandos, bun, ícones por arquivo e acesso às configurações.

### Modified Capabilities
_Nenhuma._

## Impact

`state.json` ganha `lastSession` e `commandHistory`; configurações ganham `session.restore` e `terminal.commandHistory`. IPC: `session:save` (ignorado durante o fechamento do app), `profiles:pickIcon`. `ShellProfile.iconData`. Ação `commandHistory.search`.
