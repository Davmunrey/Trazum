import {
  EMPHASIS_PREFIXES,
  FILLER,
  HEDGES,
  INTENSIFIERS,
  POLITENESS,
  SELF_CHECK,
  SHOUTED_WORDS,
  THANKS,
  THANKS_DEGREE,
  THANKS_FOR,
  THANKS_NOT_A_THANKS,
  VERBOSE_PHRASES,
} from './phrases.js';
import { jaccard, normalizeForCompare } from './similarity.js';
import { EXAMPLE_FIELD_LINE } from './structure.js';
import type { RuleId } from './i18n/types.js';
import type { Rule } from './types.js';

/** Escapes a literal so it can go inside a regular expression. */
function escapeRe(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds a regex with accent-aware word boundaries.
 * JavaScript's `\b` only knows ASCII, so "de" would match inside "ánde".
 * Lookarounds over \p{L} avoid that.
 */
function phraseRegex(phrase: string, flags = 'giu'): RegExp {
  const body = escapeRe(phrase).replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, flags);
}

/** Cleans up what deleting a phrase leaves behind: spaces and orphan punctuation. */
function tidyAfterRemoval(text: string): string {
  return (
    text
      // Repeated spaces inside a line (leading indentation untouched).
      .replace(/([^\n\S])[^\S\n]+/g, '$1')
      // Comma or semicolon left with a space in front of it.
      .replace(/[^\S\n]+([,;:.!?])/g, '$1')
      // Commas duplicated by the removal.
      .replace(/,(\s*,)+/g, ',')
      // Punctuation left at the start of a line.
      .replace(/^[^\S\n]*[,;:]\s*/gm, '')
      // Spanish opening exclamation/question mark left with no content.
      .replace(/[¡¿]+(?=[^\S\n]*(?:[!?.,;:]|$))/gm, '')
      // Duplicated sentence-final punctuation when two fragments join ("answer.!").
      .replace(/([.!?])[^\S\n]*[.!?]+/g, '$1')
      // A line left holding nothing but punctuation.
      .replace(/^[^\S\n]*[.,;:!?¡¿]+[^\S\n]*$/gm, '')
      // A single leading space is removal residue, not indentation.
      .replace(/^[^\S\n](?=\S)/gm, '')
      // Trailing spaces.
      .replace(/[^\S\n]+$/gm, '')
      // Restore the capital when the removal left a sentence starting lowercase.
      // Sentence starts: beginning of the text, after strong punctuation, and
      // the start of a new paragraph.
      .replace(
        /(^|[.!?]\s+|\n\n[^\S\n]*)(\p{Ll})/gu,
        (_m, pre: string, ch: string) => pre + ch.toUpperCase(),
      )
  );
}

/**
 * Deletion regex: on top of the phrase, it swallows the commas that delimited
 * it. Without this, removing an aside such as "if you don't mind," leaves
 * "and, classify it".
 */
function dropRegex(phrase: string): RegExp {
  const body = escapeRe(phrase).replace(/\s+/g, '\\s+');
  // The boundary check goes AFTER the optional comma: in front of it, the "y"
  // of "y, si no te importa," would fail the match and the comma would stay.
  return new RegExp(
    `(?:,[^\\S\\n]*)?(?<![\\p{L}\\p{N}_])${body}${WHERE_ONLY[phrase]?.(body) ?? ''}[^\\S\\n]*,?(?![\\p{L}\\p{N}_])`,
    'giu',
  );
}

/**
 * Three courtesy words that are also ordinary words, and where each one is
 * the courtesy.
 *
 * Deleting them wherever they stood changed instructions at the safe level,
 * measured on 2026-11-17:
 *
 *   Aim to please the customer.     ->  Aim to the customer.
 *   Speak kindly to the customer.   ->  Speak to the customer.
 *   Die Bitte des Kunden steht ...  ->  Die des Kunden steht ...
 *
 * "please" after "to" is the verb. "kindly" is a courtesy only in front of
 * what is being asked, which puts it at the start of a clause or right after
 * "you" or "and"; anywhere else it says how to treat somebody. German "bitte"
 * after a determiner is the noun, a request.
 *
 * **Each check is a lookbehind placed after the word, looking back across
 * it.** In front of the word it would run at every position in the text, and
 * each run walks back over the whitespace before it: quadratic on a long run
 * of spaces, 47 seconds on 200,000 characters, which `security.test.js` caught
 * on the first try. Behind the word it runs only where the word is.
 */
