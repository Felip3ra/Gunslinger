## Purpose

Mantém o Gunslinger instalado na versão mais recente publicada nas releases do GitHub.

## ADDED Requirements

### Requirement: Verificação e download automáticos
Com `updates.auto` ligado, o app instalado SHALL procurar uma versão nova 15 s depois de abrir e a cada 4 h, e SHALL baixar em segundo plano a versão encontrada, informando o progresso. Fora do app instalado SHALL NOT procurar e SHALL informar que a atualização só existe no app instalado.

#### Scenario: Versão nova encontrada
- **GIVEN** a versão instalada é 0.1.0 e a release mais recente é 0.2.0
- **WHEN** a verificação roda
- **THEN** a barra de status mostra o download e depois "Versão 0.2.0 pronta · Reiniciar"

#### Scenario: Desenvolvimento
- **WHEN** o usuário abre "Sobre e atualizações" rodando `npm run dev`
- **THEN** o botão "Procurar atualizações" fica desabilitado com a explicação

### Requirement: Instalação
A versão baixada SHALL ser instalada ao reiniciar pelo botão (depois da confirmação de abas ocupadas) ou na próxima vez que o app fechar, e o app SHALL reabrir depois da instalação pelo botão.

#### Scenario: Reiniciar com aba ocupada
- **GIVEN** uma atualização pronta e uma aba com processo em execução
- **WHEN** o usuário clica em "Reiniciar"
- **THEN** o app pede confirmação antes de encerrar os processos e instalar

### Requirement: Publicação pelo CI
Enviar uma tag `vX.Y.Z` igual à versão do `package.json` SHALL gerar o instalador e publicar a release com o instalador e o `latest.yml`; uma tag diferente da versão SHALL falhar sem publicar.

#### Scenario: Tag fora de sincronia
- **WHEN** a tag `v0.3.0` é enviada com `package.json` na versão 0.2.0
- **THEN** o workflow falha antes de gerar o instalador
