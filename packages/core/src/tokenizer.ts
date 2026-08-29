/**
 * Dependency-free token estimator.
 *
 * This is NOT a real tokenizer: it is a heuristic calibrated per character
 * class, built for comparing two versions of the same prompt — but do NOT bill
 * anyone from it.
 *
 * **Its accuracy is not one number, and the years it was written as one were
 * the mistake.** The branches below treat CJK, digits and punctuation quite
 * differently from words, and there was never a reason those should land on the
 * same accuracy. Measured over 47 samples against the official counting
 * endpoint they do not: the worst error is 3.2% on CJK, 5.6% on Latin prose,
 * 25.1% on code and quoting, and 32.5% on a digit-dominant table. `band.ts`
 * holds the bands those measurements earn and `bandFor(text)` is what a caller
 * should print; the constant below is only the widest of them, for callers that
 * have no text in hand.
 *
 * `test/token-band.test.js` holds every sample against the band `bandFor` gives
 * it, and a sample edited since it was measured fails rather than passing
 * quietly.
 *
 * For exact numbers use `countTokensAnthropic` (the official token-counting
 * endpoint, which is free) or pass your own `TokenCounter`.
 */

import { detectTextLanguage } from './language.js';
import { SAFE_FETCH_INIT, checkedEndpoint } from './net.js';

/**
 * The widest band this estimator is published under, as a percentage.
 *
 * **A history worth keeping, because each value was believed at the time.** It
 * was `15` for eight releases as a design target nobody had checked; the first
 * measurement found two of eight samples outside it and it went to `25`; fixing
 * the digit divisor and calibrating per language brought it back to `15`, and
 * splitting kana from han — Japanese had been +11.2% and Chinese −3.2% under one
 * rule — brought it to `10`. Four values, each an improvement, and all four
 * wrong in the same way.
 *
 * **The corpus they were measured on was the corpus they were fitted to.**
 * Twenty-one samples held thirteen files of Latin prose and exactly one each of
 * code, numeric and punctuation, and those single files were where the constants
 * came from. The worst error it could show was 6.4%, and 10 looked like a
 * comfortable margin over it. Neither figure was about the estimator.
 *
 * **It is no longer one number, and this one is the widest.** A corpus of
 * thirteen prose files and one each of code, numeric and punctuation put the
 * band at 10, and those single files were the set the constants had been fitted
 * to. Measured on forty-seven, the same estimator is 6% out on prose and 33%
 * out on a CSV ledger. `bandFor` in `band.ts` is what a caller that has the
 * text should use.
 *
 * This stays for the callers that do not have it — a figure covering the whole
 * catalogue of text, which can only be the worst of them. Widening it from 10
 * to 33 makes every claim that reads it true where it had been false, at the
 * cost of understating the estimator on prose. That trade is deliberate: a
 * caller with no text cannot know which it is holding, and there is only one
 * safe direction to guess in.
 */
export const ESTIMATE_ERROR_BAND_PCT = 33;

/**
 * Whose tokenizer that band was measured against.
 *
 * The number above is not a property of the estimator; it is a property of the
 * estimator **against Claude**. Forty-seven samples, one counting endpoint, one
 * family. Trazum prices seven, and the two that have since been run are far
 * outside anything published here: DeepSeek 94.5% at worst, Mistral 103.1%. On
 * a Gemini prompt nobody has measured it at all, and `measuredForeignError`
 * answers null rather than the nearest number. On a GPT prompt somebody has:
 * 112.4%, the worst of the four measured, and the figure this file reported as
 * unmeasured for a release while its own fixture held the answer.
 *
 * Exported as a name rather than left implicit in a comment because the band
 * had already leaked out of its domain in three places: an advisory that told a
 * GPT-5 user *"the call will fail"* on the strength of a Claude measurement,
 * the same advisory sending them to a counting endpoint that counts a different
 * tokenizer, and `--exact-tokens` forwarding their model id to Anthropic. A
 * fact with no name is a fact nothing can check.
 */
export const BAND_CALIBRATED_PROVIDER = 'anthropic';

/**
 * Whether the published band describes this provider's tokenizer.
 *
 * `undefined` is false, deliberately. A model with no provider recorded is not
 * evidence that the band applies to it — and the flattering reading of missing
 * information is the one this project does not take.
 */
export function bandGoverns(provider: string | undefined | null): boolean {
  return provider === BAND_CALIBRATED_PROVIDER;
}

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
 * Hangul, measured at last.
 *
 * The comment above used to end *"Hangul keeps the old cost of 1, because
 * nothing here measures Korean. Guessing it from Japanese would be inventing a
 * figure."* That was right, and it stayed right for exactly as long as nobody
 * measured Korean. `cjk-korean.txt` now does: at 1 token per character the
 * estimate came out **20.0% under** — 232 against 290 — and 1.20 takes it to
 * -10.0%.
 *
 * **1.20 was the one-sample answer and it was wrong by ten points.** A second
 * Korean sample in a different register — a deployment review against support
 * copy — put both at -10.6% and -10.0% under it, and solving the constant on
 * the two together lands on 1.35, where both come out at 0.0%.
 *
 * Two independent texts agreeing to within four tenths of a point across the
 * whole search is what makes this a property of Hangul rather than a fit to a
 * file. Their residuals move in lockstep at every candidate value: -10.6/-10.0
 * at 1.20, -3.5/-3.1 at 1.30, 3.2/3.4 at 1.40. One sample cannot show that and
 * two can, which is the entire argument for measuring more of the thin classes
 * rather than tuning harder on the thin ones.
 *
 * Still in-sample: the honest test is a third Korean prompt, and the corpus
 * grows one at a time.
 */
const HANGUL_TOKENS_PER_CHAR = 1.35;
const HANGUL = /[가-힯]/;

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
        cjkTokens += KANA.test(chars[i]!)
          ? KANA_TOKENS_PER_CHAR
          : HANGUL.test(chars[i]!)
            ? HANGUL_TOKENS_PER_CHAR
            : HAN_TOKENS_PER_CHAR;
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
      /**
       * One token per symbol, not one per two.
       *
       * Two was the shipped value and every symbol-dense sample in the corpus
       * undercounted under it, in the same direction, by amounts that grow with
       * density: punctuation-heavy -5.7%, code-heavy -6.4%,
       * punctuation-markup -11.4%, code-sql -25.6%, code-shell -29.8%. Five
       * samples agreeing on a direction is a shape, not a fit — a merge table
       * covers `, ` and `. ` and covers `${`, `"$`, `--` and `&#8209;` far less
       * well, and shell and SQL are made of the second kind.
       *
       * Searched over the whole corpus rather than the class it helps, so a
       * value that fixed code by wrecking prose could not look like a win: at
       * 1.0 the samples outside the published band drop from five to three and
       * the mean error from 6.6% to 5.1%, with no sample moved more than a
       * point in the wrong direction.
       *
       * The search wanted to go below 1.0 and was not allowed to. Below one is
       * more than a token per symbol, which may well be true of SQL — code-sql
       * is still 24.9% under — but it is a claim about a class this corpus has
       * two samples of, and two samples do not earn a constant.
       */
      total += Math.ceil(n / 1);
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