const WS = '[^\\S\\n]';
const WHERE_ONLY: Readonly<Record<string, (body: string) => string>> = {
  please: (body) => `(?<!\\bto${WS}+${body})`,
  kindly: (body) => `(?<=(?:^|[\\n.!?;:,(]|\\byou|\\band)${WS}*${body})`,
  bitte: (body) =>
    `(?<!\\b(?:die|der|eine|einer|diese|dieser|ihre|ihrer|seine|seiner|meine|unsere|jede|keine)${WS}+${body})`,
};

/** A rule that deletes a set of phrases. */
function dropRule(id: RuleId, level: Rule['level'], phrases: readonly string[]): Rule {
  // Longest first, so "thank you very much" wins over "thanks".
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  const regexes = sorted.map((p) => dropRegex(p));

  return {
    id,
    level,
    apply(text) {
      let hits = 0;
      let out = text;
      for (const re of regexes) {
        out = out.replace(re, () => {
          hits++;
          return '';
        });
      }
      return { text: hits > 0 ? tidyAfterRemoval(out) : out, hits };
    },
  };
}

/** Keeps the original leading capital when substituting. */
function matchCase(original: string, replacement: string): string {
  if (!replacement) return replacement;
  const firstChar = original[0];
  if (firstChar && firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
    return replacement[0]!.toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

const whitespaceRule: Rule = {
  id: 'whitespace',
  level: 'safe',
  apply(text) {
    let hits = 0;
    let out = text;

    // The lookbehind is load-bearing, not decoration. Without it the engine
    // restarts this match at every position inside a whitespace run, and when
    // the run does not end the line it fails from each one — quadratic, and
    // 17 seconds on a 100 KB line of spaces that the HTTP API happily accepts.
    // Anchoring to the start of a run means each run is tried exactly once.
    out = out.replace(/(?<![^\S\n])[^\S\n]+$/gm, () => {
      hits++;
      return '';
    });
    // Collapse repeated spaces only after the first non-space character.
    out = out.replace(/(\S)[^\S\n]{2,}/g, (_m, ch: string) => {
      hits++;
      return `${ch} `;
    });
    out = out.replace(/\n{3,}/g, () => {
      hits++;
      return '\n\n';
    });
    out = out.replace(/\t/g, () => {
      hits++;
      return ' ';
    });

    return { text: out, hits };
  },
};

const decorationRule: Rule = {
  id: 'decoration',
  level: 'safe',
  apply(text) {
    let hits = 0;
    let out = text;

    // A whole line of 8 or more identical decorative characters.
    out = out.replace(/^[^\S\n]*([=\-_*~#])\1{7,}[^\S\n]*$/gm, () => {
      hits++;
      return '';
    });
    // Repeated exclamation or question marks, opening ones included.
    out = out.replace(/([!?¡¿])\1{1,}/g, (_m, ch: string) => {
      hits++;
      return ch;
    });
    // Clean up the blank lines the deletion just left behind.
    if (hits > 0) out = out.replace(/\n{3,}/g, '\n\n');

    return { text: out, hits };
  },
};

const verbosePhrasesRule: Rule = {
  id: 'verbose-phrases',
  level: 'safe',
  apply(text) {
    let hits = 0;
    let out = text;
    // Longest first so the most specific substitution wins.
    const entries = [...VERBOSE_PHRASES].sort((a, b) => b[0].length - a[0].length);
    for (const [from, to] of entries) {
      const re = phraseRegex(from);
      out = out.replace(re, (match) => {
        hits++;
        return matchCase(match, to);
      });
    }
    return { text: hits > 0 ? tidyAfterRemoval(out) : out, hits };
  },
};

const NOT_SPACE_OR_BREAK = '[^\\S\\n]';
/** Longest first, spaces loosened to any run that stays on the line. */
const anyOf = (phrases: readonly string[]): string =>
  [...phrases]
    .sort((a, b) => b.length - a.length)
    .map((phrase) => escapeRe(phrase).replace(/\s+/g, `${NOT_SPACE_OR_BREAK}+`))
    .join('|');

const WORD_END = '(?![\\p{L}\\p{N}_])';

/**
 * A sentence that does nothing but thank.
 *
 *   1  what comes before it: the start of a line, or the space after the
 *      punctuation that ended the previous sentence
 *   the thanks, then how much ("so much", "de antemano"), any number of times
 *   2  optionally what it is for: "for" and up to eighty characters holding no
 *      punctuation, no quotation mark and no protected span
 *   then the end of the sentence: its punctuation, or the end of the line
 *
 * A thanks followed by anything else does not match, and that is the point:
 * "thanks to the new policy", "thank you messages should be short" and
 * "thanks, John" are all left for a reader to deal with.
 */
const THANKS_SENTENCE = new RegExp(
  `(^${NOT_SPACE_OR_BREAK}*|(?<=[.!?…])${NOT_SPACE_OR_BREAK}+)`
    + `[¡¿]*(?:${anyOf(THANKS)})${WORD_END}`
    + `(?:${NOT_SPACE_OR_BREAK}+(?:${anyOf(THANKS_DEGREE)})${WORD_END})*`
    + `(?:${NOT_SPACE_OR_BREAK}+(?:${anyOf(THANKS_FOR)})${NOT_SPACE_OR_BREAK}+`
    + `([^.!?…\\n,;:"'“”‘’«»„()\\uE000\\uE001]{1,80}))?`
    + `${NOT_SPACE_OR_BREAK}*(?:[.!?…]+|$)`,
  'gimu',
);

const NOT_A_THANKS = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${anyOf(THANKS_NOT_A_THANKS)})${WORD_END}`, 'iu');
/** A list marker with nothing after it yet: "1.", "a)", "-". */
const LIST_MARKER = /^[^\S\n]*(?:\p{N}+[.)]|\p{L}[.)]|[-*•])[^\S\n]*$/u;

/**
 * Removes the sentences that only thank, and leaves every other thanks alone.
 *
 * The regex finds a candidate; four checks then decide whether it is a
 * courtesy the author added or text the prompt is about. Each is a case that
 * was measured going wrong, and each resolves the doubt the same way: the text
 * stays.
 */
function removeThanks(text: string): { text: string; hits: number } {
  let hits = 0;
  const out = text.replace(THANKS_SENTENCE, (whole: string, lead: string, what: string | undefined, offset: number) => {
    const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
    const before = text.slice(lineStart, offset);
    const sentence = whole.slice(lead.length);

    if (before.trim() === '') {
      // On a line of its own, under a line that ends in a colon, it is what
      // that line introduced: a template, an example, the text to send.
      const above = text.slice(0, lineStart).trimEnd();
      if (above.endsWith(':')) return whole;
    } else {
      // After a full stop in the middle of a line, a sentence begins with a
      // capital. A lower-case "thanks" there follows an abbreviation: "e.g.
      // thanks for your time."
      const first = sentence.replace(/^[¡¿]+/, '')[0] ?? '';
      if (first === first.toLowerCase()) return whole;
      // "1. Thank you for your order." is an item in a list, not a closing.
      if (LIST_MARKER.test(before)) return whole;
    }
    // "Thank you for your order is the subject line" is about the phrase.
    if (what !== undefined && NOT_A_THANKS.test(what)) return whole;

    hits++;
    return '';
  });
  return { text: out, hits };
}

const THANKING = new Set(THANKS.map((phrase) => phrase.toLowerCase()));
const softeners = dropRule(
  'politeness',
  'safe',
  POLITENESS.filter((phrase) => !THANKING.has(phrase.toLowerCase())),
);

/**
 * Courtesy, in two halves that used to be one.
 *
 * A softener ("please", "por favor", "if you don't mind") is deleted where it
 * stands, as before. A thanks is deleted only as a whole sentence; see
 * `THANKS` in `phrases.ts` for what deleting the phrase alone did.
 */
const politenessRule: Rule = {
  id: 'politeness',
  level: 'safe',
  apply(text) {
    const thanks = removeThanks(text);
    const rest = softeners.apply(thanks.text);
    const hits = thanks.hits + rest.hits;
    return { text: hits > 0 ? tidyAfterRemoval(rest.text) : text, hits };
  },
};
const fillerRule = dropRule('filler', 'safe', FILLER);
const intensifiersRule = dropRule('intensifiers', 'aggressive', INTENSIFIERS);
const hedgesRule = dropRule('hedges', 'aggressive', HEDGES);
const selfCheckRule = dropRule('self-check', 'aggressive', SELF_CHECK);

const emphasisRule: Rule = {
  id: 'emphasis',
  level: 'aggressive',
  apply(text) {
    let hits = 0;
    let out = text;

    for (const prefix of EMPHASIS_PREFIXES) {
      const re = new RegExp(`^([^\\S\\n]*)${escapeRe(prefix)}\\s*:\\s*`, 'gm');
      out = out.replace(re, (_m, indent: string) => {
        hits++;
        return indent;
      });
    }

    for (const word of SHOUTED_WORDS) {
      const re = phraseRegex(word, 'gu'); // case-sensitive: only the shouted form
      out = out.replace(re, (match) => {
        hits++;
        return match.toLowerCase();
      });
    }

    // Dropping "IMPORTANT:" leaves the sentence starting lowercase: recapitalise.
    return { text: hits > 0 ? tidyAfterRemoval(out) : out, hits };
  },
};

const duplicateLinesRule: Rule = {
  id: 'duplicate-lines',
  level: 'safe',
  apply(text) {
    const lines = text.split('\n');
    const seen = new Set<string>();
    const kept: string[] = [];
    let hits = 0;

    for (const line of lines) {
      const normalized = normalizeForCompare(line);
      // A labelled example field is data, not repetition: two examples sharing
      // an output line show that two inputs map to the same answer. Dropping
      // the second leaves that example with no output.
      if (normalized.length >= 25 && !EXAMPLE_FIELD_LINE.test(line)) {
        if (seen.has(normalized)) {
          hits++;
          continue;
        }
        seen.add(normalized);
      }
      kept.push(line);
    }

    let out = kept.join('\n');
    if (hits > 0) out = out.replace(/\n{3,}/g, '\n\n');
    return { text: out, hits };
  },
};

const duplicateBlocksRule: Rule = {
  id: 'duplicate-blocks',
  level: 'safe',
  apply(text) {
    const blocks = text.split(/\n{2,}/);
    const seen = new Set<string>();
    const kept: string[] = [];
    let hits = 0;

    for (const block of blocks) {
      const normalized = normalizeForCompare(block);
      if (normalized.length >= 40) {
        if (seen.has(normalized)) {
          hits++;
          continue;
        }
        seen.add(normalized);
      }
      kept.push(block);
    }

    return { text: kept.join('\n\n'), hits };
  },
};

const nearDuplicateBlocksRule: Rule = {
  id: 'near-duplicate-blocks',
  level: 'aggressive',
  apply(text) {
    const blocks = text.split(/\n{2,}/);
    const keptNormalized: string[] = [];
    const kept: string[] = [];
    let hits = 0;

    for (const block of blocks) {
      const normalized = normalizeForCompare(block);
      if (normalized.length >= 60) {
        const isDuplicate = keptNormalized.some((prev) => jaccard(prev, normalized) >= 0.92);
        if (isDuplicate) {
          hits++;
          continue;
        }
        keptNormalized.push(normalized);
      }
      kept.push(block);
    }

    return { text: kept.join('\n\n'), hits };
  },
};

/**
 * Every rule, in the order they must run.
 *
 * **The order decides what the reader is told, not just how fast this runs.**
 * A repeated stanza is a repeated *block* and also a set of repeated *lines*,
 * so all three of the deletion rules can find it and whichever runs first
 * takes it. Coarsest first means the report says "one repeated paragraph"
 * rather than "three repeated lines" for the same saving — the same number
 * attached to a sentence somebody can act on instead of three they have to
 * reassemble.
 *
 * That was an unstated consequence until `rules --measure` made the overlap
 * visible: the leave-one-out measurement credits each of the three with the
 * whole saving, because each of them *would* have caught it alone. The applied
 * run credits exactly one, and this list is what picks which.
 *
 * `rules.test.js` pins both facts, so a reorder that quietly changes the
 * attribution fails the build rather than changing what users read.
 */
export const RULES: readonly Rule[] = [
  // Whole-block deletions first: less text for the rest to walk, and the
  // coarsest description of what was removed.
  duplicateBlocksRule,
  nearDuplicateBlocksRule,
  duplicateLinesRule,
  // Then the phrase-level rules.
  verbosePhrasesRule,
  politenessRule,
  fillerRule,
  hedgesRule,
  intensifiersRule,
  selfCheckRule,
  emphasisRule,
  // And finally typographic cleanup, which picks up what the others left.
  decorationRule,
  whitespaceRule,
];

export function getRule(id: string): Rule | undefined {
  return RULES.find((r) => r.id === id);
}
