## Purpose

Protege as conexões SSH contra servidores falsos verificando a chave do servidor em toda conexão e deixando o usuário decidir, com o fingerprint à vista, quando ela é nova ou mudou.

## ADDED Requirements

### Requirement: Verificação em toda conexão
Toda conexão SSH, inclusive a de hosts de salto, SHALL comparar a chave do servidor com a lista de hosts conhecidos (por endereço e porta) antes de enviar qualquer credencial.

#### Scenario: Host conhecido
- **GIVEN** a chave de `10.0.0.12:22` está na lista e o servidor apresenta a mesma chave
- **WHEN** o usuário conecta
- **THEN** a conexão segue sem perguntar nada

### Requirement: Host novo
Quando o servidor não está na lista, o app SHALL mostrar endereço, porta, tipo e fingerprint SHA256 da chave e oferecer "Confiar e conectar", "Conectar só desta vez" e "Cancelar". Nada SHALL ser enviado ao servidor antes da escolha. Cancelar SHALL fechar a conexão e deixar a aba como "Conexão cancelada".

#### Scenario: Confiar num host novo
- **WHEN** o usuário conecta pela primeira vez a `10.0.0.12` e escolhe "Confiar e conectar"
- **THEN** a chave é gravada na lista e a próxima conexão não pergunta

### Requirement: Chave alterada
Quando o servidor apresenta uma chave diferente da gravada, o app SHALL bloquear a conexão e mostrar um aviso de possível ataque com os fingerprints antigo e novo. Só SHALL ser possível prosseguir pela ação explícita "Substituir a chave gravada", que exige confirmação.

#### Scenario: Servidor reinstalado
- **GIVEN** a chave gravada de `10.0.0.12` é diferente da que o servidor apresenta
- **WHEN** o usuário conecta
- **THEN** a conexão é bloqueada, o aviso mostra os dois fingerprints e nenhuma credencial é enviada

### Requirement: Gestão da lista
As configurações SHALL listar os hosts conhecidos (endereço, porta, tipo, fingerprint, data em que foi aceito), com busca e exclusão, e SHALL permitir importar entradas do `~/.ssh/known_hosts`. Entradas com nome em hash SHALL ser usadas na verificação e exibidas como "nome oculto"; entradas `@revoked` SHALL bloquear a chave sem opção de substituir.

#### Scenario: Chave revogada
- **GIVEN** o `~/.ssh/known_hosts` importado tem uma entrada `@revoked` para a chave que `10.0.0.12` apresenta
- **WHEN** o usuário conecta
- **THEN** a conexão é bloqueada com "Esta chave do servidor foi revogada" e não há opção de prosseguir

#### Scenario: Importar known_hosts do OpenSSH
- **GIVEN** o `~/.ssh/known_hosts` tem a chave de `github.com`
- **WHEN** o usuário importa a lista e depois conecta a `github.com`
- **THEN** a conexão não pede confirmação de host novo
