## Purpose

Permite escolher qualquer cor do app por hexadecimal ou RGB, guardar uma paleta própria e personalizar as cores da interface.

## ADDED Requirements

### Requirement: Seletor de cor
Todo campo de cor do app SHALL usar o seletor do Gunslinger, com campo hexadecimal (aceitando `#rgb`, `#rrggbb`, `rgb(r, g, b)` e `r, g, b`), controles R, G e B de 0 a 255 e prévia. A cor SHALL ser gravada só ao aplicar, normalizada como `#rrggbb`; valor inválido SHALL ser indicado e não gravado.

#### Scenario: Cor por hexadecimal
- **WHEN** o usuário digita `#ff8800` no campo da cor "Destaque" e aplica
- **THEN** `appearance.ui.accent` vira `#ff8800` e a interface muda na hora

#### Scenario: Cor por RGB
- **WHEN** o usuário ajusta R=18, G=52, B=86 e aplica
- **THEN** a cor gravada é `#123456`

### Requirement: Paleta customizável
O seletor SHALL mostrar a paleta de `appearance.palette`; o usuário SHALL poder salvar a cor do rascunho, remover uma cor e restaurar a paleta padrão.

#### Scenario: Salvar na paleta
- **WHEN** o usuário salva `#123456` na paleta
- **THEN** a cor aparece primeiro na paleta de todos os seletores

### Requirement: Cores da interface
As cores da interface SHALL vir de `appearance.ui` e SHALL ter "Restaurar cores padrão".

#### Scenario: Restaurar
- **WHEN** o usuário restaura as cores padrão da interface
- **THEN** `appearance.ui` volta aos valores padrão
