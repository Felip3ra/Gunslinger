import { z } from 'zod';

export const shellTypes = ['powershell', 'pwsh', 'cmd', 'gitbash', 'wsl', 'custom'] as const;
export type ShellType = (typeof shellTypes)[number];

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor no formato #rrggbb');

export const customProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  executable: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().nullable().default(null),
  color: hexColor.nullable().default(null),
  icon: z.string().nullable().default(null),
  shellIntegration: z.boolean().default(false),
});
export type CustomProfile = z.infer<typeof customProfileSchema>;

export const profileOverrideSchema = z.object({
  hidden: z.boolean().optional(),
  color: hexColor.optional(),
  icon: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().nullable().optional(),
  shellIntegration: z.boolean().optional(),
});
export type ProfileOverride = z.infer<typeof profileOverrideSchema>;

/** Perfil resolvido (detectado ou customizado), já com os ajustes do usuário aplicados. */
export interface ShellProfile {
  id: string;
  name: string;
  shellType: ShellType;
  executable: string;
  args: string[];
  cwd: string | null;
  color: string;
  icon: string;
  /** Imagem do ícone (data URL) quando `icon` é o caminho de um arquivo .png/.ico/.svg. */
  iconData?: string;
  /** plugin = contribuído por um plugin (somente leitura; ajustes via overrides). */
  source: 'detected' | 'custom' | 'plugin';
  hidden: boolean;
  /** false quando o executável não existe (perfil importado de outra máquina, por exemplo). */
  available: boolean;
  shellIntegration: boolean;
  wslDistro?: string;
}
