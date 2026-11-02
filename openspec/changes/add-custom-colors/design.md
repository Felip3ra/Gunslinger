## Decisions

- **Componente único** (`components/ColorPicker.tsx`): botão com a cor atual abre um popover com rascunho local; **Aplicar** chama `onChange` uma vez; Esc ou clique fora descarta. Assim o `settings.json` não é regravado durante o arraste.
- **Conversão pura** em `shared/colors.ts` (`parseColor`, `hexToRgb`, `rgbToHex`, `addToPalette`), com testes. Toda cor gravada é normalizada para `#rrggbb` minúsculo.
- **Interface**: `appearance.ui` mapeia para as variáveis CSS (`--bg`, `--accent`...), aplicadas em `document.documentElement` ao iniciar e a cada `config:changed`. Campos ausentes usam o padrão (arquivos antigos continuam válidos).
- **Paleta**: `appearance.palette` (até 32 cores, sem repetição, a mais nova primeiro). Clique aplica no rascunho; botão direito remove.

## Risks / Trade-offs

- Combinações ilegíveis (texto da cor do fundo) são possíveis; "Restaurar cores padrão" desfaz, e o histórico de dados também.
