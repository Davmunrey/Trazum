/**
 * Which language a prompt is written in, to the extent it can be told cheaply.
 *
 * **Why the estimator needs this at all.** Measured against the counting
 * endpoint, `estimateTokens` is accurate on English (+1.0%) and badly low on every
 * other Latin language: German -37.3%, Spanish -22.9%, French -15.1%. Characters
 * per token says why — English 3.44, French 2.66, Spanish 2.53, German 2.02 —
 * while the estimator applied one divisor to all of them. Non-English text is
 * thinner in the merge table, so the same number of characters costs more tokens.
 *
 * **Accents are not the signal.** That was the first hypothesis and it was tested
 * and killed: a Spanish sample with zero accented characters comes out at -22.9%,
 * against -22.1% for accented Spanish. Diacritics correlate with non-English text
 * in a corpus and not in a prompt, and weighting them moved the figure by three
 * points. What separates these languages is which words they are made of.
 *
 * So this counts function words — the shortest, commonest, most language-specific
 * tokens there are. `the of and to` against `der die und ist` against
 * `que de la en`.
 *
 * **It answers `null` when unsure, and that is the important part.** A prompt is
 * not an essay: it can be three lines, or English instructions wrapped around a
 * Spanish example, or a JSON schema with no prose at all. Guessing on those would
 * apply a language's divisor to text that is not in that language, which is how a
 * fix for one case becomes a regression for four. `null` means "use the default",
 * and the default is the English-calibrated behaviour this has always had.
 */

/**
 * Function words per language, lower-cased, matched whole.
 *
 * Chosen for frequency and for *not overlapping*, which matters more: `de` is
 * frequent in Spanish, French and Portuguese, so it earns nothing and is a
 * liability. Each list is words that are common in its own language and rare in
 * the others, which is what lets a small count decide.
 *
 * `en` is included even though it is the default, because the margin rule needs to
 * know when English *won*: a Spanish prompt quoting an English sentence should not
 * become Spanish on two hits.
 */
const FUNCTION_WORDS: Readonly<Record<string, readonly string[]>> = {
  en: ['the', 'and', 'of', 'to', 'is', 'that', 'with', 'for', 'you', 'this', 'are', 'not'],
  es: ['que', 'los', 'las', 'del', 'una', 'para', 'con', 'como', 'pero', 'sus', 'este', 'siempre'],
  fr: ['les', 'des', 'une', 'dans', 'pour', 'avec', 'vous', 'est', 'sur', 'aux', 'cette', 'toujours'],
  de: ['der', 'die', 'das', 'und', 'nicht', 'sie', 'ist', 'mit', 'auf', 'einen', 'einer', 'immer'],
  pt: ['que', 'dos', 'das', 'uma', 'para', 'com', 'como', 'não', 'seu', 'este', 'pelo', 'sempre'],
  it: ['che', 'per', 'con', 'del', 'una', 'sono', 'nel', 'alla', 'questo', 'suoi', 'anche', 'sempre'],
  nl: ['het', 'een', 'van', 'niet', 'zijn', 'met', 'voor', 'dat', 'aan', 'deze', 'wordt', 'altijd'],
};

/** Languages this can name. Exported so callers can key a table off it. */
export const DETECTABLE_LANGUAGES: readonly string[] = Object.keys(FUNCTION_WORDS);

/**
 * How many hits the winner needs, absolutely and relative to the runner-up.
 *
 * Both bars exist for the same reason and neither is enough alone. The absolute
 * one stops a three-line prompt being classified on a single word. The ratio stops
 * a document that is genuinely mixed — English instructions around a Spanish
 * example — from being called whichever language happened to appear once more.
 *
 * Deliberately cautious in the direction of `null`. A wrong language costs
 * accuracy on text that was fine before; `null` costs only the improvement.
 */
const MIN_HITS = 4;
const MIN_RATIO = 1.6;

/**
 * The language of `text`, or `null` when no answer is safe.
 *
 * Case-insensitive, whole words only, and it stops reading after a bounded
 * prefix: a prompt can be a megabyte, the answer does not get better after a few
 * thousand words, and this runs inside `estimateTokens` on every call.
 */
export function detectTextLanguage(text: string): string | null {
  if (!text) return null;

  // Bounded so this stays cheap on a large prompt. Function words are frequent
  // enough that a prefix this size decides anything a whole document would.
  const sample = text.length > 20_000 ? text.slice(0, 20_000) : text;

  const words = sample.toLowerCase().match(/[\p{L}]+/gu);
  if (!words || words.length < MIN_HITS * 2) return null;

  const seen = new Set(words);
  const scores: Array<[string, number]> = [];
  for (const [language, list] of Object.entries(FUNCTION_WORDS)) {
    let hits = 0;
    // Distinct words rather than occurrences: a prompt that repeats "the" forty
    // times is not more English than one that uses forty different English words,
    // and counting occurrences lets one hammered word decide.
    for (const word of list) if (seen.has(word)) hits++;
    scores.push([language, hits]);
  }

  scores.sort((a, b) => b[1] - a[1]);
  const [best, bestHits] = scores[0]!;
  const runnerUp = scores[1]?.[1] ?? 0;

  if (bestHits < MIN_HITS) return null;
  // A runner-up of zero is a clear win; guard the division rather than special-case.
  if (runnerUp > 0 && bestHits / runnerUp < MIN_RATIO) return null;

  return best;
}
