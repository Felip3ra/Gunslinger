## Purpose

Oferece aos projetos Node.js os scripts do `package.json` e os comandos mais comuns (instalar e adicionar pacotes, npx) como comandos prontos, usando o gerenciador de pacotes certo de cada pacote.

## ADDED Requirements

### Requirement: Detecção de pacotes Node
Para projetos do tipo Node.js, o Gunslinger SHALL encontrar todos os arquivos `package.json` na raiz e em subpastas até 4 níveis abaixo, ignorando `node_modules`, `bin`, `obj` e pastas ocultas. Cada `package.json` SHALL virar um pacote do projeto, identificado pelo caminho relativo da pasta (ou "raiz").

#### Scenario: Front-end em subpasta
- **GIVEN** o projeto tem `frontend/package.json` e nenhum `package.json` na raiz
- **WHEN** o projeto é aberto
- **THEN** o painel mostra o grupo "Node: frontend"

#### Scenario: node_modules ignorado
- **GIVEN** `frontend/node_modules` contém milhares de `package.json`
- **WHEN** a detecção roda
- **THEN** só `frontend/package.json` é considerado e a detecção termina sem travar a UI

### Requirement: Scripts como comandos prontos
Cada entrada da seção `scripts` de um pacote SHALL aparecer como um comando pronto no grupo do pacote e na paleta, com o nome do script como título e o conteúdo do script como descrição. Executar um script SHALL enviar o comando de execução do gerenciador de pacotes do pacote (`npm run <script>`, `yarn run <script>` ou `pnpm run <script>`), na pasta do pacote. A ação "Inserir" SHALL permitir acrescentar argumentos antes de pressionar Enter.

#### Scenario: Listar scripts
- **GIVEN** `frontend/package.json` tem os scripts `dev`, `build` e `lint` e o pacote usa npm
- **WHEN** o usuário abre o grupo "Node: frontend"
- **THEN** aparecem os comandos `dev`, `build` e `lint`, e cada um mostra o conteúdo do script

#### Scenario: Executar script
- **GIVEN** o pacote `frontend` usa pnpm
- **WHEN** o usuário executa o script `build`
- **THEN** o terminal recebe `pnpm run build` com `frontend` como pasta

#### Scenario: package.json sem scripts
- **GIVEN** um pacote cujo `package.json` não tem a seção `scripts`
- **WHEN** o usuário abre o grupo do pacote
- **THEN** o grupo mostra só os comandos prontos de Node e a mensagem "Nenhum script"

### Requirement: Detecção do gerenciador de pacotes
O Gunslinger SHALL definir o gerenciador de pacotes de cada pacote nesta ordem:
1. escolha manual do usuário para aquele pacote, nas configurações do projeto;
2. campo `packageManager` do `package.json` (por exemplo `pnpm@9.1.0`);
3. arquivo de lock, procurado da pasta do pacote até a raiz do projeto: `package-lock.json` → npm, `yarn.lock` → yarn, `pnpm-lock.yaml` → pnpm;
4. npm, quando não houver nada disso.

Se houver arquivos de lock de mais de um gerenciador na mesma pasta, o Gunslinger SHALL usar npm e exibir um aviso no grupo do pacote pedindo que o usuário escolha.

#### Scenario: Lock do yarn
- **GIVEN** `frontend` tem `yarn.lock` e o `package.json` não tem o campo `packageManager`
- **WHEN** o pacote é detectado
- **THEN** o grupo mostra o gerenciador "yarn" e os comandos usam `yarn`

#### Scenario: Monorepo com lock na raiz
- **GIVEN** a raiz do projeto tem `pnpm-lock.yaml` e o pacote `packages/web` não tem arquivo de lock
- **WHEN** o pacote `packages/web` é detectado
- **THEN** ele usa pnpm

#### Scenario: Vários arquivos de lock
- **GIVEN** `frontend` tem `package-lock.json` e `yarn.lock`
- **WHEN** o pacote é detectado
- **THEN** o grupo usa npm e mostra o aviso "Vários arquivos de lock encontrados: escolha o gerenciador"

### Requirement: Comandos prontos de Node
Cada pacote SHALL ter estes comandos prontos, montados de acordo com o gerenciador de pacotes:

