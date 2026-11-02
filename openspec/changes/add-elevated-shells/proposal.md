## Why

Tarefas como instalar ferramentas globais, mexer em serviços do Windows, no IIS ou no arquivo `hosts` exigem um shell elevado. Hoje o usuário precisa sair do Gunslinger e abrir outro terminal como administrador.

## What Changes

- Abrir uma aba de PowerShell, CMD ou Git Bash **como administrador**, pelo menu de nova aba e pela paleta.
- Estratégia, nesta ordem: **sudo do Windows** em modo inline (Windows 11 24H2+, quando habilitado) ou **gsudo**, que mantêm a aba elevada dentro do Gunslinger; sem nenhum dos dois, o shell elevado abre numa **janela separada do Windows**, e o app explica como habilitar o sudo.
- A aba elevada fica marcada (escudo no título e "Administrador" na barra de status).
- A integração com o shell continua funcionando na aba elevada (no CMD, o prompt vai por argumento, porque variáveis de ambiente podem não atravessar a elevação).

## Capabilities

### New Capabilities
- `elevated-shells`: abas e janelas elevadas, detecção do mecanismo disponível e identificação visual.

### Modified Capabilities
_Nenhuma._

## Impact

- Main: `ElevationService` (detecção de sudo/gsudo), elevação aplicada na montagem da linha de comando do PTY, canal para a janela externa.
- Renderer: menu de nova aba, ações na paleta, marca visual na aba e na barra de status.
- Sem dependências novas. O UAC continua sendo do Windows: o app nunca contorna a confirmação.
