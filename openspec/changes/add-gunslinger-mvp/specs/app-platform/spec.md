## Purpose

Define as garantias básicas do Gunslinger como aplicativo desktop: tempo de abertura, isolamento de segurança entre a UI e o sistema, encerramento sem processos órfãos e independência de plataforma no núcleo.

## ADDED Requirements

### Requirement: Abertura rápida
O Gunslinger SHALL exibir a janela principal com a primeira aba pronta para receber digitação em menos de 2 segundos, contados a partir do lançamento do executável, na máquina de referência (4 núcleos, 8 GB de RAM, SSD, Windows 10/11).

#### Scenario: Abertura a frio
- **GIVEN** o Gunslinger está instalado e não há instância em execução
- **WHEN** o usuário abre o aplicativo
- **THEN** a janela aparece com uma aba do perfil padrão exibindo o prompt do shell em menos de 2 segundos

#### Scenario: Recursos opcionais não atrasam a abertura
- **GIVEN** a detecção de shells, a análise de projetos, as versões de Node e .NET e o status do Git ainda não terminaram
- **WHEN** a janela principal é exibida
- **THEN** a primeira aba já aceita digitação e esses recursos aparecem quando ficam prontos

### Requirement: Isolamento do renderer
A interface MUST NOT ter acesso direto a APIs do Node.js, ao sistema de arquivos ou à criação de processos. Toda operação privilegiada SHALL passar por um canal IPC tipado exposto de forma explícita, e o processo principal SHALL validar os argumentos recebidos.

#### Scenario: Chamada IPC com argumentos inválidos
- **GIVEN** o renderer envia uma requisição para abrir um PTY com um ID de perfil que não existe
- **WHEN** o processo principal recebe a requisição
- **THEN** a requisição é rejeitada com um erro descritivo e nenhum processo é iniciado

#### Scenario: Conteúdo do terminal não executa código
- **GIVEN** a saída de um comando contém HTML ou JavaScript
- **WHEN** a saída é exibida no terminal
- **THEN** o conteúdo aparece como texto e nenhum script é executado na UI

### Requirement: Encerramento sem processos órfãos
Ao fechar o aplicativo, o Gunslinger SHALL encerrar o processo de shell de cada aba aberta e todos os processos descendentes dele (por exemplo, servidores iniciados por `npm run dev` ou `dotnet watch`). O Gunslinger MUST NOT deixar processos iniciados por ele em execução.

#### Scenario: Fechar o app com servidores em andamento
- **GIVEN** uma aba rodando `dotnet watch run` e outra rodando `npm run dev` (Vite na porta 5173)
- **WHEN** o usuário fecha a janela principal e confirma
- **THEN** os shells, o processo `dotnet` e os processos `node` são encerrados, e a porta 5173 fica livre

#### Scenario: Confirmação com processos ativos
- **GIVEN** pelo menos uma aba tem um processo filho em execução além do próprio shell
- **WHEN** o usuário fecha a janela principal
- **THEN** o Gunslinger pede confirmação dizendo quantas abas têm processos ativos

### Requirement: Instância única
O Gunslinger SHALL rodar em uma única instância por usuário. Abrir o aplicativo de novo com ele já aberto SHALL trazer a janela existente para a frente e MUST NOT iniciar um segundo processo que leia ou grave os arquivos de configuração.

#### Scenario: Segunda execução
- **GIVEN** o Gunslinger já está aberto e minimizado
- **WHEN** o usuário abre o Gunslinger de novo pelo Menu Iniciar
- **THEN** a janela existente é restaurada e recebe o foco, e nenhuma segunda janela ou processo é criado

### Requirement: Núcleo independente de plataforma
As funções de detecção de shell, leitura do ambiente do sistema, caminhos de configuração, encerramento de árvores de processos e abertura de editor SHALL ser isoladas por plataforma, para que o suporte a Linux e macOS possa ser adicionado sem mudar o comportamento no Windows.

#### Scenario: Plataforma sem detector
- **GIVEN** o Gunslinger roda numa plataforma sem detector de shell implementado
- **WHEN** o app inicia
- **THEN** o app abre usando o shell padrão do sistema (variável `SHELL` ou `COMSPEC`) e informa que a detecção automática não está disponível
