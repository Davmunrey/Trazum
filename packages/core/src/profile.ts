import { segment } from './segment.js';
import { findExamples, findRestatedFormat } from './structure.js';
import { estimateTokens } from './tokenizer.js';
import type { TokenCounter } from './types.js';

/**
 * What a prompt is made of, so a team can decide which one to fix first.
 *
 * ## Why this is not a score
 *
 * The obvious shape for "which prompts should we optimise?" is a number out of
 * a hundred, and it is the wrong shape. `Complexity: 74` cannot be argued with,
 * cannot be reproduced by hand, and does not tell anybody what to do on Monday.
 * Worse, the weights that turn four measurements into one number are invented —
 * and once invented they get tuned until the ranking looks right, which is
 * fitting the metric to the answer.
 *
 * So this returns **the measurements**, each with a definition you can check
 * against the prompt in front of you, and ranks on the one quantity that is not
 * a matter of opinion: **what optimising it would actually save.** That figure
 * comes from running the deterministic rules, not from a formula.
 *
 * The structural facts are the *explanation* for a prompt's position in that
 * ranking, not a substitute for it. "1,204 tokens across 8 sentences" says why
 * a prompt is worth looking at; "$310 a month recoverable" says whether it is
 * worth looking at before the other thirty-nine.
 *
 * ## What each measurement means, exactly
 *
 * - **sentences** — spans ending in `.`, `!`, `?`, `。`, `！`, `？`, or a line
 *   break where the line ends without punctuation (a bullet is a sentence).
 *   Protected content is excluded, so a code block is not forty sentences.
 * - **tokensPerSentence** — the verbosity signal, and the only ratio here. It
 *   is length-independent: a padded 300-token prompt and a padded 3,000-token
 *   one look the same, which is the point. Reported with units, never as an
 *   index.
 * - **examples / exampleTokens** — from `findExamples`, the same detector the
 *   advisories use. Few-shot examples are usually the largest single block in
 *   an expensive prompt and the easiest to trim by one.
 * - **formatTokens** — a restated output format (a JSON schema written out
 *   twice, or written out at all when the API takes a schema parameter).
 * - **protectedTokens** — code, URLs, placeholders and tags. Counted separately
 *   because **no amount of optimising will touch them**, and a prompt that is
 *   80% code has far less headroom than its size suggests. Leaving this out is
 *   how a ranking sends somebody to spend an afternoon on a file that cannot
 *   move.
 */

export interface PromptProfile {
  tokens: number;
  /** Tokens that cannot be touched: code, URLs, placeholders, tags. */
  protectedTokens: number;
  sentences: number;
  /** `tokens / sentences`, rounded to one decimal. Zero when there are none. */
  tokensPerSentence: number;
  examples: number;
  exampleTokens: number;
  /** Tokens in a restated output format, or 0. */
  formatTokens: number;
}

const SENTENCE_END = /[.!?。！？]+/;

/**
 * Sentences in the mutable part of the prompt.
 *
 * Deliberately simple and stated rather than clever. An abbreviation splits a
 * sentence in two here, and that is accepted: the number is used as a
 * denominator for a verbosity ratio, where a few percent of noise changes
 * nothing, and the alternative is a sentence tokeniser this project would then
 * have to defend.
 */
export function countSentences(prompt: string): number {
  let total = 0;

  for (const piece of segment(prompt)) {
    if (piece.kind === 'protected') continue;

    for (const line of piece.text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;

      const parts = trimmed
        .split(SENTENCE_END)
        .map((part) => part.trim())
        .filter((part) => part !== '');

      // A line with no terminal punctuation is still one thing being said — a
      // bullet, a heading, a rule in a list. Counting it as zero would make
      // every bulleted prompt look infinitely verbose.
      total += Math.max(1, parts.length);
    }
  }

  return total;
}

export interface ProfileOptions {
  count?: TokenCounter;
}

/** Measures a prompt. Deterministic, offline, and free. */
export function profilePrompt(prompt: string, options: ProfileOptions = {}): PromptProfile {
  const count = options.count ?? estimateTokens;

  const tokens = count(prompt);
  const protectedTokens = segment(prompt)
    .filter((piece) => piece.kind === 'protected')
    .reduce((sum, piece) => sum + count(piece.text), 0);

  const sentences = countSentences(prompt);
  const examples = findExamples(prompt, count);
  const format = findRestatedFormat(prompt, count);

  return {
    tokens,
    protectedTokens,
    sentences,
    tokensPerSentence: sentences === 0 ? 0 : Math.round((tokens / sentences) * 10) / 10,
    examples: examples.length,
    exampleTokens: examples.reduce((sum, block) => sum + block.tokens, 0),
    formatTokens: format?.restatedTokens ?? 0,
  };
}
