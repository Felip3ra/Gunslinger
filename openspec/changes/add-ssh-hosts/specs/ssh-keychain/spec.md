## Purpose

Guarda chaves SSH, senhas e identidades num lugar só, cifrado pelo sistema operacional, para que os hosts as reutilizem sem que os segredos fiquem expostos no disco ou na interface.

## ADDED Requirements

### Requirement: Chaves privadas
O keychain SHALL aceitar chaves privadas Ed25519, ECDSA e RSA nos formatos OpenSSH e PEM, importadas de arquivo (cópia guardada no keychain), coladas como texto ou mantidas como referência a um arquivo em disco. Cada chave SHALL mostrar nome, tipo, fingerprint SHA256 e a chave pública, com botão para copiar a pública.

#### Scenario: Importar uma chave com frase-senha
- **WHEN** o usuário importa `id_ed25519` protegida por frase-senha e informa a frase
- **THEN** a chave aparece com tipo "ED25519" e o fingerprint, e a frase só é guardada se o usuário marcar "Salvar frase-senha"

#### Scenario: Arquivo que não é chave
- **WHEN** o usuário importa um arquivo que não é uma chave privada suportada
- **THEN** o app mostra "Formato de chave não reconhecido" e nada é gravado

### Requirement: Gerar chaves
O keychain SHALL gerar pares de chaves Ed25519 (padrão) e RSA de 4096 bits, com frase-senha opcional, e SHALL oferecer exportar a chave privada e a pública para arquivo.

#### Scenario: Gerar e copiar a pública
- **WHEN** o usuário gera uma chave Ed25519 chamada "laptop"
- **THEN** a chave aparece no keychain e "Copiar chave pública" coloca na área de transferência uma linha `ssh-ed25519 AAAA... laptop`

### Requirement: Identidades
Uma identidade SHALL combinar um usuário com senha e/ou chave. Hosts e grupos SHALL poder usar uma identidade em vez de preencher usuário e credencial; alterar a identidade SHALL valer para todos os hosts que a usam.

#### Scenario: Trocar a senha de uma identidade compartilhada
- **GIVEN** 4 hosts usam a identidade "deploy"
- **WHEN** o usuário troca a senha da identidade
- **THEN** a próxima conexão a qualquer um dos 4 hosts usa a senha nova

### Requirement: Segredos cifrados e fora do renderer
Senhas, frases-senha e conteúdo de chaves privadas SHALL ser gravados cifrados pelo cofre do sistema (DPAPI no Windows) e MUST NOT ser enviados ao renderer. A interface SHALL mostrar só se o segredo existe e oferecer substituir ou apagar. Se o cofre do sistema não estiver disponível, o app SHALL recusar salvar segredos e explicar o motivo, e as conexões SHALL pedir a credencial a cada vez.

#### Scenario: Editar uma identidade com senha
- **GIVEN** a identidade "deploy" tem senha salva
- **WHEN** o usuário abre o formulário da identidade
- **THEN** o campo mostra "Senha salva" com "Substituir" e "Apagar", sem revelar a senha

#### Scenario: Arquivo de segredos copiado para outra conta
- **GIVEN** o arquivo de segredos foi copiado de outro usuário do Windows
- **WHEN** o app tenta usá-lo
- **THEN** os segredos que não podem ser decifrados aparecem como "indisponível" e a conexão pede a credencial

### Requirement: Credencial em uso
Excluir uma chave ou identidade usada por hosts ou grupos SHALL listar quem a usa e pedir confirmação; depois de excluída, esses hosts SHALL voltar a herdar ou pedir a credencial ao conectar.

#### Scenario: Excluir chave em uso
- **GIVEN** a chave "deploy-ed25519" é usada por 2 hosts
- **WHEN** o usuário a exclui
- **THEN** o app mostra os 2 hosts e só exclui depois da confirmação

### Requirement: Agente SSH
O Gunslinger SHALL usar o agente SSH quando habilitado nas configurações (OpenSSH do Windows ou Pageant), tentando as chaves do agente antes de pedir senha. Hosts SHALL poder ativar o encaminhamento do agente; o encaminhamento SHALL vir desligado por padrão.

#### Scenario: Chave no agente do Windows
- **GIVEN** o serviço `ssh-agent` do Windows tem a chave carregada e o host não define credencial
- **WHEN** o usuário conecta
- **THEN** a autenticação usa a chave do agente sem pedir nada
