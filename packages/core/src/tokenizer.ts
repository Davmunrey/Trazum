/**
 * Estimador de tokens sin dependencias.
 *
 * NO es un tokenizador real: es una heurística calibrada por tipo de carácter.
 * En texto normal (español/inglés, markdown, código) el error típico está en el
 * entorno del ±15%. Sirve de sobra para comparar dos versiones del mismo prompt,
 * que es lo que hace esta herramienta, pero NO lo uses para facturar.
 *
 * Para números exactos usa `countTokensAnthropic` (endpoint oficial de recuento,
 * que es gratuito) o pasa tu propio `TokenCounter`.
 */

const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/;
const LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
const DIGIT = /[0-9]/;

/** Longitud efectiva de una palabra: los caracteres no ASCII se parten más. */
function effectiveLength(word: string): number {
  let len = 0;
  for (const ch of word) len += ch.charCodeAt(0) > 127 ? 2 : 1;
  return len;
}

/**
 * Estima cuántos tokens ocupa `text`.
 *
 * Reglas por tipo de carácter:
 * - palabras: ~4 caracteres efectivos por token (mínimo 1)
 * - números: ~3 dígitos por token
 * - puntuación: ~2 signos por token
 * - saltos de línea: ~1 token cada 2 saltos consecutivos
 * - CJK: 1 token por carácter
 * - emoji y símbolos fuera del BMP: 2 tokens
 * - espacios: 0 (se absorben en el token siguiente)
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

    // Fuera del BMP (emoji, símbolos raros): suelen costar 2+ tokens.
    if (ch.codePointAt(0)! > 0xffff) {
      total += 2;
      i++;
      continue;
    }

    // Puntuación y símbolos ASCII.
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
      // Carácter no clasificado: cuenta como 1 y avanza para no bloquear el bucle.
      total += 1;
      i++;
    } else {
      total += Math.ceil(n / 2);
    }
  }

  return total;
}

/** Contador de tokens asíncrono, para fuentes remotas. */
export type AsyncTokenCounter = (text: string) => Promise<number>;

export interface AnthropicCounterOptions {
  apiKey: string;
  /** Modelo contra el que contar. El recuento es específico del modelo. */
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Contador exacto usando el endpoint oficial `/v1/messages/count_tokens`.
 * El endpoint no cobra tokens, así que puedes usarlo libremente para medir.
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
      throw new Error(`count_tokens falló (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as { input_tokens: number };
    return data.input_tokens;
  };
}
