import { buildAdvisories } from './advisories.js';
import { computeSavings } from './savings.js';
import { segment } from './segment.js';
import { estimateTokens } from './tokenizer.js';
import type { LlmProvider, OptimizationResult, TokenCounter } from './types.js';

/**
 * Capa de LLM opcional.
 *
 * El núcleo determinista ya hace el trabajo sin coste. Esta pasada añade la
 * compresión semántica que las reglas no pueden hacer (reescribir una frase
 * entera, fusionar dos instrucciones que dicen lo mismo con otras palabras),
 * y por eso cuesta una llamada.
 *
 * El proveedor es enchufable a propósito: aquí encaja el modelo que tengáis en
 * n0, un endpoint compatible con OpenAI, la Claude API o cualquier otra cosa
 * detrás de `customProvider`.
 */

export const REFINER_SYSTEM_PROMPT = `Reescribes prompts para que cuesten menos tokens sin cambiar lo que piden.

Reglas:
- Conserva exactamente la misma tarea, restricciones, formato de salida y criterios de éxito.
- Copia literalmente, sin tocar ni un carácter: bloques de código, URLs, marcadores de plantilla ({{x}}, \${x}, {x}) y etiquetas XML/HTML.
- No resumas ni elimines requisitos. Si dudas de si algo es un requisito, consérvalo.
- Elimina redundancia, rodeos y repeticiones. Une instrucciones duplicadas.
- Mantén el idioma original del prompt.
- Devuelve ÚNICAMENTE el prompt reescrito. Sin explicaciones, sin comentarios, sin vallas de código envolviendo la respuesta.`;

export interface RefineOptions {
  /**
   * Fracción mínima de tokens que debe conservar el resultado (0-1).
   * Por debajo de este umbral se asume que el modelo ha resumido en vez de
   * comprimir, y el candidato se descarta. Por defecto 0.25.
   */
  minRetainRatio?: number;
  tokenCounter?: TokenCounter;
}

/** Quita vallas de código si el modelo ha envuelto la respuesta pese a pedírselo. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^(?:```|~~~)[a-zA-Z]*\n([\s\S]*?)\n?(?:```|~~~)$/.exec(trimmed);
  return match?.[1] ?? trimmed;
}

/**
 * Pasa el prompt ya optimizado por el LLM y acepta el resultado solo si supera
 * las comprobaciones de seguridad.
 *
 * Nunca devuelve un prompt peor que el determinista: si el candidato pierde
 * contenido protegido, crece en tokens o se queda corto de forma sospechosa,
 * se descarta y se mantiene el resultado anterior.
 */
export async function refineWithLlm(
  result: OptimizationResult,
  provider: LlmProvider,
  options: RefineOptions = {},
): Promise<OptimizationResult> {
  const count = options.tokenCounter ?? estimateTokens;
  const minRetainRatio = options.minRetainRatio ?? 0.25;

  const raw = await provider.complete({
    system: REFINER_SYSTEM_PROMPT,
    user: result.optimized,
  });
  const candidate = stripCodeFence(raw);
  const tokensBefore = result.tokensAfter;
  const tokensAfter = count(candidate);

  const base = {
    provider: provider.name,
    model: provider.model,
    candidate,
    tokensBefore,
    tokensAfter,
  };

  const reject = (rejectedReason: string): OptimizationResult => ({
    ...result,
    llm: { ...base, applied: false, rejectedReason },
  });

  if (!candidate.trim()) {
    return reject('El modelo devolvió una respuesta vacía.');
  }

  // El contenido protegido tiene que seguir ahí, carácter por carácter.
  const mustSurvive = [
    ...new Set(
      segment(result.optimized)
        .filter((s) => s.kind === 'protected')
        .map((s) => s.text),
    ),
  ];
  const lost = mustSurvive.filter((text) => !candidate.includes(text));
  if (lost.length > 0) {
    return reject(
      `El modelo alteró ${lost.length} fragmento(s) protegido(s) (código, URL o marcador de plantilla). Descartado para no romper el prompt.`,
    );
  }

  if (tokensAfter >= tokensBefore) {
    return reject(
      `El resultado no es más corto (${tokensAfter} vs ${tokensBefore} tokens). Se mantiene la versión determinista.`,
    );
  }

  if (tokensAfter < tokensBefore * minRetainRatio) {
    return reject(
      `El resultado conserva solo el ${Math.round((tokensAfter / tokensBefore) * 100)}% de los tokens. Eso parece un resumen, no una compresión: revísalo a mano antes de usarlo.`,
    );
  }

  const finalTokensBefore = result.tokensBefore;
  const savings = computeSavings(finalTokensBefore, tokensAfter, result.usage);
  const advisories = buildAdvisories(candidate, tokensAfter, result.usage, new Date(), count);

  return {
    ...result,
    optimized: candidate,
    tokensAfter,
    tokensSaved: finalTokensBefore - tokensAfter,
    reductionPct:
      finalTokensBefore > 0 ? ((finalTokensBefore - tokensAfter) / finalTokensBefore) * 100 : 0,
    savings,
    advisories,
    llm: { ...base, applied: true },
  };
}

