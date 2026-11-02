import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const highlightRuleSchema = z.object({
  pattern: z.string().min(1),
  ignoreCase: z.boolean().default(true),
  foreground: hex.optional(),
  background: hex.optional(),
});
export type HighlightRule = z.infer<typeof highlightRuleSchema>;

/** Regras padrão: erros, avisos e sucesso (MSBuild, ASP.NET Core, npm, testes). "0 erros" não acende. */
export const DEFAULT_HIGHLIGHT_RULES: HighlightRule[] = [
  { pattern: String.raw`(?<!\b0 )\b(?:error|erro|errors|fail(?:ed|ure)?|fatal|exception|crit)\b`, ignoreCase: true, foreground: '#ff7b72' },
  { pattern: String.raw`(?<!\b0 )\b(?:warn(?:ing)?s?|aviso|avisos)\b`, ignoreCase: true, foreground: '#d29922' },
  { pattern: String.raw`\b(?:succeeded|successful(?:ly)?|passed|êxito)\b`, ignoreCase: true, foreground: '#3fb950' },
];

export const logHighlightSchema = z.object({
  enabled: z.boolean(),
  rules: z.array(highlightRuleSchema),
});
export type LogHighlightSettings = z.infer<typeof logHighlightSchema>;
export const defaultLogHighlight: LogHighlightSettings = { enabled: true, rules: DEFAULT_HIGHLIGHT_RULES };

export interface CompiledRule {
  regex: RegExp;
  foreground?: string;
  background?: string;
}

export function compileRules(rules: HighlightRule[]): { compiled: CompiledRule[]; errors: string[] } {
  const compiled: CompiledRule[] = [];
  const errors: string[] = [];
  for (const rule of rules) {
    try {
      compiled.push({
        regex: new RegExp(rule.pattern, rule.ignoreCase ? 'giu' : 'gu'),
        ...(rule.foreground ? { foreground: rule.foreground } : {}),
        ...(rule.background ? { background: rule.background } : {}),
      });
    } catch (err) {
      errors.push(`Regra de destaque ignorada ("${rule.pattern}"): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { compiled, errors };
}

export interface HighlightMatch {
  start: number;
  end: number;
  foreground?: string;
  background?: string;
}

export const MAX_MATCHES_PER_LINE = 20;

/** Trechos destacados de uma linha; sem sobreposição (a regra anterior na lista vence). */
export function findMatches(line: string, rules: CompiledRule[]): HighlightMatch[] {
  const taken: HighlightMatch[] = [];
  const overlaps = (s: number, e: number): boolean => taken.some((t) => s < t.end && e > t.start);
  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    for (const m of line.matchAll(rule.regex)) {
      if (m[0].length === 0) continue;
      const start = m.index!;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      taken.push({ start, end, ...(rule.foreground ? { foreground: rule.foreground } : {}), ...(rule.background ? { background: rule.background } : {}) });
      if (taken.length >= MAX_MATCHES_PER_LINE) return taken.sort((a, b) => a.start - b.start);
    }
  }
  return taken.sort((a, b) => a.start - b.start);
}
