/**
 * Variáveis em comandos salvos: {nome}, onde nome começa com letra ou _ e só tem letras, dígitos e _.
 * Chaves com outro conteúdo ({ $_.Name }) são texto literal; {{ e }} geram chaves literais.
 */
const TOKEN = /\{\{|\}\}|\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/** Nomes das variáveis na ordem da primeira ocorrência, sem repetição. */
export function extractVariables(template: string): string[] {
  const names: string[] = [];
  for (const m of template.matchAll(TOKEN)) {
    const name = m[1];
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** Substitui as variáveis pelos valores; variáveis sem valor ficam como estão. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return template.replace(TOKEN, (whole, name: string | undefined) => {
    if (whole === '{{') return '{';
    if (whole === '}}') return '}';
    return name !== undefined && name in values ? values[name]! : whole;
  });
}
