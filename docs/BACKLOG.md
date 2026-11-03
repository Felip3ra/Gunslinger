# Backlog

Itens fora do escopo do MVP (`openspec/changes/add-gunslinger-mvp/proposal.md`), para changes futuras.

## Fora do escopo do MVP

Implementados em changes próprias (`openspec/changes/add-*`): divisão de tela, workspaces, perfis de ambiente, `launchSettings.json`, Docker e portas, executor de testes, destaque de logs, histórico de dados (no lugar da sincronização na nuvem), plugins declarativos, atualização automática, ciclo de vida dos processos (Job Objects, fnm por sessão, `WM_SETTINGCHANGE`) e melhorias do dia a dia (última sessão, histórico de comandos, bun, ícones por arquivo).

- **Sincronização entre máquinas** (serviço remoto ou pasta sincronizada); hoje o histórico é só local.
- **Plugins com código** (APIs de extensão); hoje plugins são só dados.
- **Assistente de IA**.

## Itens levantados durante a implementação

- Versões de Node/.NET em pastas internas do WSL (consultar as ferramentas do Linux).
- Assinatura de código (certificado; hoje o SmartScreen avisa no primeiro download).
- Versão do Node por sessão no CMD (sem hook de prompt) e processos de abas elevadas no rastreamento.
