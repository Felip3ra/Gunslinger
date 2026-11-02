## Purpose

Executa os testes dos projetos .NET e Node.js e mostra o resultado de forma navegável, para achar e reexecutar falhas sem ler a saída inteira.

## ADDED Requirements

### Requirement: Alvos de teste
Para o projeto ativo, o Gunslinger SHALL listar como alvos de teste os `.csproj` que referenciam `Microsoft.NET.Test.Sdk`, xUnit, NUnit ou MSTest, e os pacotes Node cujo `package.json` tem script `test` e Vitest ou Jest nas dependências.

#### Scenario: Projeto misto
- **GIVEN** o projeto tem `tests/Loja.Tests/Loja.Tests.csproj` (xUnit) e `frontend/package.json` com Vitest
- **WHEN** o usuário abre o executor de testes
- **THEN** os dois alvos aparecem para seleção

### Requirement: Execução e resultados
Rodar um alvo SHALL executar os testes fora do terminal, com o ambiente atual do app e na pasta do alvo, e SHALL mostrar a contagem de aprovados, com falha e ignorados e a lista de testes com duração. Testes com falha SHALL mostrar a mensagem e o stack trace, e caminhos com linha SHALL abrir no editor configurado. A execução SHALL poder ser cancelada, encerrando a árvore de processos.

#### Scenario: Falha no .NET
- **GIVEN** um projeto xUnit com um teste que falha em `UnitTest1.cs` linha 5
- **WHEN** o usuário roda o alvo
- **THEN** o painel mostra "1 com falha, 1 aprovado", a mensagem `Assert.Equal() Failure` e o link `UnitTest1.cs:line 5`

#### Scenario: Cancelar
- **GIVEN** uma execução em andamento
- **WHEN** o usuário clica em Cancelar
- **THEN** o processo de testes é encerrado e o painel mostra "Cancelado"

### Requirement: Reexecutar testes
O Gunslinger SHALL oferecer "Rodar só este" em cada teste e "Rodar só as falhas", filtrando por nome do teste (`--filter` no `dotnet test`; `-t` no Vitest/Jest).

#### Scenario: Rodar só a falha
- **GIVEN** o resultado anterior tem um teste com falha
- **WHEN** o usuário aciona "Rodar só as falhas"
- **THEN** só esse teste é executado e o resultado novo substitui o anterior
