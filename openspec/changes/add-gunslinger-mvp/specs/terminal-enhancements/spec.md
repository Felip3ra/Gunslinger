## Purpose

Torna a saída do terminal mais útil: links e caminhos de arquivo clicáveis, busca no histórico de saída e aviso quando um comando demorado termina enquanto o usuário está em outra janela.

## ADDED Requirements

### Requirement: URLs clicáveis
URLs `http://` e `https://` na saída do terminal SHALL ser destacadas ao passar o mouse e SHALL abrir no navegador padrão com Ctrl+clique, inclusive endereços locais de servidores de desenvolvimento (`localhost`, `127.0.0.1`, `[::1]` e IPs da rede local, com porta). A mesma regra SHALL valer para hiperlinks embutidos pelo programa na saída (sequência OSC 8). Outros esquemas (por exemplo `file:`, `javascript:`) MUST NOT ser abertos como URL.

#### Scenario: Servidor do Vite
- **GIVEN** a saída do `npm run dev` contém `➜  Local:   http://localhost:5173/`
- **WHEN** o usuário dá Ctrl+clique na URL
- **THEN** o navegador padrão abre `http://localhost:5173/`

#### Scenario: Servidor do ASP.NET Core
- **GIVEN** a saída contém `Now listening on: https://localhost:7001`
- **WHEN** o usuário dá Ctrl+clique na URL
- **THEN** o navegador padrão abre `https://localhost:7001`

#### Scenario: Esquema não permitido
- **GIVEN** a saída contém `javascript:alert(1)`
- **WHEN** o usuário dá Ctrl+clique no texto
- **THEN** nada é aberto

### Requirement: Caminhos de arquivo clicáveis
Caminhos de arquivo na saída, opcionalmente seguidos de linha e coluna (`arquivo:linha`, `arquivo:linha:coluna`, `arquivo(linha,coluna)`), SHALL ser destacados e abertos no editor configurado com Ctrl+clique, posicionando na linha e na coluna. Caminhos relativos SHALL ser resolvidos a partir da pasta atual da aba e aceitar `/` ou `\` como separador. Caminhos de arquivos que não existem MUST NOT virar link. Caminhos WSL (`/mnt/c/...` ou de dentro da distribuição) SHALL ser convertidos para caminhos acessíveis pelo Windows.

#### Scenario: Erro de compilação do .NET
- **GIVEN** a aba está em `C:\src\Loja` e a saída contém `src\Loja.Api\Program.cs(42,13): error CS0103`
- **WHEN** o usuário dá Ctrl+clique no caminho
- **THEN** o editor configurado abre `C:\src\Loja\src\Loja.Api\Program.cs` na linha 42, coluna 13

#### Scenario: Erro de TypeScript com linha e coluna
- **GIVEN** a aba está em `C:\src\Loja\frontend` e a saída contém `src/App.tsx:10:5`
- **WHEN** o usuário dá Ctrl+clique
- **THEN** o editor abre `C:\src\Loja\frontend\src\App.tsx` na linha 10, coluna 5

#### Scenario: Caminho com linha
- **GIVEN** a saída contém `Program.cs:42` e o arquivo existe na pasta atual
- **WHEN** o usuário dá Ctrl+clique
- **THEN** o editor abre `Program.cs` na linha 42

#### Scenario: Editor não encontrado
- **GIVEN** o editor configurado é VS Code e o comando `code` não está disponível
- **WHEN** o usuário dá Ctrl+clique num caminho
- **THEN** o Gunslinger mostra um aviso com um link para a configuração do editor e oferece abrir o arquivo com o programa padrão do Windows

### Requirement: Busca na saída
Ctrl+F (atalho configurável) SHALL abrir uma barra de busca sobre o terminal ativo, que destaca todas as ocorrências no buffer, inclusive no histórico rolado. A barra SHALL permitir ir para a próxima e para a anterior (Enter e Shift+Enter) e ligar ou desligar diferenciação de maiúsculas, palavra inteira e expressão regular. Esc SHALL fechar a barra e remover os destaques.

#### Scenario: Buscar erro
- **GIVEN** a saída do terminal contém três ocorrências de "error"
- **WHEN** o usuário pressiona Ctrl+F e digita "error"
- **THEN** as três ocorrências ficam destacadas, a barra mostra "1 de 3" e a primeira fica visível

#### Scenario: Regex inválida
- **GIVEN** a opção de expressão regular está ligada
- **WHEN** o usuário digita `[abc`
- **THEN** a barra indica expressão inválida e o app não quebra

### Requirement: Notificação de comando demorado
Quando um comando que durou mais que o limite configurado (padrão de 10 segundos) terminar e a janela do Gunslinger não estiver em foco, o Gunslinger SHALL mostrar uma notificação do Windows com o comando (resumido), a duração e o resultado (sucesso ou código de erro, quando conhecido). Clicar na notificação SHALL trazer a janela para a frente e ativar a aba do comando. Isso depende da detecção de início e fim de comando, e abas sem integração do shell MUST NOT gerar notificações. A notificação SHALL poder ser desligada nas configurações.

#### Scenario: Build longo com a janela em segundo plano
- **GIVEN** o limite é de 10 s e o usuário está em outra janela
- **WHEN** um `npm run build` de 25 s termina com sucesso
- **THEN** aparece a notificação "npm run build concluído em 25 s"

#### Scenario: Janela em foco
- **GIVEN** a janela do Gunslinger está em foco
- **WHEN** um comando de 30 s termina
- **THEN** nenhuma notificação é mostrada

#### Scenario: Comando curto
- **GIVEN** o limite é de 10 s e a janela está fora de foco
- **WHEN** um comando de 3 s termina
- **THEN** nenhuma notificação é mostrada

#### Scenario: Servidor interrompido não notifica como concluído
- **GIVEN** a janela está fora de foco e um `npm run dev` está rodando há 10 minutos
- **WHEN** o servidor termina com erro
- **THEN** a notificação mostra que o comando falhou e o código de saída, quando conhecido

#### Scenario: Clique na notificação
- **GIVEN** uma notificação foi mostrada para um comando da aba 3
- **WHEN** o usuário clica na notificação
- **THEN** a janela do Gunslinger vem para a frente com a aba 3 ativa
