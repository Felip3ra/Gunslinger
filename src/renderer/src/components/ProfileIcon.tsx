/** Ícones embutidos dos perfis (SVG inline, sem dependências). */
const ICONS: Record<string, JSX.Element> = {
  powershell: <path d="M3 4h16l-4 16H-1z M5 8l5 4-6 4 M10 16h5" transform="translate(2 0)" />,
  cmd: <path d="M3 5h18v14H3z M6 9l3 3-3 3 M11 15h6" />,
  git: <path d="M12 3l9 9-9 9-9-9z M9 9l3 3 M12 12v5 M12 12l3-3" />,
  linux: <path d="M12 3c3 0 4 3 4 6s2 5 3 8c-2 2-12 2-14 0 1-3 3-5 3-8s1-6 4-6z M10 8h.01 M14 8h.01" />,
  node: <path d="M12 2l9 5v10l-9 5-9-5V7z M12 8v8 M9 10v4" />,
  dotnet: <path d="M3 6h18v12H3z M7 15V9l4 6V9 M14 9h3 M14 12h3 M14 15h3" />,
  terminal: <path d="M3 5h18v14H3z M6 9l3 3-3 3 M11 15h6" />,
  globe: <path d="M12 3a9 9 0 100 18 9 9 0 000-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18" />,
};

export const BUILTIN_ICONS = Object.keys(ICONS);

/** `data`: imagem do ícone por arquivo, já lida pelo main (o CSP só permite imagens locais via data:). */
export function ProfileIcon({ icon, color, data, size = 14 }: { icon: string; color: string; data?: string | undefined; size?: number }): JSX.Element {
  const name = icon.startsWith('builtin:') ? icon.slice('builtin:'.length) : null;
  if (data) return <img className="profile-icon" src={data} width={size} height={size} alt="" />;
  if (!name) {
    // Arquivo ausente ou inválido: um bloco da cor do perfil.
    return <span className="profile-icon" style={{ width: size, height: size, background: color, borderRadius: 3 }} />;
  }
  return (
    <svg className="profile-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name] ?? ICONS['terminal']}
    </svg>
  );
}
