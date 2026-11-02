## Purpose

Permite trocar conjuntos de variáveis de ambiente (Dev, Homologação, Produção) por aba, com identificação visual e proteção contra o uso acidental de ambientes sensíveis.

## ADDED Requirements

### Requirement: Cadastro de perfis de ambiente
O usuário SHALL poder criar, editar e excluir perfis de ambiente com nome, cor, variáveis (nome e valor) e a opção "pedir confirmação". Os perfis SHALL ser gravados em `settings.json` (`environments`).

#### Scenario: Criar perfil
- **GIVEN** a tela Configurações → Ambientes está aberta
- **WHEN** o usuário cria "Homologação" com `ASPNETCORE_ENVIRONMENT=Staging`
- **THEN** o perfil aparece na lista e na paleta

### Requirement: Nova aba com ambiente
Abrir uma aba com um perfil de ambiente SHALL acrescentar as variáveis do perfil ao ambiente do processo do shell. O renderer MUST NOT enviar variáveis ao main: ele informa só o identificador do perfil.

#### Scenario: Variável no processo
- **GIVEN** o perfil "Dev" com `ASPNETCORE_ENVIRONMENT=Development`
- **WHEN** o usuário abre "Nova aba com ambiente: Dev" (CMD) e executa `echo %ASPNETCORE_ENVIRONMENT%`
- **THEN** a saída é `Development` e a aba mostra o ambiente "Dev"

### Requirement: Aplicar ambiente na aba atual
"Aplicar ambiente: <perfil>" SHALL digitar na aba ativa os comandos que definem as variáveis no shell dela (`set` no CMD, `$env:` no PowerShell, `export` no Git Bash e no WSL), depois de mostrar a pré-visualização. Perfis com "pedir confirmação" SHALL exigir confirmação explícita, destacando o nome do ambiente. Em perfis customizados (shell desconhecido) a ação SHALL ser recusada com aviso.

#### Scenario: Produção pede confirmação
- **GIVEN** o perfil "Produção" com "pedir confirmação" ligado
- **WHEN** o usuário aplica "Produção" na aba ativa e cancela
- **THEN** nenhum comando é enviado

#### Scenario: Aplicar no PowerShell
- **GIVEN** uma aba PowerShell ativa
- **WHEN** o usuário aplica "Dev" e confirma
- **THEN** a aba recebe `$env:ASPNETCORE_ENVIRONMENT = 'Development'` e passa a mostrar o ambiente "Dev"
