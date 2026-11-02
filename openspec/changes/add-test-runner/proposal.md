## Why

Rodar `dotnet test` ou `npm test` no terminal gera saídas longas, e achar qual teste falhou, com qual mensagem e em que linha, exige rolar e ler tudo.

## What Changes

- **Executor de testes**: painel que lista os alvos de teste do projeto ativo (projetos .NET de teste e pacotes Node com Vitest ou Jest), roda os testes fora do terminal e mostra o resultado em árvore: aprovados, com falha e ignorados, com duração.
- Falhas mostram mensagem e stack trace; caminhos `arquivo:linha` abrem no editor.
- **Rodar só este teste** e **Rodar só as falhas** (filtro do `dotnet test`/`vitest -t`/`jest -t`).
- Saída bruta disponível no painel, e a execução pode ser cancelada.

## Capabilities

### New Capabilities
- `test-runner`: descoberta de alvos, execução estruturada e visualização dos resultados.

### Modified Capabilities
_Nenhuma._

## Impact

- Shared: modelo do resultado e leitores de TRX (.NET) e JSON (Vitest/Jest), puros.
- Main: `TestRunnerService` (processo filho com o ambiente atual, cancelamento, arquivos temporários de resultado); analisadores marcam projetos de teste e o framework de teste dos pacotes Node.
- Renderer: painel do executor e ação na paleta.
