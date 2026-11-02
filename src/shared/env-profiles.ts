import { z } from 'zod';
import type { ShellType } from './model/profiles';

const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const environmentProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#58a6ff'),
  /** Ambiente sensível (ex.: Produção): aplicar exige confirmação explícita. */
  confirm: z.boolean().default(false),
  variables: z.record(z.string().regex(VAR_NAME, 'nome de variável inválido'), z.string()),
});
export type EnvironmentProfile = z.infer<typeof environmentProfileSchema>;

const ps = (v: string): string => `'${v.replace(/'/g, "''")}'`;
const sh = (v: string): string => `'${v.replace(/'/g, String.raw`'\''`)}'`;

/** Comandos que definem as variáveis no shell em execução, ou null se o tipo de shell é desconhecido. */
export function envCommands(shellType: ShellType, variables: Record<string, string>): string[] | null {
  const entries = Object.entries(variables).filter(([name]) => VAR_NAME.test(name));
  switch (shellType) {
    case 'cmd':
      // Aspas em volta de "NOME=valor" preservam espaços e evitam espaços sobrando no fim.
      return entries.map(([n, v]) => `set "${n}=${v}"`);
    case 'powershell':
    case 'pwsh':
      return entries.map(([n, v]) => `$env:${n} = ${ps(v)}`);
    case 'gitbash':
    case 'wsl':
      return entries.map(([n, v]) => `export ${n}=${sh(v)}`);
    case 'custom':
      return null;
  }
}

/** Texto "NOME=valor" por linha (edição) ↔ objeto de variáveis. */
export function parseVariablesText(text: string): { variables: Record<string, string>; errors: string[] } {
  const variables: Record<string, string> = {};
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    const name = eq > 0 ? line.slice(0, eq).trim() : '';
    if (!VAR_NAME.test(name)) errors.push(`Linha ${i + 1}: use NOME=valor`);
    else variables[name] = line.slice(eq + 1);
  });
  return { variables, errors };
}

export function variablesToText(variables: Record<string, string>): string {
  return Object.entries(variables).map(([n, v]) => `${n}=${v}`).join('\n');
}
