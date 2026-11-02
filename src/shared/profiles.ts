import type { ShellProfile } from './model';

/** Ordem de preferência quando o perfil padrão configurado não existe. */
const FALLBACK_ORDER = ['builtin.pwsh', 'builtin.powershell', 'builtin.cmd'];

export interface DefaultProfileResult {
  profile: ShellProfile | null;
  /** Mensagem para o usuário quando o perfil configurado não pôde ser usado. */
  warning: string | null;
}

export function pickDefaultProfile(profiles: ShellProfile[], configuredId: string | null): DefaultProfileResult {
  const usable = (p: ShellProfile | undefined): p is ShellProfile => !!p && p.available;
  const configured = configuredId ? profiles.find((p) => p.id === configuredId) : undefined;
  if (usable(configured)) return { profile: configured, warning: null };

  const fallback =
    FALLBACK_ORDER.map((id) => profiles.find((p) => p.id === id)).find(usable) ??
    profiles.find((p) => usable(p) && !p.hidden) ??
    null;
  const warning =
    configuredId && fallback && configuredId !== fallback.id
      ? `Perfil padrão "${configuredId}" não encontrado; usando "${fallback.name}".`
      : null;
  return { profile: fallback, warning };
}
