## Why

Com o SSH dentro do Gunslinger (`add-ssh-hosts`), copiar um `appsettings.json`, baixar um log ou subir um build ainda exige o WinSCP ou um `scp` digitado à mão. Um navegador de arquivos ligado à mesma conexão fecha esse ciclo sem pedir a senha de novo.

## What Changes

- **Painel SFTP** com duas colunas: arquivos locais à esquerda e do servidor à direita, com navegação, caminho editável, ordenação, arquivos ocultos e atualização.
- **Transferências**: upload e download de arquivos e pastas (recursivo) por botão, arrastar entre as colunas ou arrastar do Explorer do Windows. Fila com progresso, velocidade, cancelamento e retomada após falha.
- **Conflitos**: substituir, pular, manter os dois (renomeia) ou "aplicar a todos".
- **Operações remotas**: criar pasta, renomear, excluir (com confirmação), editar permissões (chmod) e copiar o caminho.
- **Editar remoto no editor local**: baixa para uma pasta temporária, abre no editor configurado e oferece enviar de volta quando o arquivo é salvo.
- Abre a partir de uma aba SSH, do menu do host ou da paleta, reaproveitando a conexão do pool.

## Capabilities

### New Capabilities
- `sftp-browser`: navegação de arquivos remotos e locais, transferências com fila e conflitos, operações remotas e edição de arquivo remoto no editor local.

### Modified Capabilities
_Nenhuma._

## Impact

- **Depende de** `add-ssh-hosts` (pool de conexões, hosts, autenticação).
- **Shared**: planejamento de transferência recursiva e resolução de conflitos, formatação de permissões (`rwxr-xr-x` ↔ octal), junção de caminhos POSIX/Windows; tudo puro com testes.
- **Main**: `src/main/sftp/` (`SftpService` sobre o subsistema SFTP do `ssh2`, fila de transferências, observador de arquivos temporários); canais `sftp:*`.
- **Renderer**: fatia `sftp`, painel `SftpPanel.tsx` como novo tipo de painel do layout (`Tab.kind: 'sftp'`, salvo em workspaces e na sessão), fila de transferências e diálogos de conflito e permissões.
- **Portas**: `DesktopPort.trashItem` para mandar exclusões locais para a Lixeira.
- **Sistema**: grava em pasta temporária em `%TEMP%/Gunslinger/sftp-edit`, limpa ao fechar o painel.
