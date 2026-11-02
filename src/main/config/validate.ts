import { ZodArray, ZodDefault, ZodEffects, ZodObject, ZodOptional, type ZodTypeAny } from 'zod';

export interface FieldIssue {
  path: (string | number)[];
  message: string;
}

function unwrap(schema: ZodTypeAny): ZodTypeAny {
  let s = schema;
  while (s instanceof ZodDefault || s instanceof ZodOptional || s instanceof ZodEffects) {
    s = s instanceof ZodEffects ? s.innerType() : s._def.innerType;
  }
  return s;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Valida campo a campo: cada campo inválido vira o valor de `fallback` e gera um FieldIssue.
 * Campos ausentes usam o padrão sem gerar aviso (o usuário pode escrever só o que quer mudar).
 * Itens inválidos de listas são descartados com aviso.
 */
export function validateWithFallback(
  schema: ZodTypeAny,
  fallback: unknown,
  data: unknown,
  path: (string | number)[] = [],
  issues: FieldIssue[] = [],
): { value: unknown; issues: FieldIssue[] } {
  const direct = schema.safeParse(data);
  if (direct.success) return { value: direct.data, issues };

  const inner = unwrap(schema);
  if (inner instanceof ZodObject && isPlainObject(data)) {
    const fb = isPlainObject(fallback) ? fallback : {};
    const out: Record<string, unknown> = {};
    for (const [key, sub] of Object.entries(inner.shape as Record<string, ZodTypeAny>)) {
      if (!(key in data)) {
        const parsedMissing = sub.safeParse(undefined);
        out[key] = parsedMissing.success && parsedMissing.data !== undefined ? parsedMissing.data : fb[key];
        continue;
      }
      out[key] = validateWithFallback(sub, fb[key], data[key], [...path, key], issues).value;
    }
    return { value: out, issues };
  }

  if (inner instanceof ZodArray && Array.isArray(data)) {
    const element = inner.element as ZodTypeAny;
    const out: unknown[] = [];
    data.forEach((item, index) => {
      const r = element.safeParse(item);
      if (r.success) out.push(r.data);
      else issues.push({ path: [...path, index], message: `item ignorado: ${describe(r.error.issues)}` });
    });
    return { value: out, issues };
  }

  issues.push({ path, message: describe(direct.error.issues) });
  return { value: fallback, issues };
}

function describe(zodIssues: { path: (string | number)[]; message: string }[]): string {
  return zodIssues
    .slice(0, 3)
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}
