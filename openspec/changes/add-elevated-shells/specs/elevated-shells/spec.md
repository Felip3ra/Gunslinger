## Purpose

Permite abrir shells com privilégios de administrador a partir do Gunslinger, de preferência dentro de uma aba, sem contornar a confirmação do UAC do Windows.

## ADDED Requirements

### Requirement: Abrir shell como administrador
O Gunslinger SHALL oferecer "Abrir como administrador" para os perfis de PowerShell, PowerShell 7, CMD e Git Bash, no menu de nova aba e na paleta ("Nova aba como administrador: <perfil>"). A confirmação do UAC MUST ser a do próprio Windows; se o usuário a recusar, a aba SHALL mostrar "Elevação cancelada" com as opções Tentar de novo e Fechar.

#### Scenario: Abrir pela paleta
- **GIVEN** o sudo do Windows está habilitado em modo inline
- **WHEN** o usuário escolhe "Nova aba como administrador: Windows PowerShell" e confirma o UAC
- **THEN** uma aba de PowerShell elevado abre dentro do Gunslinger

#### Scenario: UAC recusado
- **GIVEN** o usuário pediu uma aba elevada
- **WHEN** ele recusa a confirmação do UAC
- **THEN** a aba mostra "Elevação cancelada" e nenhum processo elevado fica em execução

### Requirement: Mecanismo de elevação
O Gunslinger SHALL escolher o mecanismo nesta ordem: sudo do Windows quando configurado em modo inline; gsudo quando estiver no PATH; janela separada do Windows (`Start-Process -Verb RunAs`) nos demais casos. No caso da janela separada, o Gunslinger SHALL informar que o shell abriu fora do app e como habilitar o modo inline (`sudo config --enable normal`, como administrador).

#### Scenario: Sem sudo inline nem gsudo
- **GIVEN** o sudo do Windows está desabilitado e o gsudo não está instalado
- **WHEN** o usuário pede um CMD como administrador
- **THEN** um CMD elevado abre numa janela separada, na pasta pedida, e o app mostra o aviso com o comando para habilitar o sudo inline

#### Scenario: gsudo instalado
- **GIVEN** o sudo do Windows não está em modo inline e o gsudo está no PATH
- **WHEN** o usuário pede um Git Bash como administrador
- **THEN** a aba elevada abre dentro do Gunslinger usando o gsudo

### Requirement: Identificação da aba elevada
Abas elevadas SHALL exibir um escudo antes do título e o item "Administrador" na barra de status. A integração com o shell (pasta atual e marcas de comando) SHALL continuar funcionando na aba elevada.

#### Scenario: Pasta atual na aba elevada
- **GIVEN** uma aba de CMD elevada aberta dentro do Gunslinger
- **WHEN** o usuário executa `cd /d C:\Windows`
- **THEN** a barra de status mostra "Administrador" e a pasta `C:\Windows`
