## 1. Domínio e main

- [x] 1.1 `shared/elevation.ts`: tipos de mecanismo, `planElevation` e `cmdPromptArgs`, com testes
- [x] 1.2 `ElevationService`: detecção do modo do sudo (registro) e do gsudo, com testes do parser
- [x] 1.3 `buildLaunch` com opção `elevated` (CMD via `/k prompt`) e `PtyManager` aplicando o plano de elevação; sessão guarda `elevated`
- [x] 1.4 Canais `elevation:info` e `elevation:openExternal`, `pty:create` com `elevated`; handlers e composição

## 2. Renderer

- [x] 2.1 Menu de nova aba com "Como administrador" e ações na paleta
- [x] 2.2 Marca de escudo na aba, "Administrador" na barra de status e "Elevação cancelada" (saída rápida com erro)
- [x] 2.3 Janela externa: chamada ao canal e aviso explicando como habilitar o sudo inline

## 3. Verificação

- [x] 3.1 e2e com o mecanismo forçado para a janela externa (sem UAC: o `Start-Process` é interceptado) e checagem do aviso
- [ ] 3.2 Checklist manual: sudo inline e gsudo com UAC real
