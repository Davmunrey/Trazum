import type { ModelPricing } from './types.js';

/**
 * Catálogo de modelos y precios (USD por millón de tokens).
 *
 * Fuente: documentación oficial de la Claude API. Los precios cambian: revisa
 * `PRICING_LAST_REVIEWED` y actualiza este fichero antes de tomar decisiones de
 * presupuesto. Los precios de Amazon Bedrock y Vertex AI los fija cada partner
 * y NO son los de esta tabla.
 */
export const PRICING_LAST_REVIEWED = '2026-06-24';

/** Multiplicadores de coste sobre el precio de entrada. */
export const COST_MULTIPLIERS = {
  /** Escritura de caché con TTL de 5 minutos. */
  cacheWrite5m: 1.25,
  /** Escritura de caché con TTL de 1 hora. */
  cacheWrite1h: 2.0,
  /** Lectura de caché: ~10% del precio de entrada. */
  cacheRead: 0.1,
  /** Batch API: 50% de descuento sobre entrada y salida. */
  batch: 0.5,
} as const;

export const MODELS: ModelPricing[] = [
  {
    id: 'claude-fable-5',
    displayName: 'Claude Fable 5',
    inputPerMTok: 10,
    outputPerMTok: 50,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    tier: 'frontier',
    notes: 'Máxima capacidad. Requiere retención de datos de 30 días.',
  },
  {
    id: 'claude-mythos-5',
    displayName: 'Claude Mythos 5',
    inputPerMTok: 10,
    outputPerMTok: 50,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    tier: 'frontier',
    notes: 'Solo disponible dentro de Project Glasswing.',
  },
  {
    id: 'claude-opus-5',
    displayName: 'Claude Opus 5',
    inputPerMTok: 5,
    outputPerMTok: 25,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    tier: 'opus',
    notes: 'Mínimo de caché de 512 tokens: cachea prompts que en Opus 4.6 no cacheaban.',
  },
  {
    id: 'claude-opus-4-8',
    displayName: 'Claude Opus 4.8',
    inputPerMTok: 5,
    outputPerMTok: 25,
    contextWindow: 1_000_000,
    cacheMinTokens: 1024,
    tier: 'opus',
  },
  {
    id: 'claude-opus-4-7',
    displayName: 'Claude Opus 4.7',
    inputPerMTok: 5,
    outputPerMTok: 25,
    contextWindow: 1_000_000,
    cacheMinTokens: 2048,
    tier: 'opus',
  },
  {
    id: 'claude-opus-4-6',
    displayName: 'Claude Opus 4.6',
    inputPerMTok: 5,
    outputPerMTok: 25,
    contextWindow: 1_000_000,
    cacheMinTokens: 4096,
    tier: 'opus',
  },
  {
    id: 'claude-sonnet-5',
    displayName: 'Claude Sonnet 5',
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 1_000_000,
    cacheMinTokens: 1024,
    tier: 'sonnet',
    promo: { inputPerMTok: 2, outputPerMTok: 10, until: '2026-08-31' },
    notes: 'Precio de lanzamiento 2/10 hasta el 31-08-2026; después 3/15.',
  },
  {
    id: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet 4.6',
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 1_000_000,
    cacheMinTokens: 1024,
    tier: 'sonnet',
  },
  {
    id: 'claude-haiku-4-5',
    displayName: 'Claude Haiku 4.5',
    inputPerMTok: 1,
    outputPerMTok: 5,
    contextWindow: 200_000,
    cacheMinTokens: 4096,
    tier: 'haiku',
    notes: 'Ventana de 200K y salida máxima de 64K, menor que el resto.',
  },
];

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export const DEFAULT_MODEL = 'claude-opus-5';

export function getModel(id: string): ModelPricing {
  const model = BY_ID.get(id);
  if (!model) {
    throw new Error(
      `Modelo desconocido: "${id}". Disponibles: ${MODELS.map((m) => m.id).join(', ')}`,
    );
  }
  return model;
}

export function listModels(): ModelPricing[] {
  return [...MODELS];
}

/** Precio efectivo en una fecha dada, aplicando promociones vigentes. */
export function effectivePricing(
  model: ModelPricing,
  on: Date = new Date(),
): { inputPerMTok: number; outputPerMTok: number; promoApplied: boolean } {
  if (model.promo) {
    const until = new Date(`${model.promo.until}T23:59:59.999Z`);
    if (on.getTime() <= until.getTime()) {
      return {
        inputPerMTok: model.promo.inputPerMTok,
        outputPerMTok: model.promo.outputPerMTok,
        promoApplied: true,
      };
    }
  }
  return {
    inputPerMTok: model.inputPerMTok,
    outputPerMTok: model.outputPerMTok,
    promoApplied: false,
  };
}

/** El modelo más barato de cada nivel de capacidad, para recomendaciones. */
export function cheapestOfTier(tier: ModelPricing['tier']): ModelPricing {
  const candidates = MODELS.filter((m) => m.tier === tier);
  const first = candidates[0];
  if (!first) throw new Error(`Sin modelos para el nivel "${tier}"`);
  return candidates.reduce((best, m) => (m.inputPerMTok < best.inputPerMTok ? m : best), first);
}
