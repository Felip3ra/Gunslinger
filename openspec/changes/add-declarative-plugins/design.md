## Context

O app já tem modelos validados por zod para comandos, workspaces, perfis, temas e regras de destaque. As regras do projeto exigem que nenhum comando rode sem ação explícita e que executáveis nunca venham do renderer.

## Goals / Non-Goals

**Goals:** distribuir dados prontos copiando uma pasta; nenhum código de terceiros executa.
**Non-Goals:** loja ou download de plugins, APIs de extensão, UI customizada, plugins que alteram dados do usuário.

## Decisions

- **Só dados**: o manifesto é JSON (aceita comentários) validado por um schema estrito em `shared/plugins.ts`; chaves desconhecidas em `contributes` são erro, para que um campo digitado errado não passe em silêncio. Nada é `require`/`import`ado.
- **Ids com namespace**: comandos e workspaces viram `plugin:<id>:<item>`; perfis viram `plugin.<id>.<item>` (aceitos como `defaultProfile` e nos workspaces). Isso evita colisão com os dados do usuário.
- **Somente leitura**: contribuições não entram nos arquivos do usuário. O renderer junta na hora de exibir e marca a origem; editar/excluir não aparece para elas. Comandos de plugin passam pelo mesmo fluxo de execução (variáveis, confirmação, ação explícita).
- **Perfis**: o `ShellService` recebe os perfis de plugins e resolve como customizados com `source: 'plugin'`; ajustes do usuário (ocultar, cor) usam os `overrides`, como nos detectados. O executável é resolvido no main e um perfil sem executável aparece indisponível.
- **Temas**: aplicar um tema de plugin copia as cores para `appearance.theme`; desativar o plugin não muda o tema atual.
- **Ativação**: `settings.plugins.disabled` (lista de ids). A pasta é observada (debounce de 300 ms).
- **Erros**: cada plugin carrega isolado; manifesto inválido, ausente ou `id` repetido (o segundo em ordem alfabética da pasta) mostra o erro e não contribui.

## Risks / Trade-offs

- Um perfil de plugin aponta para um executável; é o mesmo risco de copiar um perfil customizado para o `settings.json`, e só roda quando o usuário abre uma aba com ele.
- Comandos de plugin podem ser destrutivos; continuam sujeitos à ação explícita e à mesma tela de variáveis.
