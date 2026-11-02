## Context

`ConfigStore` é o dono dos quatro arquivos de dados e já avisa mudanças (`onChange`), inclusive edições externas detectadas pelo watcher. A gravação é atômica com `.bak`.

## Goals / Non-Goals

**Goals:** histórico local, automático e deduplicado; restauração reversível.
**Non-Goals:** serviço remoto, merge entre máquinas, histórico do `state.json` (estado de UI).

## Decisions

- **Formato**: um arquivo JSON por snapshot em `<dados>/history/<id>.json`, com metadados (data, tipo, nome, contagens, hash) e o texto bruto de cada arquivo. Guardar o texto preserva comentários do `settings.json`.
- **Quando**: ao iniciar e após cada mudança (debounce de 3 s). Se algum arquivo estiver inválido (somente leitura), não há captura automática: o snapshot seria parcial.
- **Deduplicação**: hash (FNV-1a, em `shared`) do conjunto de textos; igual ao do snapshot mais recente, nada é gravado.
- **Retenção**: pura em `shared` (`entriesToPrune`): mantém os 50 automáticos mais recentes; manuais e "Antes de restaurar" ficam até o usuário excluir.
- **Restauração**: `ConfigStore.restoreFiles` valida todos os textos antes de gravar qualquer um; se algum for inválido, nada muda. É ação explícita com confirmação, então pode substituir um arquivo inválido (o conteúdo anterior fica no `.bak`).

## Risks / Trade-offs

- Snapshots ocupam disco: cada um tem poucos KB; 50 automáticos é pouco.
- Restaurar `settings.json` aplica tudo de uma vez (fonte, atalhos, perfis), o que é o esperado de "voltar a um ponto".
