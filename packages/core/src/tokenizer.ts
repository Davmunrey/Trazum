/**
 * Dependency-free token estimator.
 *
 * This is NOT a real tokenizer: it is a heuristic calibrated per character
 * class. It is built to keep the typical error on ordinary text
 * (English/Spanish, markdown, code) inside ±10%, which is plenty for comparing
 * two versions of the same prompt — but do NOT bill anyone from it.
 *
 * **That band is a design target that has not been measured.** It is printed on
 * every report and every dollar figure descends from it, and until
 * `scripts/measure-token-band.mjs` has been run against the official counting
 * endpoint, nothing in this repository establishes that it holds. It is stated
 * as one number for all text, which is a further assumption: the branches below
 * treat CJK, digits and punctuation quite differently from words, and there is
 * no reason those should land on the same accuracy.
 *
 * `test/token-band.test.js` asserts the band per text type as soon as the ground
 * truth exists. Until then it says so rather than passing quietly.
 *
 * For exact numbers use `countTokensAnthropic` (the official token-counting
 * endpoint, which is free) or pass your own `TokenCounter`.
 */

import { detectTextLanguage } from './language.js';
import { SAFE_FETCH_INIT, checkedEndpoint } from './net.js';

/**
 * The error band this estimator is published under, as a percentage.
 *
 * **Measured, not chosen, and it has moved three times.** It was `15` for eight
 * releases as a design target nobody had checked; the first measurement found two
 * of eight samples outside it and it went to `25`; fixing the digit divisor and
 * calibrating per language brought it back to `15`. This is the fourth value and
 * the first one that is comfortably above what the corpus actually shows.
 *
 * ```
 * worst measured error   6.4%   (code-heavy, which nothing is fitted to)
 * published band        10%
 * ```
 *
 * **The margin is deliberate and it is not slack.** 6.4 rounded up is 7, and
 * publishing 7 would be a tighter claim than twenty-one samples across six text
 * types can support: the corpus has no Korean, no Arabic, no Cyrillic prose, no
 * mixed-script document, and a seventh text type could easily land at eight. A
 * band that becomes false the first time somebody measures something new is the
 * exact fault this whole exercise was fixing. Overstating the uncertainty is the
 * safe direction for a tool that reports money.
 *
 * What earned the drop from 15 was **splitting kana from han**. Every CJK
 * character was charged one token, which put Japanese at +11.2% — the worst error
 * anywhere in the corpus — while Chinese sat at −3.2% under the same rule. Kana
 * measure 0.75 tokens per character and han 1.05, and that pair takes the two
 * samples to −1.5% and +1.3%. See `KANA_TOKENS_PER_CHAR`.
 *
 * **Which samples the band rests on matters more than the number.** Eight of the
 * twenty-one had a constant fitted to them — seven Latin divisors and the digit
 * divisor — so their residuals are optimistic by construction. The two worst
 * errors in the corpus, `code-heavy` at 6.4% and `punctuation-heavy` at 5.7%, are
 * fitted to nothing at all, and they are what sets this figure.
 *
 * Exported so every report, README and tool description reads the same number. It
 * was a literal in twenty-four files before this, with the only machine-readable
 * copy in a test, and `token-band.test.js` now fails any file that states a
 * different one.
 */
export const ESTIMATE_ERROR_BAND_PCT = 10;

const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/;

/**
 * Kana, separated from the rest of CJK because they do not cost the same.
 *
 * **This was the largest error left in the corpus.** Every CJK character was
 * charged one token, and measured against the counting endpoint that put Japanese
 * at **+11.2%** — the worst figure anywhere in twenty-one samples — while Chinese
 * came out at −3.2% under the identical rule. One constant cannot be right for
 * both, and the reason is visible in the samples: the Japanese one is 58% kana and
 * the Chinese one is 0%.
 *
 * Kana are a small syllabary that appears in every sentence, so the merge table
 * covers runs of them and several characters share a token. Han are tens of
 * thousands of rare characters; a merge table cannot cover them and they cost
 * about one each, sometimes more.
 *
 * The signal needs no detector. A character is kana or it is not, and the two
 * samples separate perfectly — 58.3% against 0.00% — so this is a property of the
 * character rather than a guess about the document. That is the difference between
 * this and `language.ts`, which has to decide and is allowed to refuse.
 */
