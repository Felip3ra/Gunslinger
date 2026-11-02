## 1. Domínio

- [x] 1.1 Schema `logHighlight` (regras padrão) em settings e `shared/log-highlight.ts` (compilar, `findMatches`) com testes

## 2. Renderer

- [x] 2.1 `LogHighlighter` (varredura incremental, decorations, ignora tela alternativa) ligado ao `TerminalRegistry`
- [x] 2.2 Ação "Alternar destaque de logs" e aplicação ao vivo das regras

## 3. Verificação

- [x] 3.1 e2e: erro destacado sem alterar o texto, regra personalizada, desligar
