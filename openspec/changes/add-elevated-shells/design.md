## Context

Um processo elevado não pode ser filho de um ConPTY criado por um processo não elevado. Ferramentas como o sudo do Windows (modo inline) e o gsudo resolvem isso: o processo elevado é criado por um serviço/instância elevada e ligado ao console de quem pediu.

## Decisions

- **Detecção** (`main/elevation/elevation-service.ts`): lê `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Sudo` → `Enabled` (DWORD: 1 = nova janela, 2 = entrada desabilitada, 3 = inline). Só o valor 3 serve para uma aba (com 2 o shell não recebe teclado). Depois, `gsudo.exe` no PATH. Resultado em cache e refeito em "Recarregar ambiente".
- **Plano puro** (`shared/elevation.ts`): `planElevation(mechanism, spec)` transforma a linha de comando do shell (`file`, `args`, `cwd`) em: `sudo --inline <file> <args>`, `gsudo <file> <args>` ou `powershell -NoProfile -Command Start-Process -Verb RunAs ...` (janela externa).
- **CMD elevado**: a integração vai em `/k prompt <valor>` em vez da variável `PROMPT`, porque o ambiente do processo pedinte pode não atravessar a elevação.
- **Contrato**: `pty:create` ganha `elevated?: boolean`; novo canal `elevation:info` (mecanismo atual) e `elevation:openExternal` (janela separada). A sessão guarda `elevated` e o renderer marca a aba.
- **UAC recusado**: sudo/gsudo terminam com código diferente de 0 logo após iniciar; a aba elevada que termina com erro em menos de 3 s mostra "Elevação cancelada".

## Risks / Trade-offs

- [Processos elevados não podem ser encerrados por um `taskkill` não elevado] → o encerramento depende do fechamento do console (ConPTY), que termina o shell elevado; documentado.
- [Não é possível testar o UAC de forma automatizada] → o plano de elevação e a detecção são testados como funções puras; o fluxo real é verificação manual.
