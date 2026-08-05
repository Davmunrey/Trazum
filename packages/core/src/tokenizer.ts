/**
 * Dependency-free token estimator.
 *
 * This is NOT a real tokenizer: it is a heuristic calibrated per character
 * class. On ordinary text (English/Spanish, markdown, code) the typical error
 * sits around ±15%. That is plenty for comparing two versions of the same
 * prompt, which is what this tool does, but do NOT bill anyone from it.
 *
 * For exact numbers use `countTokensAnthropic` (the official token-counting
 * endpoint, which is free) or pass your own `TokenCounter`.
 */

const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/;
const LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
const DIGIT = /[0-9]/;

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
      total += Math.max(1, Math.ceil(effectiveLength(word) / 4));
      continue;
    }

    if (DIGIT.test(ch)) {
      let n = 0;
      while (i < chars.length && DIGIT.test(chars[i]!)) {
        n++;
        i++;
      }
      total += Math.ceil(n / 3);
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
}

/**
 * Exact counter using the official `/v1/messages/count_tokens` endpoint.
 * The endpoint does not bill tokens, so you can use it freely to measure.
 */
export function countTokensAnthropic(options: AnthropicCounterOptions): AsyncTokenCounter {
  const {
    apiKey,
    model = 'claude-opus-5',
    baseUrl = 'https://api.anthropic.com',
    fetchImpl = fetch,
  } = options;

  return async (text: string): Promise<number> => {
    if (!text.trim()) return 0;
    const res = await fetchImpl(`${baseUrl}/v1/messages/count_tokens`, {
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
