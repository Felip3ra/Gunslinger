import { z } from 'zod';
import { portSchema } from './hosts';

export const knownHostSchema = z.object({
  /** Endereço como foi conectado, ou `|1|salt|hash` (entrada importada com nome em hash). */
  host: z.string().min(1),
  port: portSchema,
  /** Tipo da chave do servidor (`ssh-ed25519`, `ecdsa-sha2-nistp256`, `ssh-rsa`...). */
  keyType: z.string().min(1),
  /** Blob da chave pública em base64. */
  key: z.string().min(1),
  addedAt: z.number(),
  /** Chave revogada (`@revoked` do OpenSSH): bloqueia sem opção de prosseguir. */
  revoked: z.boolean(),
  source: z.enum(['app', 'openssh']),
});
export type KnownHost = z.infer<typeof knownHostSchema>;

export const knownHostsFileSchema = z.object({
  version: z.literal(1),
  entries: z.array(knownHostSchema),
});
export type KnownHostsFile = z.infer<typeof knownHostsFileSchema>;
export const defaultKnownHostsFile: KnownHostsFile = { version: 1, entries: [] };

/** Entrada como o renderer a vê. */
export interface KnownHostView {
  host: string;
  port: number;
  keyType: string;
  fingerprint: string;
  addedAt: number;
  revoked: boolean;
  /** Nome em hash: o endereço original não é conhecido. */
  hashed: boolean;
}
