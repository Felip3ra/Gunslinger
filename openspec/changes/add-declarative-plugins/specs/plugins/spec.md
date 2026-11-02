## Purpose

Permite distribuir comandos, temas, regras de destaque de log, workspaces e perfis de shell como plugins declarativos (somente dados), sem executar código de terceiros.

## ADDED Requirements

### Requirement: Carregamento de plugins
O Gunslinger SHALL ler cada `<dados>/plugins/<pasta>/plugin.json`, validá-lo contra o schema do manifesto e SHALL NOT executar nem importar código de plugins. Um manifesto inválido ou com `id` repetido SHALL aparecer na seção Plugins com o erro e SHALL NOT contribuir. Mudanças na pasta SHALL ser aplicadas sem reiniciar.

#### Scenario: Plugin válido
- **GIVEN** `plugins/kit-loja/plugin.json` com `id: "kit-loja"` e um comando "Subir banco"
- **WHEN** o app abre
- **THEN** a seção Plugins lista "kit-loja" ativo com 1 comando e a paleta mostra "Subir banco"

#### Scenario: Manifesto inválido
- **GIVEN** um `plugin.json` com `contributes.scripts`
- **WHEN** os plugins são carregados
- **THEN** o plugin aparece com o erro citando `scripts` e nada dele é contribuído

### Requirement: Contribuições somente leitura
Comandos, workspaces, regras de destaque, temas e perfis de plugins ativos SHALL aparecer junto com os do usuário, identificados com o nome do plugin, sem opção de editar ou excluir, e SHALL NOT ser gravados nos arquivos do usuário. Comandos de plugin SHALL seguir as mesmas regras de execução dos comandos salvos.

#### Scenario: Comando de plugin
- **WHEN** o usuário aciona "Subir banco" na paleta
- **THEN** o comando é enviado ao terminal pelo fluxo normal (variáveis e confirmação) e `commands.json` não muda

#### Scenario: Tema de plugin
- **WHEN** o usuário aplica o tema "Loja Escuro" em Aparência
- **THEN** as cores são copiadas para `appearance.theme` e continuam depois de desativar o plugin

### Requirement: Ativar e desativar
O usuário SHALL poder desativar um plugin; as contribuições dele SHALL sair imediatamente e o estado SHALL ficar em `settings.plugins.disabled`.

#### Scenario: Desativar
- **WHEN** o usuário desmarca "kit-loja"
- **THEN** "Subir banco" some da paleta e `settings.json` lista "kit-loja" em `plugins.disabled`
