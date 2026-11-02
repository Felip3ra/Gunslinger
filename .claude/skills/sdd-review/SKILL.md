# OpenSpec Review

Objetivo

Revisar uma change OpenSpec antes da execução do Apply.

A revisão deve identificar inconsistências, riscos e oportunidades de melhoria para reduzir retrabalho durante a implementação.

---

## Verificar Consistência

Analisar:

* proposal.md
* design.md
* tasks.md
* specs/
* CLAUDE.md

Validar se todos os documentos descrevem a mesma solução.

Identificar:

* Requisitos conflitantes
* Funcionalidades descritas em apenas um artefato
* Tarefas sem requisito associado
* Requisitos sem tarefa correspondente

---

## Verificar Escopo

Identificar:

* Escopo excessivo para uma única change
* Funcionalidades que deveriam ser divididas em novas changes
* Dependências entre funcionalidades

Sugerir possíveis quebras em capacidades menores.

---

## Verificar Arquitetura

Validar aderência ao CLAUDE.md.

Identificar:

* Violações arquiteturais
* Estruturas de pastas inconsistentes
* Componentes excessivamente grandes
* Acoplamento desnecessário
* Riscos para manutenção futura

---

## Verificar Implementação

Identificar:

* Dependências faltantes
* Serviços ausentes
* Entidades ausentes
* Casos de uso não contemplados
* Fluxos incompletos

Avaliar se a implementação pode ser realizada com as informações existentes.

---

## Verificar Banco de Dados

Identificar:

* Entidades incompletas
* Relacionamentos ausentes
* Dados necessários não previstos
* Problemas potenciais de persistência

---

## Verificar Riscos

Classificar:

* Baixo risco
* Médio risco
* Alto risco

Apontar:

* Possíveis dificuldades de implementação
* Ambiguidades
* Decisões não documentadas

---

## Resultado Esperado

Apresentar:

### Pontos Positivos

Lista dos aspectos bem definidos.

### Problemas Encontrados

Descrição dos problemas identificados.

### Recomendações

Sugestões de melhoria antes da execução do Apply.

### Conclusão

Informar:

* Pronto para Apply
  ou
* Requer ajustes antes do Apply