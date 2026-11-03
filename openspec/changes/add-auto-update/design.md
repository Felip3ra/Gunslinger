## Context

O instalador é NSIS sem assinatura, publicado nas releases do GitHub com nome fixo (`Gunslinger-Setup.exe`). O `electron-updater` lê o `latest.yml` da release mais recente e funciona com instaladores não assinados quando `publisherName` não está configurado.

## Goals / Non-Goals

**Goals:** atualização sem ação do usuário além de reiniciar; publicação reproduzível pelo CI.
**Non-Goals:** canais beta, atualização no modo de desenvolvimento, assinatura de código (exige certificado pago).

## Decisions

- **Porta e serviço**: `UpdateService` (testável, sem Electron) controla o agendamento e os estados `unsupported | idle | checking | downloading | ready | error`; o adaptador traduz o `autoUpdater`. Fora do app instalado (`app.isPackaged` falso) o adaptador é null e o estado é `unsupported`.
- **Download automático**: `autoDownload` desligado no adaptador; o serviço baixa logo depois de encontrar a versão, para informar o progresso. A verificação manual sempre baixa.
- **Instalação**: `autoInstallOnAppQuit` instala ao fechar; o botão Reiniciar chama o fluxo de saída (confirmação de abas ocupadas, encerramento das árvores) e só então `quitAndInstall(silencioso, reabrir)`.
- **Erros**: mensagem curta (sem conexão, nenhuma versão publicada); o corpo HTTP do electron-updater não chega à UI.
- **CI**: a tag precisa ser igual à versão do `package.json`; `releaseType: release` publica direto (sem rascunho), para o link `releases/latest/download/...` do site funcionar na hora.

## Risks / Trade-offs

- Sem assinatura, o SmartScreen continua avisando no primeiro download; a atualização em si não passa pelo SmartScreen.
- Uma release publicada com defeito chega a todos em até 4 h: publicar uma correção é o caminho (não há rollback automático).
