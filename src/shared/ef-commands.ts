export type EfCommandKind = 'add' | 'update' | 'remove' | 'list' | 'script';

export const EF_COMMANDS: { kind: EfCommandKind; title: string; base: string; confirm: boolean }[] = [
  { kind: 'add', title: 'Nova migration', base: 'dotnet ef migrations add {nome}', confirm: false },
  { kind: 'update', title: 'Atualizar banco', base: 'dotnet ef database update', confirm: false },
  { kind: 'remove', title: 'Remover última migration', base: 'dotnet ef migrations remove', confirm: true },
  { kind: 'list', title: 'Listar migrations', base: 'dotnet ef migrations list', confirm: false },
  { kind: 'script', title: 'Gerar script', base: 'dotnet ef migrations script', confirm: false },
];

/**
 * Monta o modelo do comando de EF: --project e --startup-project só entram quando o projeto
 * define as variáveis, e ficam como {project}/{startupProject} para aparecer na pré-visualização.
 */
export function buildEfCommand(kind: EfCommandKind, projectVars: Record<string, string>): string {
  const def = EF_COMMANDS.find((c) => c.kind === kind)!;
  let text = def.base;
  if (projectVars['project']?.trim()) text += ' --project "{project}"';
  if (projectVars['startupProject']?.trim()) text += ' --startup-project "{startupProject}"';
  return text;
}
