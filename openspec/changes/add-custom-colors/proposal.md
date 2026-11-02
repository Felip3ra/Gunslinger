## Why

As cores da interface (fundo, painéis, bordas, destaque) são fixas no CSS, e as cores do terminal, dos perfis e dos ambientes dependem do seletor nativo, sem campo hexadecimal direto nem paleta própria. O usuário quer escolher qualquer cor por hexadecimal ou RGB e guardar uma paleta.

## What Changes

- Seletor de cor próprio, usado em todas as cores do app: prévia, campo hexadecimal (aceita `#rgb`, `#rrggbb`, `rgb(r, g, b)` e `r, g, b`), controles R/G/B (barra e número) e paleta.
- **Paleta customizável** em `appearance.palette`: começa com cores sugeridas; o usuário salva a cor atual, remove cores e restaura a paleta padrão.
- **Cores da interface** em `appearance.ui` (fundo, painéis, realce, borda, texto, texto secundário, destaque, erro, aviso, sucesso), aplicadas na hora, com "Restaurar cores padrão".
- A cor só é gravada ao clicar em **Aplicar** (ou Enter no campo hexadecimal), sem gravar o `settings.json` a cada movimento.

## Capabilities

### New Capabilities
- `custom-colors`: seletor de cor com hexadecimal/RGB, paleta salva e cores da interface configuráveis.

### Modified Capabilities
_Nenhuma._

## Impact

Shared: conversão e validação de cores, schema `appearance.ui` e `appearance.palette`. Renderer: componente `ColorPicker`, seção Aparência, perfis e ambientes; variáveis CSS aplicadas a partir das configurações.
