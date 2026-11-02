## Purpose

Destaca erros, avisos e sucessos na saída do terminal para que se destaquem no meio de saídas longas, sem alterar o texto.

## ADDED Requirements

### Requirement: Destaque de padrões
O Gunslinger SHALL destacar, nas linhas concluídas da saída, os trechos que casam com as regras de destaque, aplicando a cor de texto e de fundo da regra. Por padrão SHALL haver regras para erros (vermelho), avisos (amarelo) e sucesso (verde). O destaque MUST NOT alterar o texto do buffer: copiar e buscar SHALL devolver o texto original.

#### Scenario: Erro de build
- **GIVEN** o destaque está ligado com as regras padrão
- **WHEN** a saída contém a linha `Program.cs(4,1): error CS1002: ; expected`
- **THEN** o trecho `error` aparece em vermelho e copiar a linha devolve o texto sem alterações

#### Scenario: Tela alternativa
- **GIVEN** o destaque está ligado
- **WHEN** um programa de tela cheia (por exemplo `less`) mostra a palavra `error`
- **THEN** nada é destacado na tela alternativa

### Requirement: Regras configuráveis
As regras SHALL ser configuráveis em `settings.json` (`logHighlight.rules`, cada uma com `pattern`, `ignoreCase`, `foreground` e `background` opcionais) e o destaque SHALL poder ser ligado e desligado (`logHighlight.enabled` e a ação "Alternar destaque de logs"). Regras com expressão regular inválida SHALL ser ignoradas com aviso, sem afetar as demais.

#### Scenario: Regra personalizada
- **GIVEN** o usuário adiciona a regra `{ "pattern": "PEDIDO-\d+", "foreground": "#58a6ff" }`
- **WHEN** a saída contém `PEDIDO-42 criado`
- **THEN** `PEDIDO-42` aparece em azul

#### Scenario: Desligar
- **GIVEN** o destaque está ligado
- **WHEN** o usuário aciona "Alternar destaque de logs"
- **THEN** a saída nova deixa de ser destacada
