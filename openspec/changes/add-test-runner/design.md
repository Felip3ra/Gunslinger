## Decisions

- **Fora do terminal**: o executor precisa de resultados estruturados; a saída bruta é mostrada como texto no painel.
- **.NET**: `dotnet test "<csproj>" --logger "trx;LogFileName=<id>.trx" --results-directory <temp>` (+ `--filter "FullyQualifiedName=<nome>|..."`). O TRX é lido com expressões regulares sobre `UnitTestResult`, `Message` e `StackTrace` (sem dependência de XML).
- **Node**: roda o script `test` do pacote pelo gerenciador (`npm run test -- <args>`), o que mantém a configuração do usuário e acha o binário local. Vitest: `--run --reporter=json --outputFile=<arquivo>`; Jest: `--json --outputFile=<arquivo>`. Os dois produzem o formato `testResults[].assertionResults[]`.
- **Serviço** (`main/tests/test-runner.ts`): uma execução por vez por alvo; eventos `tests:output` (texto) e `tests:finished` (resultado ou erro); cancelamento com `killTree`.
- **Descoberta**: `inspectCsproj` ganha `isTestProject`; `NodePackage` ganha `testFramework` (`vitest`/`jest`/null).

## Risks / Trade-offs

- [Scripts `test` com argumentos próprios incompatíveis] → o erro aparece na saída bruta; o painel mostra "resultado não disponível".
- [Projetos de teste grandes] → saída bruta limitada às últimas 2.000 linhas.
