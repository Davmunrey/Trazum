/**
 * Dependency-free token estimator.
 *
 * This is NOT a real tokenizer: it is a heuristic calibrated per character
 * class. It is built to keep the typical error on ordinary text
 * (English/Spanish, markdown, code) inside ±15%, which is plenty for comparing
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
 * **Measured, not chosen.** It was `15` for eight releases — a design target
 * nobody had checked — and the first run of `scripts/measure-token-band.mjs`
 * against the official counting endpoint found two of eight samples outside it,
 * both underestimating. Underestimating tokens means under-reporting cost, which
 * is the flattering direction and the worst one for this tool.
 *
 * `15` is the measured worst case rounded up, by the same rule that briefly made
 * it 25: the corpus now tops out at 11.2%, on Japanese. It landing back on the
 * number that was a guess for eight releases is a coincidence and not a
 * restoration — that 15 bounded nothing, and this one bounds eleven measured
 * samples across four languages and six text types.
 *
 * **Read one caveat before trusting it.** Four of those samples are the Latin
 * languages whose divisors in `DIVISOR_BY_LANGUAGE` were calibrated on one or two
 * samples each, so their residuals are in-sample and optimistic by construction.
 * The band is set by the seven samples nothing was fitted to — worst 11.2% — and
 * the honest test of it is the next held-out sample in Spanish, French or German.
 * The corpus grows one sample at a time now, so that test is cheap to run.
 *
 * **What got it there was not accents.** A Spanish sample with zero accented
 * characters measured -22.9% against -22.1% for accented Spanish, which killed
 * diacritics as a signal. Languages differ in how many tokens their words cost —
 * English 3.44 characters per token, German 2.02 — so the estimator detects the
 * language and divides accordingly. See `language.ts`.
 *
 * Exported so every report, README and tool description reads the same number.
 * It was a literal in twenty-four files before this, with the only machine-
 * readable copy in a test.
 */
export const ESTIMATE_ERROR_BAND_PCT = 15;

const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/;
const LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
const DIGIT = /[0-9]/;

/**
 * Characters per token, per language.
 *
 * Measured, one entry at a time, against `test/fixtures/token-ground-truth.json`.
 * English keeps 4 because it measures +1.0% there; the others are lower because
 * they are thinner in the merge table and cost more tokens for the same text.
 *
 * **Each of these is calibrated on one or two samples**, which is enough to
 * establish the effect — five samples across four languages all point the same way
 * — and not enough to call the residual a measured band. The published band is set
 * by the unknown-language fallback, not by these.
 *
 * A language absent from this table falls through to `DEFAULT_DIVISOR`, which is
 * the English number and the behaviour this estimator has always had. Adding a
 * language means measuring it, not guessing it.
 */
const DIVISOR_BY_LANGUAGE: Readonly<Record<string, number>> = {
  en: 4,
  es: 3,
  fr: 3.4,
  de: 2.5,
};

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
      let n = 0;
      while (i < chars.length && CJK.test(chars[i]!)) {
        n++;
        i++;
      }
      total += n;
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

  return total;
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
