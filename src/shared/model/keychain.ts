import { z } from 'zod';

export const sshKeyTypes = ['ed25519', 'ecdsa', 'rsa'] as const;
export type SshKeyType = (typeof sshKeyTypes)[number];

/**
 * Metadados de uma chave privada. O conteúdo cifrado fica em secrets.json, referenciado por id;
 * estes ids nunca saem do processo principal (o renderer recebe `PublicSshKey`).
 */
export const sshKeySchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    type: z.enum(sshKeyTypes),
    /** `SHA256:...` da chave pública. */
    fingerprint: z.string().min(1),
    /** Linha OpenSSH da pública (`ssh-ed25519 AAAA... comentário`). */
    publicKey: z.string().min(1),
    comment: z.string().max(256),
    /** 'stored': cópia cifrada no keychain; 'file': lida do disco a cada conexão. */
    source: z.enum(['stored', 'file']),
    filePath: z.string().min(1).optional(),
    privateKeySecretId: z.string().min(1).optional(),
    passphraseSecretId: z.string().min(1).optional(),
    /** A chave exige frase-senha (salva ou não). */
    encrypted: z.boolean(),
    createdAt: z.number(),
  })
  .refine((k) => (k.source === 'file' ? !!k.filePath && !k.privateKeySecretId : !!k.privateKeySecretId && !k.filePath), {
    message: "chave 'file' precisa de filePath; chave 'stored' precisa do segredo da chave privada",
  });
export type SshKey = z.infer<typeof sshKeySchema>;

export const identitySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  username: z.string().trim().min(1).max(256),
  keyId: z.string().min(1).optional(),
  passwordSecretId: z.string().min(1).optional(),
});
export type Identity = z.infer<typeof identitySchema>;

export const keychainFileSchema = z.object({
  version: z.literal(1),
  keys: z.array(sshKeySchema),
  identities: z.array(identitySchema),
});
export type KeychainFile = z.infer<typeof keychainFileSchema>;
export const defaultKeychainFile: KeychainFile = { version: 1, keys: [], identities: [] };

/** Situação de um segredo, como o renderer a vê. */
export type SecretState = 'none' | 'saved' | 'unavailable';

/** Chave vista pelo renderer: sem ids de segredo nem conteúdo privado. */
export interface PublicSshKey {
  id: string;
  name: string;
  type: SshKeyType;
  fingerprint: string;
  publicKey: string;
  comment: string;
  source: 'stored' | 'file';
  filePath: string | null;
  encrypted: boolean;
  privateKey: SecretState;
  passphrase: SecretState;
  createdAt: number;
}

export interface PublicIdentity {
  id: string;
  name: string;
  username: string;
  keyId: string | null;
  password: SecretState;
}

/** Origem de uma chave importada: arquivo (copiado ou referenciado) ou texto colado. */
export type KeySource = { kind: 'file'; path: string; mode: 'copy' | 'reference' } | { kind: 'text'; text: string };

/** O que fazer com um segredo ao salvar um formulário. */
export type SecretChange = { action: 'keep' } | { action: 'set'; value: string } | { action: 'clear' };

export type KeychainResult<T = object> = ({ ok: true } & T) | { ok: false; error: string; needsPassphrase?: boolean };

/** Quem usa uma chave ou identidade (nomes, para a confirmação de exclusão). */
export interface KeychainUsage {
  hosts: string[];
  groups: string[];
  identities: string[];
}

export interface KeychainSnapshot {
  keys: PublicSshKey[];
  identities: PublicIdentity[];
  /** false quando o cofre do sistema não está disponível: segredos não podem ser salvos. */
  secretsAvailable: boolean;
}