const KANA = /[぀-ヿ]/;
const LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
const DIGIT = /[0-9]/;

/**
 * Characters per token, per language.
 *
 * Measured, one entry at a time, against `test/fixtures/token-ground-truth.json`.
 * English keeps 4 because it measures +1.0% there; the others are lower because
 * they are thinner in the merge table and cost more tokens for the same text.
 *
 * **Every one of these now has a held-out test.** Each language was calibrated on
 * support prompts and then measured again on a code-review prompt — a different
 * register, different vocabulary, different length — and the divisors held:
 * English +1.0% then +0.4%, German -9.2% then -8.5%, French -1.2% then -5.8%,
 * Spanish -6.2% then -9.7% under the previous values. That is the evidence that
 * these fit a language rather than a template, and it is why the band can rest on
 * them now.
 *
 * `en` stays at a round 4 rather than the 4.05 the search prefers: a hundredth of
 * a divisor is precision the twenty-one samples cannot support, and it changes no
 * estimate.
 *
 * A language absent from this table falls through to `DEFAULT_DIVISOR`, which is
 * the English number and the behaviour this estimator has always had. Adding a
 * language means measuring it, not guessing it.
 */
const DIVISOR_BY_LANGUAGE: Readonly<Record<string, number>> = {
  en: 4,
  es: 2.8,
  fr: 3.05,
  de: 2.25,
  it: 2.8,
  pt: 3.05,
  nl: 2.65,
};

/**
 * Tokens per character for the two halves of CJK, measured.
 *
 * `0.75` and `1.05` come from a search over the two CJK samples in
 * `test/fixtures/token-ground-truth.json`, and they take that pair from
 * +11.2% / −3.2% to −1.5% / +1.3%.
 *
 * **Two samples fitted two constants, so those residuals are in-sample and
 * optimistic by construction** — the same caveat the Latin divisors carry, stated
 * for the same reason. What makes them worth having anyway is the size of the
 * error they replace and the fact that they move in opposite directions: a single
 * constant could not have been within four points of both, whatever it was set to.
 * The honest test is a third CJK sample, and the corpus grows one at a time.
 *
 * Hangul keeps the old cost of 1, because nothing here measures Korean. Guessing
 * it from Japanese would be inventing a figure — the two scripts have nothing in
 * common that would make one predict the other.
 */
const KANA_TOKENS_PER_CHAR = 0.75;
const HAN_TOKENS_PER_CHAR = 1.05;

/**
 * What a prompt gets when the language could not be told.
 *
 * The English value on purpose. An unknown-language prompt is most often English
 * or code, and lowering this would inflate every estimate that the detector
 * declined to classify — a change that helps nothing measured and hurts the two
 * samples the estimator gets right.
 */
const DEFAULT_DIVISOR = 4;

/** Effective word length: non-ASCII characters split into more tokens. */
function effectiveLength(word: string): number {
  let len = 0;
  for (const ch of word) len += ch.charCodeAt(0) > 127 ? 2 : 1;
  return len;
}

