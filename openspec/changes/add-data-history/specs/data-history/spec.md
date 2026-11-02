## Purpose

Guarda versões dos dados do usuário (configurações, comandos, projetos e workspaces) dentro do app e permite voltar a qualquer uma delas.

## ADDED Requirements

### Requirement: Snapshots automáticos
O Gunslinger SHALL gravar um snapshot dos arquivos `settings.json`, `commands.json`, `projects.json` e `workspaces.json` ao iniciar e após cada mudança válida (pela UI ou edição externa), SHALL NOT gravar um snapshot idêntico ao mais recente e SHALL NOT capturar automaticamente enquanto algum desses arquivos estiver inválido.

#### Scenario: Mudança gera snapshot
- **GIVEN** o histórico tem um snapshot com 2 comandos
- **WHEN** o usuário salva um terceiro comando
- **THEN** em poucos segundos o histórico ganha um snapshot com 3 comandos

#### Scenario: Sem repetição
- **WHEN** o app reinicia sem mudanças nos arquivos
- **THEN** nenhum snapshot novo é gravado

### Requirement: Pontos de restauração
O usuário SHALL poder criar um snapshot com nome, que SHALL NOT ser apagado pela retenção automática.

#### Scenario: Ponto com nome
- **WHEN** o usuário cria o ponto "Antes de reorganizar"
- **THEN** ele aparece no topo do histórico com esse nome

### Requirement: Restauração
Restaurar um snapshot SHALL pedir confirmação, SHALL gravar antes um snapshot "Antes de restaurar" do estado atual e SHALL substituir os arquivos só se todos os textos do snapshot forem válidos.

#### Scenario: Restaurar comandos apagados
- **GIVEN** um snapshot com o comando "Build" e o comando foi excluído depois
- **WHEN** o usuário restaura esse snapshot e confirma
- **THEN** "Build" volta à lista e o histórico tem um snapshot "Antes de restaurar" sem ele

### Requirement: Retenção
O Gunslinger SHALL manter os 50 snapshots automáticos mais recentes e excluir os mais antigos; o usuário SHALL poder excluir qualquer snapshot.

#### Scenario: Limite
- **GIVEN** 50 snapshots automáticos
- **WHEN** um novo é gravado
- **THEN** o mais antigo automático é excluído e os pontos com nome permanecem
