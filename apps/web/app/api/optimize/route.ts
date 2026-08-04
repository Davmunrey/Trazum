import { NextResponse } from 'next/server';

import {
  RULES,
  anthropicProvider,
  listModels,
  openAiCompatible,
  optimize,
  providerFromEnv,
  refineWithLlm,
} from '@trazum/core';
import type { LlmProvider, RuleLevel, UsageProfile } from '@trazum/core';

export const runtime = 'nodejs';

/** Tope de tamaño: evita que una pestaña abierta tumbe el proceso. */
const MAX_PROMPT_CHARS = 400_000;

// --------------------------------------------------------------------------
// Límite de peticiones
// --------------------------------------------------------------------------

/**
 * Ventana deslizante en memoria por IP. En serverless cada instancia lleva su
 * propio contador, así que el límite real puede ser algo más laxo: es una
 * barrera contra abuso accidental, no una cuota de facturación.
 */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 30;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function rateLimited(request: Request): boolean {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'local';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);

  if (!bucket || now >= bucket.resetAt) {
    // Aprovecha para purgar entradas caducadas y que el mapa no crezca sin fin.
    if (rateBuckets.size > 10_000) {
      for (const [key, value] of rateBuckets) {
        if (now >= value.resetAt) rateBuckets.delete(key);
      }
    }
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  bucket.count++;
  return bucket.count > RATE_MAX_REQUESTS;
}

// --------------------------------------------------------------------------
// Protección SSRF
// --------------------------------------------------------------------------

const PRIVATE_HOST_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // metadatos de nube (AWS/GCP/Azure)
  /^\[?::1\]?$/,
  /^\[?f[cd][0-9a-f]{2}:/i, // ULA IPv6
  /^\[?fe80:/i, // link-local IPv6
  /\.internal$/i,
  /\.local$/i,
];

/**
 * El endpoint acepta una URL de LLM elegida por el cliente. Sin este filtro,
 * cualquiera podría usar el servidor desplegado para hacer peticiones a la
 * red interna o a los metadatos de la nube (SSRF). En desarrollo se permite
 * http y hosts locales para poder probar contra un LLM en tu máquina.
 */
function validateBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return 'La URL del endpoint no es válida.';
  }

  const dev = process.env.NODE_ENV === 'development';
  if (url.protocol !== 'https:' && !(dev && url.protocol === 'http:')) {
    return 'El endpoint del LLM debe usar https.';
  }
  if (!dev && PRIVATE_HOST_PATTERNS.some((re) => re.test(url.hostname))) {
    return 'El endpoint del LLM no puede apuntar a una dirección interna.';
  }
  return null;
}

interface RequestBody {
  prompt?: unknown;
  level?: unknown;
  usage?: Partial<UsageProfile>;
  disableRules?: unknown;
  llm?: {
    enabled?: boolean;
    provider?: string;
    baseUrl?: string;
    model?: string;
    apiKey?: string;
  };
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Construye el proveedor de LLM para esta petición.
 *
 * Prioridad: lo que venga en el cuerpo (permite probar endpoints desde la UI),
 * y si no, la configuración del servidor por variables de entorno. Las claves
 * que llegan en el cuerpo se usan y se descartan: no se registran ni se guardan.
 */
function buildProvider(config: NonNullable<RequestBody['llm']>): LlmProvider | null {
  const { provider, baseUrl, model, apiKey } = config;

  if (provider === 'anthropic') {
    const key = apiKey || process.env.TRAZUM_LLM_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!key) return providerFromEnv();
    return anthropicProvider({ apiKey: key, ...(model ? { model } : {}) });
  }

  if (baseUrl && model) {
    return openAiCompatible({
      baseUrl,
      model,
      ...(apiKey || process.env.TRAZUM_LLM_API_KEY
        ? { apiKey: apiKey || process.env.TRAZUM_LLM_API_KEY! }
        : {}),
      name: 'llm',
    });
  }

  return providerFromEnv();
}

export async function POST(request: Request) {
  if (rateLimited(request)) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones. Espera un minuto y vuelve a intentarlo.' },
      { status: 429 },
    );
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return badRequest('El cuerpo de la petición no es JSON válido.');
  }

  const { prompt } = body;
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return badRequest('Falta el prompt.');
  }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return badRequest(
      `El prompt supera el límite de ${MAX_PROMPT_CHARS.toLocaleString('es-ES')} caracteres.`,
    );
  }

  const level: RuleLevel = body.level === 'aggressive' ? 'aggressive' : 'safe';

  const disableRules = Array.isArray(body.disableRules)
    ? body.disableRules.filter((id): id is string => typeof id === 'string')
    : [];
  const unknownRule = disableRules.find((id) => !RULES.some((r) => r.id === id));
  if (unknownRule) return badRequest(`Regla desconocida: "${unknownRule}".`);

  const usage = body.usage ?? {};
  if (usage.model && !listModels().some((m) => m.id === usage.model)) {
    return badRequest(`Modelo desconocido: "${usage.model}".`);
  }

  try {
    let result = optimize(prompt, { level, usage, disableRules });

    if (body.llm?.enabled) {
      if (body.llm.baseUrl) {
        const urlError = validateBaseUrl(body.llm.baseUrl);
        if (urlError) return badRequest(urlError);
      }
      const provider = buildProvider(body.llm);
      if (!provider) {
        return badRequest(
          'Has activado la pasada por LLM pero no hay proveedor configurado. Rellena endpoint y modelo, o define TRAZUM_LLM_BASE_URL y TRAZUM_LLM_MODEL en el servidor.',
        );
      }
      result = await refineWithLlm(result, provider);
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.';
    // El fallo suele venir del LLM externo, no de nuestro código.
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** Metadatos que la UI necesita para pintar los desplegables. */
export async function GET() {
  return NextResponse.json({
    models: listModels(),
    rules: RULES.map((r) => ({
      id: r.id,
      title: r.title,
      rationale: r.rationale,
      level: r.level,
    })),
    llmConfiguredOnServer: providerFromEnv() !== null,
  });
}
