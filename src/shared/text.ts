/** Marcas diacríticas combinantes (U+0300 a U+036F), separadas pelo NFD. */
const DIACRITICS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

/** Minúsculas e sem acentos ("Produção" → "producao"), para busca e filtro. */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(DIACRITICS, '').toLowerCase();
}

/** Todas as palavras do filtro aparecem em algum dos campos (sem diferenciar caixa e acentos). */
export function matchesFilter(filter: string, fields: string[]): boolean {
  const words = normalizeText(filter).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeText(fields.join(' '));
  return words.every((w) => haystack.includes(w));
}
