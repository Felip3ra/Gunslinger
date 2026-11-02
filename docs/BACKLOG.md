# Backlog

Itens fora do escopo do MVP (`openspec/changes/add-gunslinger-mvp/proposal.md`), para changes futuras.

## Fora do escopo do MVP

Implementados em changes próprias (`openspec/changes/add-*`): divisão de tela, workspaces, perfis de ambiente, `launchSettings.json`, Docker e portas, executor de testes, destaque de logs, histórico de dados (no lugar da sincronização na nuvem) e plugins declarativos.

- **Sincronização entre máquinas** (serviço remoto ou pasta sincronizada); hoje o histórico é só local.
- **Plugins com código** (APIs de extensão); hoje plugins são só dados.
- **Assistente de IA**.

## Itens levantados durante a implementação

- Encerrar processos que se desligam da árvore (iniciados com `start`) com Job Objects (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`), via helper nativo.
- Versão do Node por sessão com fnm: o script de integração pode emitir a versão numa sequência OSC própria.
- Versões de Node/.NET em pastas internas do WSL (consultar as ferramentas do Linux).
- Recarregar o ambiente automaticamente ao receber `WM_SETTINGCHANGE`.
- Suporte a `bun` como quarto gerenciador de pacotes.
- Assinatura de código e atualização automática (electron-updater).
- Ícones de perfil por arquivo `.png`/`.ico` (hoje exibidos como um bloco da cor do perfil, por causa do CSP).
