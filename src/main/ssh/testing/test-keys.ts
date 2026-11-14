import { utils } from 'ssh2';

type Ed25519Options = { comment?: string; passphrase?: string; cipher?: string; rounds?: number };

/**
 * Par Ed25519 para os testes. O ssh2 gera, cerca de 1 vez em 300, uma chave privada que ele mesmo
 * não consegue ler; aqui a chave é conferida e gerada de novo nesse caso (o app faz o mesmo em
 * key-codec.ts), para os testes não falharem ao acaso.
 */
export function testKeyPair(options: Ed25519Options = {}): { private: string; public: string } {
  for (;;) {
    const pair = utils.generateKeyPairSync('ed25519', options as never);
    if (!(utils.parseKey(pair.private, options.passphrase) instanceof Error)) return pair;
  }
}
