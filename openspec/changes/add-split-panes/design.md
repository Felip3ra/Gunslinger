## Context

No MVP, `Tab` é a unidade de terminal (sessão, pasta, status) e a `TabBar` lista as abas. Muito código depende desse modelo (status, comandos, integração, busca).

## Decisions

- **Painel = `Tab` atual**: o objeto `Tab` do store passa a representar um painel (o nome é mantido para não espalhar mudanças). `activeKey` é o painel ativo.
- **Grupos**: nova fatia `layout` com `groups: { id, root: LayoutNode, lastActive }[]`. `LayoutNode = { type: 'pane', key } | { type: 'split', direction: 'row' | 'column', children, sizes }`. A `TabBar` lista os grupos; o título vem do painel ativo (ou do último ativo) do grupo, com um contador quando há mais de um painel.
- **Regras puras** (`renderer/src/layout/layout.ts`, testadas): `splitPane`, `removePane` (desfaz divisões com um filho só), `panesOf` (ordem de leitura), `nextPane`, `setSizes`.
- **Renderização**: cada grupo é um contêiner absoluto (visível só o ativo) com flexbox aninhado; divisórias de 4 px com arraste; `ResizeObserver` em cada painel chama `fit()`.
- **Atalhos**: `pane.splitRight`, `pane.splitDown`, `pane.focusNext`, `pane.focusPrev`; `tab.next/prev` passam a navegar entre grupos.

## Risks / Trade-offs

- [Muitos painéis numa aba deixam os terminais pequenos] → tamanho mínimo de 10% por painel ao arrastar.
- [Fit de terminais invisíveis] → só o grupo ativo é ajustado; os demais ajustam ao serem ativados (como já acontece com abas).
