// Decision: Turkish-aware matching, the same fold the server uses, so istanbul finds İstanbul and the highlight keeps the original letters.
// Pinned by: core/kb/kb.test.ts; e2e bonus (help center)

/**
 * Turkish-aware matching for the help center.
 *
 * The server searches with a Turkish case fold, so "istanbul" finds "İstanbul".
 * JavaScript's own case-insensitive matching does not: /istanbul/i misses it,
 * and "I".toLowerCase() is "i" where Turkish wants "ı". To highlight what the
 * server matched, the client folds text the same way: lower-case with the
 * tr-TR locale, strip diacritics, and treat dotless ı as i.
 */
export const foldTr = (text: string): string => text.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');

/** The search terms the server would use for this query (it ignores terms of one or two letters). */
export const searchTerms = (query: string): string[] =>
  foldTr(query)
    .split(/\W+/)
    .filter((term) => term.length > 2);

export interface Segment {
  text: string;
  hit: boolean;
}

/** Splits `text` into runs that match one of the query's terms and runs that do not. */
export function highlight(text: string, query: string): Segment[] {
  const terms = searchTerms(query);
  if (terms.length === 0 || text === '') return [{ text, hit: false }];

  // Folding can change the length of a string, so each folded character
  // remembers which original character it came from.
  let folded = '';
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    for (const f of foldTr(char)) {
      folded += f;
      origin.push(index);
    }
    index += char.length;
  }
  origin.push(text.length);

  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    for (let at = folded.indexOf(term); at !== -1; at = folded.indexOf(term, at + 1)) {
      const from = origin[at]!;
      const to = origin[at + term.length]!;
      for (let i = from; i < to; i++) marked[i] = true;
    }
  }

  const segments: Segment[] = [];
  for (let i = 0; i < text.length;) {
    const hit = marked[i]!;
    let end = i;
    while (end < text.length && marked[end] === hit) end++;
    segments.push({ text: text.slice(i, end), hit });
    i = end;
  }
  return segments;
}