/**
 * Estimates how many tokens `text` occupies.
 *
 * Rules per character class:
 * - words: ~4 effective characters per token (minimum 1)
 * - numbers: ~3 digits per token
 * - punctuation: ~2 marks per token
 * - newlines: ~1 token per 2 consecutive newlines
 * - CJK: 1 token per character
 * - emoji and symbols outside the BMP: 2 tokens
 * - spaces: 0 (absorbed into the following token)
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Detected once for the whole text, not per word. A prompt is one document; a
  // per-word guess would be noise, and this runs on every call.
  const language = detectTextLanguage(text);
  const divisor = (language === null ? undefined : DIVISOR_BY_LANGUAGE[language]) ?? DEFAULT_DIVISOR;

  let total = 0;
  /**
   * CJK is summed separately because it is the one class counted in fractions of
   * a token. Everything else is whole tokens by the character class it belongs to.
   */
  let cjkTokens = 0;
  let i = 0;
  const chars = Array.from(text);

  while (i < chars.length) {
    const ch = chars[i]!;

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }

    if (ch === '\n') {
      let n = 0;
      while (i < chars.length && chars[i] === '\n') {
        n++;
        i++;
      }
      total += Math.ceil(n / 2);
      continue;
    }

    if (CJK.test(ch)) {
      /**
       * Accumulated as a fraction and rounded once, at the end.
       *
       * Rounding up per run was the first attempt and it was wrong by five
       * points. Ordinary Japanese alternates kana and han inside every sentence,
       * so the runs are short and there are many of them — and a `Math.ceil` per
       * run charges most of a token for each boundary. That is an artefact of
       * where the loop happens to break, not of what the text costs.
       */
      while (i < chars.length && CJK.test(chars[i]!)) {
        cjkTokens += KANA.test(chars[i]!) ? KANA_TOKENS_PER_CHAR : HAN_TOKENS_PER_CHAR;
        i++;
      }
      continue;
    }

    if (LETTER.test(ch)) {
      let word = '';
      while (i < chars.length && (LETTER.test(chars[i]!) || DIGIT.test(chars[i]!))) {
        word += chars[i]!;
        i++;
      }
      total += Math.max(1, Math.ceil(effectiveLength(word) / divisor));
      continue;
    }

    if (DIGIT.test(ch)) {
      let n = 0;
      while (i < chars.length && DIGIT.test(chars[i]!)) {
        n++;
        i++;
      }
      /**
       * 1.5 digits per token, not 3.
       *
       * The 3 was a guess and it was the single worst constant in this file:
       * measured against the counting endpoint, the numeric-heavy sample came out
       * **30.6% under** — by far the largest error in the corpus. Claude's
       * tokenizer splits long digit runs far more finely than prose, because a
       * merge table cannot cover every number.
       *
       * Corrected in isolation, which is why it can be trusted: changing only
       * this takes that sample from -30.6% to -5.0% and moves nothing else more
       * than four points. See `test/fixtures/token-ground-truth.json`.
       */
      total += Math.ceil(n / 1.5);
      continue;
    }

    // Outside the BMP (emoji, unusual symbols): usually 2+ tokens.
    if (ch.codePointAt(0)! > 0xffff) {
      total += 2;
      i++;
      continue;
    }

    // ASCII punctuation and symbols.
    let n = 0;
    while (
      i < chars.length &&
      !LETTER.test(chars[i]!) &&
      !DIGIT.test(chars[i]!) &&
      !CJK.test(chars[i]!) &&
      chars[i] !== ' ' &&
      chars[i] !== '\n' &&
      chars[i] !== '\t' &&
      chars[i] !== '\r' &&
      chars[i]!.codePointAt(0)! <= 0xffff
    ) {
      n++;
      i++;
    }
    if (n === 0) {
      // Unclassified character: count it as 1 and advance so the loop cannot stall.
      total += 1;
      i++;
    } else {
      total += Math.ceil(n / 2);
    }
  }

  // Rounded once, over the whole document, rather than per run — see the CJK branch.
  return total + Math.ceil(cjkTokens);
}

/** Asynchronous token counter, for remote sources. */
export type AsyncTokenCounter = (text: string) => Promise<number>;

export interface AnthropicCounterOptions {
  apiKey: string;
  /** Model to count against. Token counts are model-specific. */
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** See `OpenAiCompatibleOptions.allowInsecure`: only when you chose the URL. */
  allowInsecure?: boolean;
}

/**
 * Exact counter using the official `/v1/messages/count_tokens` endpoint.
 * The endpoint does not bill tokens, so you can use it freely to measure.
 *
 * The third door, and the one nobody had looked at: this takes a `baseUrl` and
 * sends an `x-api-key` to it. Both providers were hardened at the boundary and
 * this was left with no check at all, because it is called a counter rather
 * than a provider. It goes through the same gate now.
 */
export function countTokensAnthropic(options: AnthropicCounterOptions): AsyncTokenCounter {
  const {
    apiKey,
    model = 'claude-opus-5',
    baseUrl = 'https://api.anthropic.com',
    fetchImpl = fetch,
    allowInsecure = false,
  } = options;

  const endpoint = checkedEndpoint(baseUrl, { allowInsecure, name: 'anthropic-count-tokens' });

  return async (text: string): Promise<number> => {
    if (!text.trim()) return 0;
    const res = await fetchImpl(`${endpoint}/v1/messages/count_tokens`, {
      ...SAFE_FETCH_INIT,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: text }] }),
    });
    if (!res.ok) {
      throw new Error(`count_tokens failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { input_tokens: number };
    return data.input_tokens;
  };
}
