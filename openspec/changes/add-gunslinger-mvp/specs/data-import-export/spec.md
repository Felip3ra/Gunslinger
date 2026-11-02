## Purpose

Permite levar comandos salvos, perfis de shell e perfis de projeto para outra máquina ou compartilhá-los com a equipe por arquivos JSON, sem risco de execução ou de perda de dados.

## ADDED Requirements

### Requirement: Exportação
O usuário SHALL poder exportar para um arquivo JSON a escolha que fizer entre comandos salvos (todos ou por categoria), perfis de shell customizados e perfis de projeto. O arquivo SHALL ter um campo de formato e versão. A exportação MUST NOT incluir perfis detectados automaticamente nem preferências de tema, fonte e atalhos.

#### Scenario: Exportar categoria
- **GIVEN** existem as categorias "Git" (4 comandos) e "EF" (5 comandos)
- **WHEN** o usuário exporta só a categoria "EF"
- **THEN** o arquivo gerado tem os 5 comandos de "EF" e nenhum de "Git"

#### Scenario: Caminhos locais nos projetos
- **GIVEN** o usuário marca perfis de projeto para exportar
- **WHEN** a exportação é concluída
- **THEN** o arquivo contém as pastas raiz como estão e a tela avisa que esses caminhos podem não existir em outra máquina

### Requirement: Importação com validação e prévia
Ao importar um arquivo, o Gunslinger SHALL validar o formato e a versão, rejeitar o arquivo inteiro se ele for inválido (com mensagem clara) e, se for válido, mostrar uma prévia dos itens que serão adicionados, incluindo o texto completo de cada comando. Nada SHALL ser gravado antes de o usuário confirmar.

#### Scenario: Arquivo inválido
- **GIVEN** um arquivo `.json` que não segue o formato de exportação do Gunslinger
- **WHEN** o usuário tenta importá-lo
- **THEN** o Gunslinger mostra "Arquivo de importação inválido: <motivo>" e nada é alterado

#### Scenario: Cancelar importação
- **GIVEN** a prévia de importação está aberta
- **WHEN** o usuário cancela
- **THEN** nenhum comando ou perfil é adicionado nem alterado

### Requirement: Resolução de conflitos
Quando um item importado tiver o mesmo identificador, ou o mesmo nome dentro da mesma categoria, que um item existente, a prévia SHALL marcar o conflito e o usuário SHALL escolher, para cada item ou para todos de uma vez, entre "Substituir", "Manter ambos" (renomeando o importado) e "Ignorar".

#### Scenario: Manter ambos
- **GIVEN** já existe o comando "Nova migration" na categoria "EF" e o arquivo traz outro com o mesmo nome
- **WHEN** o usuário escolhe "Manter ambos" e confirma
- **THEN** passam a existir "Nova migration" e "Nova migration (2)"

### Requirement: Importação não executa nem inicia processos
A importação MUST NOT executar comandos, abrir abas nem iniciar processos. Perfis de shell importados cujo executável não existe na máquina SHALL ser importados marcados como indisponíveis.

#### Scenario: Perfil com executável ausente
- **GIVEN** o arquivo traz o perfil "Fish" com `C:\tools\fish.exe`, que não existe na máquina
- **WHEN** o usuário importa
- **THEN** o perfil é adicionado marcado como indisponível e não aparece habilitado no menu de nova aba

### Requirement: Referências na importação
Comandos importados vinculados a um projeto que não existe na máquina nem no arquivo SHALL ser importados como globais. Comandos com shell de destino desconhecido SHALL ser importados com a referência mantida e marcados com o aviso "Shell de destino não encontrado".

#### Scenario: Projeto não exportado
- **GIVEN** o arquivo traz o comando "Seed do banco" vinculado a um projeto que não está no arquivo nem na máquina
- **WHEN** o usuário importa
- **THEN** "Seed do banco" é importado como comando global e a prévia informa isso
