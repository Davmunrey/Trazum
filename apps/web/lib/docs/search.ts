import type { SearchEntry } from './types';

/**
 * Search over the titles and headings of the documents, in the page.
 *
 * The index is a list the build wrote (`[slug, text, anchor, depth]`), sent
 * once, on first use, from this site's own origin. There is no server to ask
 * and nobody to tell: the query lives in a variable in the page, it is not
 * put in the address, and nothing here calls `fetch` or sends an event. A test
 * reads this file and the component for exactly that.
 *
 * Matching is by word, not by meaning. Every word typed has to be found in
 * the heading or in its document's title, ignoring case and accents. A word
 * that starts a word of the heading scores higher than one found in the
 * middle of it, the heading itself scores higher than a document's title, and
 * a higher heading beats a lower one, so `ci` finds the chapter called CI
 * before it finds every heading containing the letters.
 */

/** How many results a query shows. */
export const SHOWN_RESULTS = 12;

/** Lower case, no accents, single spaces. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** The words of a query, folded. */
export function wordsOf(query: string): string[] {
  const folded = fold(query);
  return folded === '' ? [] : folded.split(' ');
}

export interface SearchHit {
  entry: SearchEntry;
  score: number;
}

/**
 * The entries that match `query`, best first, at most `limit`.
 *
 * `titles` maps a slug to its document's title, which is searched along with
 * each heading so that `quick start install` finds the heading "Install" of
 * the Quick start.
 */
export function searchEntries(
  entries: readonly SearchEntry[],
  titles: Readonly<Record<string, string>>,
  query: string,
  limit: number = SHOWN_RESULTS,
): SearchHit[] {
  const words = wordsOf(query);
  if (words.length === 0) return [];
  const hits: SearchHit[] = [];
  for (const entry of entries) {
    const [slug, text, , depth] = entry;
    const own = fold(text);
    const title = fold(titles[slug] ?? '');
    const haystack = depth === 1 ? own : `${own} ${title}`;
    const tokens = own.split(/[^\p{L}\p{N}]+/u);
    let score = 0;
    let matched = true;
    for (const word of words) {
      if (!haystack.includes(word)) {
        matched = false;
        break;
      }
      // A word that begins a word of the heading beats one found inside it.
      score += tokens.some((token) => token.startsWith(word)) ? 6 : own.includes(word) ? 3 : 1;
    }
    if (!matched) continue;
    const joined = words.join(' ');
    if (own === joined) score += 10;
    if (depth === 1) score += 2;
    score -= depth * 0.1;
    hits.push({ entry, score });
  }
  // `sort` is stable, so equal scores keep the order of the documents.
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
