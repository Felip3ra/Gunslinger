## 1. Domínio (shared)

- [ ] 1.1 `sftp-plan.ts`: plano de transferência recursiva, nomes `(1)`/`(2)` sem colisão e "aplicar aos próximos", com testes
- [ ] 1.2 Permissões (`rwxr-xr-x` ↔ octal, aplicação recursiva só em pastas/arquivos conforme escolha) e junção de caminhos POSIX/Windows, com testes
- [ ] 1.3 Schemas zod dos canais `sftp:*` (caminhos sem byte nulo, limites de tamanho), com testes

## 2. Main

- [ ] 2.1 `SftpService.open/close` sobre `SshConnectionPool` (acquire/release, "servidor não oferece SFTP", queda da conexão), com testes usando cliente falso
- [ ] 2.2 Listagem remota e local (`fs:list`, só leitura, caminhos absolutos), `realpath`, mkdir, rename, delete recursivo com contagem prévia (local pela Lixeira via `DesktopPort.trashItem`) e chmod recursivo, com testes de erros (não encontrado, permissão negada)
- [ ] 2.3 Fila de transferências (3 simultâneas, `fastGet`/`fastPut`, progresso a cada 250 ms, cancelar removendo o parcial), com testes
- [ ] 2.4 Retomada (parcial menor que a origem e trecho final de até 64 KB idêntico → append; senão recomeço; conferência do tamanho final), com testes dos dois caminhos e do arquivo final idêntico
- [ ] 2.5 Edição remota: download para `%TEMP%/Gunslinger/sftp-edit`, observador com debounce e hash, `pushEdit` com detecção de conflito, limpeza ao fechar e ao abrir o app; testes
- [ ] 2.6 Canais, handlers (`ipc/handlers/sftp.ts`) e linha em `composition.ts`; `webUtils.getPathForFile` exposto no preload; verificar com `npm run typecheck` e `npm run lint`

## 3. Renderer

- [ ] 3.1 Fatia `sftp-slice.ts` e `Tab` com `kind: 'sftp'` (sem `sessionId` de terminal); `TerminalArea` escolhe o componente pela `kind`; foco, fechar e dividir funcionando; ações de terminal desabilitadas no painel SFTP; testes da `layout-slice`
- [ ] 3.2 `sftp` no `workspacePaneSchema` (host e duas pastas), salvo em workspaces e na última sessão e reaberto desconectado; teste de compatibilidade com workspaces antigos
- [ ] 3.3 Ações "Abrir SFTP" na aba SSH, no menu do host e na paleta (abre em aba ou dividindo)
- [ ] 3.4 `SftpPanel` com duas colunas virtualizadas (caminho editável, voltar, subir, atualizar, ordenar, ocultos, permissões e dono)
- [ ] 3.5 Arrastar entre colunas e do Explorer, botões enviar/baixar, fila com progresso, velocidade, tempo restante, cancelar e "Tentar de novo"
- [ ] 3.6 Diálogos de conflito e de permissões; confirmação de exclusão com contagem; pergunta "Enviar alterações para <host>?" com aviso de conflito

## 4. Verificação

- [ ] 4.1 e2e contra o servidor SSH de teste de `add-ssh-hosts`: abrir SFTP sem novo prompt, upload e download de pasta, conflito "Manter os dois", cancelar, chmod, exclusão local para a Lixeira, edição remota com envio confirmado e painel SFTP restaurado desconectado
