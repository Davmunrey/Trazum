/**
 * Who read the dictionary.
 *
 * The trimming dictionaries in `phrases.ts` cover seven languages. Two of them
 * are languages this project reports in, which is the only evidence in this
 * repository that somebody here reads them. The other five were written by the
 * same process that wrote the rules, and nothing in the history says a person
 * who speaks French, German, Portuguese, Italian or Dutch has ever looked at
 * the entries and agreed that removing one leaves the prompt asking for the
 * same thing.
 *
 * **That is a stronger claim than "an eighth language is not scheduled".** The
 * roadmap has said for several arcs that a dictionary is a judgement about a
 * language and this project will not make it in a language nobody here reads.
 * Seven dictionaries shipped anyway. The rule and the catalogue disagree, and
 * the catalogue is the one users meet.
 *
 * ## The evidence that reading the list is not enough
 *
 * `INTENSIFIERS` shipped `molto`, `muito` and `heel` — each of which is an
 * intensifier *and* a quantifier, so dropping one turns "you have much time"
 * into "you have time". Three languages, the same mistake, and it survived
 * being read. It was caught by running prompts through the rules, which is a
 * far weaker instrument than a speaker and is what this project actually had.
 *
 * One bug found by the weaker instrument is not a review. It is the reason to
 * stop describing the two situations with one word.
 *
 * ## What this module refuses
 *
 * - **Deleting the five.** They fire, they save tokens, and a Dutch prompt is
 *   better served by an unreviewed dictionary that says so than by silence.
 * - **Calling them equal to the two.** `a legibility floor outranks a visual
 *   tier`, and one line of admission in the report costs nothing.
 * - **Naming a person.** A maintainer is somebody who accepts the role in
 *   public; inventing one here would be the same lie in the other direction.
 *   Until one exists, `unreviewed` is the whole of what can be said.
 */

/**
 * Whether anybody who reads the language has passed over its entries.
 *
 * Deliberately two values. A scale — "partially reviewed", "spot-checked" —
 * would be a number nobody can produce evidence for, and the honest answer to
 * "has a speaker signed off on this list" is yes or no.
 */
export type DictionaryStanding =
  /** Somebody here reads it. This project reports in it. */
  | 'reviewed'
  /** Nobody here has been shown to read it. The entries stand unchecked. */
  | 'unreviewed';

export interface DictionaryRecord {
  /** The language code, as `PHRASE_LANGUAGES` holds it. */
  code: string;
  standing: DictionaryStanding;
  /**
   * What was actually done to these entries — never what was intended.
   *
   * English rather than a code, because this string is evidence a reader
   * weighs, not a value a program branches on.
   */
  checkedBy: string;
}

/**
 * The standing of each shipped dictionary.
 *
 * `maintainers.test.js` derives the `reviewed` set from the report catalogues
 * on disk rather than from this list, so adding a French report translation
 * fails the build here until somebody decides what it means — which is the
 * moment the question is actually answerable, and not before.
 */
export const DICTIONARY_STANDING: Readonly<Record<string, DictionaryRecord>> = {
  en: {
    code: 'en',
    standing: 'reviewed',
    checkedBy: 'the report is written in it, and the entries were revised by somebody reading them',
  },
  es: {
    code: 'es',
    standing: 'reviewed',
    checkedBy: 'the report is written in it, and the entries were revised by somebody reading them',
  },
  fr: {
    code: 'fr',
    standing: 'unreviewed',
    checkedBy: 'run through the rules against sample prompts; no speaker has agreed to the entries',
  },
  de: {
    code: 'de',
    standing: 'unreviewed',
    checkedBy: 'run through the rules against sample prompts; no speaker has agreed to the entries',
  },
  pt: {
    code: 'pt',
    standing: 'unreviewed',
    checkedBy: 'run through the rules against sample prompts; no speaker has agreed to the entries',
  },
  it: {
    code: 'it',
    standing: 'unreviewed',
    checkedBy: 'run through the rules against sample prompts; no speaker has agreed to the entries',
  },
  nl: {
    code: 'nl',
    standing: 'unreviewed',
    checkedBy: 'run through the rules against sample prompts; no speaker has agreed to the entries',
  },
};

/** The record for a language, or null when the dictionaries do not cover it. */
export function dictionaryStanding(code: string): DictionaryRecord | null {
  return DICTIONARY_STANDING[code] ?? null;
}

/**
 * The codes with a given standing, in catalogue order.
 *
 * Order comes from the argument rather than from this module's object literal,
 * so a caller that lists languages in report order gets them back in it.
 */
export function languagesWithStanding(
  codes: readonly string[],
  standing: DictionaryStanding,
): readonly string[] {
  return codes.filter((code) => DICTIONARY_STANDING[code]?.standing === standing);
}
