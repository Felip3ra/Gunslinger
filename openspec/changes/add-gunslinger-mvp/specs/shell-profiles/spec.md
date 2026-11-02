## Purpose

Descobre os shells instalados no Windows, permite que o usuário defina perfis próprios e mantém atualizado o ambiente (PATH e variáveis) com que os shells são iniciados.

## ADDED Requirements

### Requirement: Detecção automática de shells
Na inicialização, o Gunslinger SHALL detectar quais destes shells estão instalados e criar um perfil detectado para cada um: Windows PowerShell 5.1, PowerShell 7+ (`pwsh`), CMD, Git Bash e WSL. Shells não encontrados MUST NOT aparecer como perfis.

#### Scenario: Máquina com todos os shells
- **GIVEN** a máquina tem PowerShell 5.1, PowerShell 7, CMD, Git for Windows e WSL instalados
- **WHEN** o Gunslinger inicia
- **THEN** o menu de nova aba lista perfis para PowerShell 5.1, PowerShell 7, CMD, Git Bash e para cada distribuição WSL

#### Scenario: Git Bash ausente
- **GIVEN** o Git for Windows não está instalado
- **WHEN** o Gunslinger inicia
- **THEN** nenhum perfil Git Bash é listado e os outros perfis continuam disponíveis

#### Scenario: Git Bash em local não padrão
- **GIVEN** o Git for Windows foi instalado fora de `C:\Program Files\Git`, e o `git.exe` está no PATH ou registrado no Registro do Windows
- **WHEN** o Gunslinger inicia
- **THEN** o perfil Git Bash aponta para o `bash.exe` daquela instalação

### Requirement: Um perfil por distribuição WSL
O Gunslinger SHALL criar um perfil detectado para cada distribuição WSL instalada, com o nome da distribuição.

#### Scenario: Duas distribuições
- **GIVEN** as distribuições `Ubuntu` e `Debian` estão instaladas no WSL
- **WHEN** o Gunslinger inicia
- **THEN** existem os perfis "WSL: Ubuntu" e "WSL: Debian", e cada um abre a sua distribuição

#### Scenario: WSL sem distribuição
- **GIVEN** o `wsl.exe` existe, mas nenhuma distribuição está instalada
- **WHEN** o Gunslinger inicia
- **THEN** nenhum perfil WSL é listado

### Requirement: Perfis customizados
O usuário SHALL poder criar, editar e excluir perfis customizados com os campos nome (obrigatório), executável (obrigatório), argumentos, pasta inicial, cor de destaque e ícone. O Gunslinger MUST validar que o executável existe antes de salvar o perfil.

#### Scenario: Criar perfil customizado
- **GIVEN** o usuário abre o editor de perfis
- **WHEN** ele cria o perfil "Node REPL" com o executável `node.exe` e a cor `#43853d` e salva
- **THEN** "Node REPL" aparece no menu de nova aba com a cor escolhida

#### Scenario: Executável inexistente
- **GIVEN** o usuário está criando um perfil
- **WHEN** ele informa o executável `C:\nao\existe.exe` e tenta salvar
- **THEN** o perfil não é salvo e aparece a mensagem "Executável não encontrado"

### Requirement: Ajuste de perfis detectados
O usuário SHALL poder ocultar perfis detectados e mudar a cor, o ícone, os argumentos e a pasta inicial deles. Essas mudanças MUST continuar valendo depois de uma nova detecção.

#### Scenario: Ocultar perfil detectado
- **GIVEN** o perfil detectado "Windows PowerShell 5.1" existe
- **WHEN** o usuário o marca como oculto e reinicia o app
- **THEN** o perfil não aparece no menu de nova aba nem na paleta

### Requirement: Cores padrão por tipo de shell
Cada perfil detectado SHALL receber uma cor de destaque padrão de acordo com o tipo: PowerShell em azul, Git Bash em verde, CMD em cinza e WSL em laranja.

#### Scenario: Cor padrão do Git Bash
- **GIVEN** o perfil Git Bash foi detectado e o usuário não mudou a cor
- **WHEN** uma aba Git Bash é aberta
- **THEN** a aba exibe o destaque verde

### Requirement: Perfil padrão
O Gunslinger SHALL usar o perfil definido como padrão nas configurações para a primeira aba e para a ação "Nova aba". Se esse perfil não existir, o Gunslinger SHALL usar o primeiro perfil disponível, nesta ordem: PowerShell 7, PowerShell 5.1, CMD.

#### Scenario: Perfil padrão removido
- **GIVEN** o perfil padrão configurado é "Git Bash" e o Git foi desinstalado
- **WHEN** o Gunslinger inicia
- **THEN** a primeira aba abre com PowerShell 7 (ou o próximo disponível) e aparece um aviso de que o perfil padrão não foi encontrado

### Requirement: Recarregar ambiente
O Gunslinger SHALL oferecer a ação "Recarregar ambiente", que relê as variáveis de ambiente do sistema e do usuário (no Windows, as mesmas que um novo login usaria, com o PATH montado como sistema seguido de usuário) sem reiniciar o app. Depois da recarga:
- abas novas SHALL ser iniciadas com o ambiente novo;
- as consultas que o app faz por conta própria (`git`, `dotnet`, `node`, editor) SHALL usar o ambiente novo;
- a detecção de shells e as versões da barra de status SHALL ser refeitas;
- abas já abertas SHALL manter o ambiente com que foram iniciadas e exibir o indicador "ambiente desatualizado", com a opção "Reiniciar aba".

#### Scenario: Node instalado com o app aberto
- **GIVEN** o Gunslinger está aberto e o Node.js não está no PATH
- **WHEN** o usuário instala o Node.js e aciona "Recarregar ambiente"
- **THEN** uma aba nova encontra `node` e `npm`, e o aviso "Node não encontrado" deixa de aparecer

#### Scenario: Troca de versão com nvm-windows
- **GIVEN** a barra de status mostra Node `v18.20.0` e o usuário executou `nvm use 20.11.0` num shell externo
- **WHEN** o usuário aciona "Recarregar ambiente"
- **THEN** a barra de status passa a mostrar `v20.11.0` e as abas abertas antes da recarga exibem "ambiente desatualizado"

#### Scenario: Reiniciar aba desatualizada
- **GIVEN** uma aba está marcada como "ambiente desatualizado"
- **WHEN** o usuário escolhe "Reiniciar aba"
- **THEN** o shell daquela aba é encerrado e iniciado de novo, com o mesmo perfil e na mesma pasta atual, usando o ambiente novo

#### Scenario: Leitura do ambiente falha
- **GIVEN** a leitura das variáveis do sistema falha
- **WHEN** o usuário aciona "Recarregar ambiente"
- **THEN** o Gunslinger mantém o ambiente anterior e mostra o motivo do erro