// --------------------------------------------------------------------------
// Proveedores incluidos
// --------------------------------------------------------------------------

export interface OpenAiCompatibleOptions {
  /** URL base, sin `/chat/completions`. Ej: `https://llm.n0.dev/v1` */
  baseUrl: string;
  apiKey?: string;
  model: string;
  /** Cabeceras extra, por si tu gateway pide alguna propia. */
  headers?: Record<string, string>;
  /** Nombre que aparecerá en el informe. */
  name?: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Cualquier endpoint que hable el formato `/chat/completions` de OpenAI.
 * Cubre vLLM, Ollama, OpenRouter, LM Studio, Together y la mayoría de gateways
 * internos, incluido el que tengáis montado en n0 si expone ese formato.
 */
export function openAiCompatible(options: OpenAiCompatibleOptions): LlmProvider {
  const {
    baseUrl,
    apiKey,
    model,
    headers = {},
    name = 'openai-compatible',
    maxTokens = 8192,
    fetchImpl = fetch,
  } = options;

  return {
    name,
    model,
    async complete({ system, user }) {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          ...headers,
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`El proveedor "${name}" respondió ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error(`Respuesta inesperada de "${name}": no se encontró choices[0].message.content`);
      }
      return content;
    },
  };
}

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}

/** Claude API directa, vía `/v1/messages`. */
export function anthropicProvider(options: AnthropicProviderOptions): LlmProvider {
  const {
    apiKey,
    model = 'claude-opus-5',
    baseUrl = 'https://api.anthropic.com',
    maxTokens = 8192,
    fetchImpl = fetch,
  } = options;

  return {
    name: 'anthropic',
    model,
    async complete({ system, user }) {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) {
        throw new Error(`La Claude API respondió ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
        stop_reason?: string;
      };
      if (data.stop_reason === 'refusal') {
        throw new Error('La Claude API rechazó la petición (stop_reason: refusal).');
      }
      const text = data.content?.find((b) => b.type === 'text')?.text;
      if (typeof text !== 'string') {
        throw new Error('Respuesta inesperada de la Claude API: sin bloque de texto.');
      }
      return text;
    },
  };
}

export interface CustomProviderOptions {
  name: string;
  model: string;
  /** Construye la petición HTTP a partir del prompt del sistema y el usuario. */
  request(input: { system: string; user: string }): { url: string; init: RequestInit };
  /** Extrae el texto del cuerpo de la respuesta ya parseado. */
  extract(body: unknown): string;
  fetchImpl?: typeof fetch;
}

/**
 * Escotilla de escape: si tu endpoint no habla ninguno de los formatos
 * anteriores, defines aquí cómo se construye la petición y cómo se lee la
 * respuesta, y todo lo demás sigue funcionando igual.
 */
export function customProvider(options: CustomProviderOptions): LlmProvider {
  const { name, model, request, extract, fetchImpl = fetch } = options;
  return {
    name,
    model,
    async complete(input) {
      const { url, init } = request(input);
      const res = await fetchImpl(url, init);
      if (!res.ok) {
        throw new Error(`El proveedor "${name}" respondió ${res.status}: ${await res.text()}`);
      }
      return extract(await res.json());
    },
  };
}

/**
 * Construye un proveedor a partir de variables de entorno.
 *
 *   TRAZUM_LLM_PROVIDER  openai | anthropic   (por defecto: openai)
 *   TRAZUM_LLM_BASE_URL  URL base del endpoint
 *   TRAZUM_LLM_API_KEY   clave, si hace falta
 *   TRAZUM_LLM_MODEL     identificador del modelo
 *
 * Devuelve `null` si no hay configuración suficiente, para que la herramienta
 * siga funcionando en modo determinista sin dar error.
 */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): LlmProvider | null {
  const kind = (env.TRAZUM_LLM_PROVIDER ?? 'openai').toLowerCase();
  const apiKey = env.TRAZUM_LLM_API_KEY;
  const model = env.TRAZUM_LLM_MODEL;
  const baseUrl = env.TRAZUM_LLM_BASE_URL;

  if (kind === 'anthropic') {
    if (!apiKey) return null;
    return anthropicProvider({ apiKey, ...(model ? { model } : {}), ...(baseUrl ? { baseUrl } : {}) });
  }

  if (!baseUrl || !model) return null;
  return openAiCompatible({
    baseUrl,
    model,
    ...(apiKey ? { apiKey } : {}),
    name: env.TRAZUM_LLM_NAME ?? 'llm',
  });
}
