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
