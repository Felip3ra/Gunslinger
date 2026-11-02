## Purpose

Guarda as preferências do usuário em arquivos JSON legíveis e editáveis à mão, com aplicação imediata e tolerância total a arquivos ausentes ou inválidos.

## ADDED Requirements

### Requirement: Local e formato dos arquivos
O Gunslinger SHALL guardar a configuração na pasta de dados do usuário (`%APPDATA%\Gunslinger` no Windows): `settings.json` para preferências e perfis de shell, `commands.json` para comandos salvos e `projects.json` para perfis de projeto. Cada arquivo SHALL ter o campo `version` para migrações futuras. Na primeira execução, os arquivos que não existem SHALL ser criados com valores padrão.

#### Scenario: Primeira execução
- **GIVEN** a pasta `%APPDATA%\Gunslinger` não existe
- **WHEN** o Gunslinger inicia
- **THEN** a pasta é criada com `settings.json`, `commands.json` e `projects.json` válidos e com valores padrão

### Requirement: Opções configuráveis
O `settings.json` SHALL aceitar no mínimo: tema (16 cores ANSI, fundo, primeiro plano, cursor e seleção), família e tamanho da fonte, estilo do cursor, linhas de histórico (scrollback), atalhos de teclado para todas as ações do app, editor padrão (modelo de comando com marcadores de arquivo, linha e coluna, padrão VS Code), perfil padrão, limite e ativação das notificações de comando demorado e perfis de shell customizados ou ajustados.

#### Scenario: Mudar fonte
- **GIVEN** o Gunslinger está aberto
- **WHEN** o usuário muda `fontSize` de 14 para 16 e salva o arquivo
- **THEN** todas as abas abertas passam a usar o tamanho 16 e são redimensionadas sem reiniciar o app

#### Scenario: Mudar atalho
- **GIVEN** a ação "Nova aba" usa Ctrl+T
- **WHEN** o usuário a muda para Ctrl+Shift+T
- **THEN** Ctrl+Shift+T abre uma nova aba e Ctrl+T passa a ser enviado ao shell

#### Scenario: Atalho em conflito
- **GIVEN** o usuário associa Ctrl+P a duas ações diferentes
- **WHEN** a configuração é carregada
- **THEN** o Gunslinger avisa sobre o conflito e mantém o atalho só na primeira ação, na ordem do arquivo

#### Scenario: Aviso de conflito com o readline
- **GIVEN** a tela de atalhos está aberta
- **WHEN** o usuário associa Ctrl+R a uma ação
- **THEN** a tela avisa que Ctrl+R também é usado pelo Bash/readline (busca no histórico) e que a tecla deixará de chegar ao shell, mas permite salvar

### Requirement: Edição pela interface e pelo arquivo
O Gunslinger SHALL ter uma tela de configurações para as opções mais usadas e uma ação "Abrir settings.json" que abre o arquivo no editor configurado. Mudanças feitas direto no arquivo SHALL ser detectadas e aplicadas sem reiniciar. Mudanças feitas pela interface SHALL ser gravadas de forma atômica (sem deixar o arquivo pela metade se o app fechar no meio da gravação).

#### Scenario: Edição externa
- **GIVEN** o Gunslinger está aberto
- **WHEN** o usuário muda a cor de fundo no `settings.json` pelo VS Code e salva
- **THEN** em até 2 segundos o terminal passa a usar a nova cor de fundo

### Requirement: Tolerância a configuração inválida
Se um arquivo de configuração tiver JSON inválido ou valores fora do esquema, o Gunslinger MUST continuar abrindo e funcionando. Ele SHALL mostrar um aviso não bloqueante com o arquivo, a linha ou o campo e o motivo do erro, e SHALL usar os valores padrão nos campos inválidos (ou no arquivo inteiro, se o JSON não puder ser lido). O Gunslinger MUST NOT sobrescrever o arquivo inválido do usuário enquanto o erro não for corrigido.

#### Scenario: JSON quebrado
- **GIVEN** o `settings.json` tem uma vírgula sobrando que torna o JSON inválido
- **WHEN** o Gunslinger inicia
- **THEN** o app abre com as configurações padrão, mostra "settings.json inválido (linha N): <motivo>" e o arquivo continua igual no disco

#### Scenario: Campo com valor inválido
- **GIVEN** o `settings.json` tem `"fontSize": "grande"` e as outras opções válidas
- **WHEN** a configuração é carregada
- **THEN** o tamanho da fonte padrão é usado, as outras opções do usuário são aplicadas e o aviso cita o campo `fontSize`

#### Scenario: Correção do arquivo
- **GIVEN** o aviso de configuração inválida está visível
- **WHEN** o usuário corrige o arquivo e salva
- **THEN** o aviso some e as configurações do arquivo são aplicadas

#### Scenario: Arquivo inválido não é sobrescrito pela interface
- **GIVEN** o `commands.json` está inválido
- **WHEN** o usuário tenta criar um comando salvo pela interface
- **THEN** o Gunslinger avisa que o arquivo precisa ser corrigido (ou recriado a partir de um backup) antes de salvar, sem perder o conteúdo existente
