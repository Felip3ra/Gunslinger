## Why

Quem desenvolve .NET e Node também mantém servidores de homologação, VMs e containers remotos, e hoje sai do Gunslinger para o Termius, o PuTTY ou um `ssh user@host` digitado de memória. Não há onde guardar os servidores, as chaves ficam espalhadas em `~/.ssh` e cada conexão pede a senha de novo. Trazer o cliente SSH para dentro do app deixa o servidor remoto a uma aba de distância, como os shells locais.

## What Changes

- **Cliente SSH embutido**: abas SSH funcionam como as abas de shell (atalhos, split panes, busca, links, workspaces), com a conexão feita no processo principal, sem depender do `ssh.exe` do Windows.
- **Hosts**: cadastro de servidores (nome, endereço, porta, usuário, identidade, host de salto, cor, tags) organizados em **grupos**. Um host herda do grupo (e dos grupos acima dele) tudo o que não define.
- **Keychain**: chaves privadas (importadas ou **geradas** no app, Ed25519 ou RSA), senhas e **identidades** (usuário + senha e/ou chave). Segredos ficam cifrados pelo cofre do Windows (DPAPI, via `safeStorage`) e nunca chegam ao renderer.
- **Autenticação**: chave, senha, keyboard-interactive (inclusive 2FA) e agente SSH (OpenSSH do Windows ou Pageant). O que falta é pedido num diálogo, com opção de salvar no keychain.
- **Known hosts**: o fingerprint do servidor é verificado em toda conexão. Host novo pede confirmação; chave alterada bloqueia a conexão com aviso. Lista editável nas configurações.
- **Host de salto (ProxyJump)**: conexão através de um ou mais hosts intermediários.
- **Importar `~/.ssh/config`**: hosts, usuários, portas, chaves e ProxyJump viram cadastro no app.
- **Sidebar e paleta**: seção "Hosts" com busca, conexão rápida (`user@host:porta`) e entradas "Conectar: <host>" no Ctrl+P.
- **Exportação**: hosts e grupos entram na exportação JSON existente, sempre sem segredos.

### Fora do escopo

SFTP, port forwarding, broadcast de entrada e autocomplete (changes `add-sftp`, `add-port-forwarding`, `add-broadcast-input`, `add-command-autocomplete`), Telnet, Mosh, porta serial, comando inicial por host, sincronização na nuvem e cofre de equipe.

## Capabilities

### New Capabilities
- `ssh-hosts`: cadastro de hosts e grupos, herança de configuração, conexão rápida, importação do `~/.ssh/config` e exportação sem segredos.
- `ssh-keychain`: chaves, senhas e identidades, geração de chaves, armazenamento cifrado e uso do agente SSH.
- `ssh-known-hosts`: verificação do fingerprint do servidor, confirmação de host novo, bloqueio de chave alterada e gestão da lista.
- `ssh-sessions`: abas SSH, fluxo de autenticação, host de salto, keepalive, desconexão e reconexão.

### Modified Capabilities
_Nenhuma: não há specs arquivadas em `openspec/specs/`. A integração com abas, workspaces, paleta e exportação é descrita nas novas capabilities._

## Impact

- **Dependência**: `ssh2` (cliente SSH em JavaScript; o módulo nativo opcional `cpu-features` não é necessário).
- **Shared**: schemas de hosts, grupos, keychain e known hosts; resolução da herança; leitor do `~/.ssh/config`; formatação de fingerprint.
- **Main**: `src/main/ssh/` (pool de conexões, sessão SSH ao lado da PTY, keychain, known hosts); nova porta `SecretPort` em `ports.ts` com adaptador `safeStorage`; canais `hosts:*`, `keychain:*`, `knownHosts:*` e `ssh:*`.
- **Arquivos**: `%APPDATA%/Gunslinger/hosts.json`, `keychain.json` (só metadados), `secrets.json` (cifrado) e `known_hosts.json`; `settings.json` ganha a seção `ssh` (agente, keepalive, timeout) e os workspaces ganham painéis SSH (`hostId`).
- **Main existente**: `StatusService`, `PortService`, rastreador de processos e `quit-flow` passam a distinguir sessões locais de SSH.
- **Renderer**: fatia `hosts` no store, seção "Hosts" na sidebar, diálogos de host, identidade, chave, autenticação e fingerprint; abas ganham o tipo SSH.
