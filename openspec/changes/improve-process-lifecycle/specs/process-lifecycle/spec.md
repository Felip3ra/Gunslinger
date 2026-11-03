## Purpose

Controla o que acontece com os processos que uma aba iniciou e mantém a informação de ambiente e de versão do Node correta por aba.

## ADDED Requirements

### Requirement: Processos fora da árvore da aba
O Gunslinger SHALL acompanhar todos os processos iniciados a partir do shell de uma aba, inclusive os que saem da árvore dela. Ao fechar a aba ou o app, os que continuarem rodando SHALL seguir `terminal.detachedProcesses`: `ask` SHALL listar os processos e perguntar se devem ser encerrados; `kill` SHALL encerrá-los; `keep` SHALL mantê-los.

#### Scenario: Perguntar ao fechar a aba
- **GIVEN** a aba rodou `cmd /c start ping -t 127.0.0.1` e o `cmd` intermediário já terminou
- **WHEN** o usuário fecha a aba
- **THEN** um diálogo lista "PING" e, em "Encerrar", o processo termina

#### Scenario: Saída pelo próprio shell
- **WHEN** o usuário digita `exit` no shell
- **THEN** nada é perguntado e os processos iniciados continuam rodando

### Requirement: Versão do Node por sessão
Com `fnm` ativo na sessão, os scripts de integração do PowerShell e do Bash SHALL informar a versão do Node quando ela mudar, e a barra de status da aba SHALL mostrar essa versão no lugar da versão do ambiente do app.

#### Scenario: fnm use
- **GIVEN** uma aba PowerShell com `fnm env --use-on-cd`
- **WHEN** o usuário entra numa pasta com `.node-version` 18.19.1
- **THEN** a barra de status mostra "Node 18.19.1"

### Requirement: Recarga automática do ambiente
Quando o Windows avisar mudança de configuração, o Gunslinger SHALL reler o ambiente do sistema e SHALL criar uma geração nova do ambiente só se alguma variável mudou; as abas abertas SHALL mostrar "ambiente desatualizado".

#### Scenario: setx
- **WHEN** o usuário cria uma variável com `setx`
- **THEN** em poucos segundos as abas abertas mostram "ambiente desatualizado · Reiniciar aba" e abas novas já têm a variável
