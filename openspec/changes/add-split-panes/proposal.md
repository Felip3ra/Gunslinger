## Why

Rodar a API e o front lado a lado, ou acompanhar um `dotnet watch` enquanto se usa outro shell, hoje exige alternar entre abas. Dividir a aba em painéis deixa tudo visível ao mesmo tempo.

## What Changes

- Uma aba pode ser dividida em **painéis** (lado a lado ou empilhados), em qualquer profundidade; cada painel é um terminal independente com o próprio shell.
- Atalhos: dividir à direita (Alt+Shift+=), dividir abaixo (Alt+Shift+-), focar o próximo painel (Alt+→ / Alt+←), e Ctrl+W fecha o painel ativo (a aba fecha junto com o último painel).
- Clique foca o painel; o painel ativo fica destacado; as divisórias podem ser arrastadas para redimensionar.
- Barra de status, comandos salvos, busca, links e integração passam a valer para o **painel ativo**.

## Capabilities

### New Capabilities
- `split-panes`: divisão de abas em painéis, foco, redimensionamento e fechamento.

### Modified Capabilities
_Nenhuma (o MVP ainda não foi arquivado; o comportamento de abas sem divisão não muda)._

## Impact

Renderer: novo modelo de layout (árvore de painéis) e fatia do store; `TabBar` passa a listar grupos; `TerminalArea` renderiza o layout. Main e contrato de IPC não mudam: cada painel continua sendo uma sessão de PTY.