| Comando | npm | yarn | pnpm |
|---|---|---|---|
| Instalar dependências | `npm install` | `yarn install` | `pnpm install` |
| Adicionar pacote | `npm install {pacote}` | `yarn add {pacote}` | `pnpm add {pacote}` |
| Adicionar pacote de desenvolvimento | `npm install -D {pacote}` | `yarn add -D {pacote}` | `pnpm add -D {pacote}` |
| Rodar npx | `npx {comando}` | `npx {comando}` (yarn 1) / `yarn dlx {comando}` (yarn 2+) | `pnpm dlx {comando}` |

Os comandos SHALL ser executados na pasta do pacote.

#### Scenario: Adicionar pacote de desenvolvimento com npm
- **GIVEN** o pacote `frontend` usa npm
- **WHEN** o usuário aciona "Adicionar pacote de desenvolvimento" e informa `pacote=vitest`
- **THEN** o terminal recebe `npm install -D vitest` com `frontend` como pasta

#### Scenario: npx com pnpm
- **GIVEN** o pacote usa pnpm
- **WHEN** o usuário aciona "Rodar npx" e informa `comando=create-vite@latest app`
- **THEN** o terminal recebe `pnpm dlx create-vite@latest app`

### Requirement: Atualização quando o package.json muda
Quando um `package.json` conhecido for alterado, criado ou removido, o Gunslinger SHALL atualizar a lista de scripts e o gerenciador do pacote em até 2 segundos, sem reiniciar o app. Se o `package.json` ficar com JSON inválido, o grupo SHALL mostrar o erro e manter a última lista válida, marcada como desatualizada.

#### Scenario: Novo script
- **GIVEN** o grupo "Node: frontend" está visível
- **WHEN** o usuário adiciona o script `"test": "vitest"` ao `package.json` e salva
- **THEN** em até 2 segundos o comando `test` aparece no grupo e na paleta

#### Scenario: package.json inválido
- **GIVEN** o grupo "Node: frontend" mostra três scripts
- **WHEN** o usuário salva o `package.json` com uma vírgula sobrando
- **THEN** o grupo mostra "package.json inválido" e mantém os três scripts marcados como desatualizados

### Requirement: Verificação do Node
Ao abrir um projeto do tipo Node.js e antes do primeiro comando de Node numa sessão, o Gunslinger SHALL verificar se o executável `node` está no PATH do ambiente atual do app e se o gerenciador de pacotes do pacote está disponível. Como o shell da aba pode ter um PATH diferente do app (por exemplo com fnm), a verificação MUST NOT impedir a execução: se algo faltar, o Gunslinger SHALL mostrar um aviso dizendo o que falta, com as opções "Executar mesmo assim", "Recarregar ambiente" e "Cancelar", e só envia o comando se o usuário escolher "Executar mesmo assim". A verificação SHALL ser ignorada quando o comando for executado numa aba WSL, que usa as ferramentas do Linux.

#### Scenario: Node ausente
- **GIVEN** o `node` não está no PATH do app
- **WHEN** o usuário aciona o script `dev`
- **THEN** aparece o aviso "Node.js não encontrado no PATH" com as opções "Executar mesmo assim", "Recarregar ambiente" e "Cancelar", e nada é enviado antes da escolha

#### Scenario: Node só no shell (fnm)
- **GIVEN** o Node só fica disponível dentro do shell, configurado pelo fnm no perfil do PowerShell
- **WHEN** o usuário aciona o script `dev` e escolhe "Executar mesmo assim"
- **THEN** o comando é enviado e roda normalmente na aba

#### Scenario: Aba WSL
- **GIVEN** a aba ativa é WSL e o `node` do Windows não está no PATH
- **WHEN** o usuário executa um script
- **THEN** nenhum aviso aparece e o comando é enviado à aba WSL

#### Scenario: pnpm ausente
- **GIVEN** o Node está instalado, mas o pacote usa pnpm e o `pnpm` não está no PATH
- **WHEN** o usuário aciona "Instalar dependências"
- **THEN** o aviso diz que o pnpm não foi encontrado, sugere `corepack enable` ou `npm install -g pnpm` e oferece "Executar mesmo assim"
