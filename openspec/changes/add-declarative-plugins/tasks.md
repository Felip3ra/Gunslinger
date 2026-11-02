## 1. Domínio e main

- [x] 1.1 `shared/plugins.ts`: schema do manifesto, ids com namespace e junção das contribuições, com testes
- [x] 1.2 `settings.plugins.disabled`; `PluginService` (leitura, observação, ativação), com testes; canais, handlers e evento
- [x] 1.3 Perfis de plugins no `ShellService` (`source: 'plugin'`, overrides), com testes

## 2. Renderer

- [x] 2.1 Fatia `plugins`; comandos na paleta e no painel, workspaces, regras de destaque e temas em Aparência
- [x] 2.2 Seção "Plugins" nas configurações (lista, erro, ativar, abrir pasta, recarregar)

## 3. Verificação

- [x] 3.1 e2e: plugin com comando e workspace aparece; manifesto inválido mostra o erro; desativar remove o comando
