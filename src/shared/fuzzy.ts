import fuzzysort from 'fuzzysort';
import { normalizeText } from './text';

export interface SearchItem {
  id: string;
  title: string;
  /** Categoria, origem ou descrição. */
  secondary: string;
  /** Texto do comando. */
  detail: string;
}

export interface RankedItem<T extends SearchItem> {
  item: T;
  score: number;
  /** Posições de `title` que casaram (para destacar). */
  titleIndexes: number[];
}

const WEIGHTS = { title: 1, secondary: 0.6, detail: 0.4 };

/**
 * Normaliza caractere a caractere, para que os índices continuem alinhados com o texto original
 * ("ação" → "acao", com a mesma quantidade de caracteres).
 */
export function normalizeAligned(s: string): string {
  let out = '';
  for (const ch of s) {
    const n = normalizeText(ch);
    out += n.length === ch.length ? n : ch.toLowerCase();
  }
  return out;
}

/** Letras casadas ÷ extensão do trecho que elas ocupam (1 = contíguas). */
function compactness(indexes: number[]): number {
  if (indexes.length === 0) return 0;
  const span = Math.max(...indexes) - Math.min(...indexes) + 1;
  return indexes.length / span;
}

interface Prepared<T> {
  item: T;
  title: Fuzzysort.Prepared;
  secondary: Fuzzysort.Prepared;
  detail: Fuzzysort.Prepared;
}

export function prepareItems<T extends SearchItem>(items: T[]): Prepared<T>[] {
  return items.map((item) => ({
    item,
    title: fuzzysort.prepare(normalizeAligned(item.title)),
    secondary: fuzzysort.prepare(normalizeText(item.secondary)),
    detail: fuzzysort.prepare(normalizeText(item.detail)),
  }));
}

/**
 * Busca aproximada (subsequência), sem diferenciar caixa e acentos; o nome pesa mais que
 * categoria/descrição, que pesam mais que o texto do comando.
 */
export function rankItems<T extends SearchItem>(query: string, prepared: Prepared<T>[], limit = 200): RankedItem<T>[] {
  const q = normalizeText(query.trim());
  if (!q) return prepared.slice(0, limit).map((p) => ({ item: p.item, score: 0, titleIndexes: [] }));
  const ranked: RankedItem<T>[] = [];
  for (const p of prepared) {
    const t = fuzzysort.single(q, p.title);
    const s = fuzzysort.single(q, p.secondary);
    const d = fuzzysort.single(q, p.detail);
    // Casamentos compactos no nome valem mais ("Nova aba: Git Bash" antes de "Nova aba como administrador: Git Bash").
    const titleScore = t ? t.score * WEIGHTS.title * (0.8 + 0.2 * compactness([...t.indexes])) : 0;
    const score = Math.max(titleScore, (s?.score ?? 0) * WEIGHTS.secondary, (d?.score ?? 0) * WEIGHTS.detail);
    if (score > 0) ranked.push({ item: p.item, score, titleIndexes: t ? [...t.indexes] : [] });
  }
  return ranked.sort((a, b) => b.score - a.score).slice(0, limit);
}
