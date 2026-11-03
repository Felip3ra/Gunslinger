## 1. Main

- [x] 1.1 `shared/update.ts` (estados e intervalos) e `updates.auto` nas configurações
- [x] 1.2 `UpdateService` com agendamento, deduplicação da verificação e mensagens de erro curtas, com testes
- [x] 1.3 Adaptador `electron-updater`; canais `update:*`; reinício pelo fluxo de saída

## 2. Renderer

- [x] 2.1 Barra de status (progresso e "Reiniciar"), seção "Sobre e atualizações" e ação "Procurar atualizações"

## 3. Publicação

- [x] 3.1 `publish` no electron-builder, `dist` sem publicar e workflow `release.yml`

## 4. Verificação

- [x] 4.1 e2e: no modo de desenvolvimento a seção informa que a atualização só existe no app instalado
