import type { ModelPricing } from './types.js';

/**
 * Model and pricing catalogue (USD per million tokens).
 *
 * Source: official Claude API documentation. Prices change: check
 * `PRICING_LAST_REVIEWED` and update this file before making budget decisions.
 * Amazon Bedrock and Vertex AI pricing is set by each partner and is NOT the
 * pricing in this table.
 */
export const PRICING_LAST_REVIEWED = '2026-06-24';

/** Cost multipliers relative to the input price. */
export const COST_MULTIPLIERS = {
  /** Cache write with a 5-minute TTL. */
  cacheWrite5m: 1.25,
  /** Cache write with a 1-hour TTL. */
  cacheWrite1h: 2.0,
  /** Cache read: ~10% of the input price. */
  cacheRead: 0.1,
  /** Batch API: 50% discount on input and output. */
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
    notes: 'Highest capability. Requires 30-day data retention.',
  },
  {
    id: 'claude-mythos-5',
    displayName: 'Claude Mythos 5',
    inputPerMTok: 10,
    outputPerMTok: 50,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    tier: 'frontier',
    notes: 'Available only through Project Glasswing.',
  },
  {
    id: 'claude-opus-5',
    displayName: 'Claude Opus 5',
    inputPerMTok: 5,
    outputPerMTok: 25,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    tier: 'opus',
    notes: '512-token cache minimum: caches prompts that would miss on Opus 4.6.',
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
    notes: 'Introductory pricing of 2/10 until 2026-08-31; 3/15 afterwards.',
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
    notes: '200K context window and a 64K output cap, smaller than the rest.',
  },
];

export const DEFAULT_MODEL = 'claude-opus-5';

/**
 * A set of prices to work from.
 *
 * Prices change on someone else's schedule, and until 1.0 correcting one meant
 * upgrading the library — which is backwards: a stale price is a wrong number in
 * a budget decision, and nobody should have to take a dependency bump to fix it.
 *
 * So the catalogue is a **value**, not module state. The bundled one below is the
 * default, and `applyPricingOverlay` returns a *new* catalogue with local
 * corrections layered on. Nothing mutates: a caller who overlays prices does not
 * change what any other caller sees, and two catalogues can exist in one process
 * — which is what makes it testable and what stops one consumer's local prices
 * leaking into another's report.
 */
export interface PricingCatalogue {
  models: ModelPricing[];
  byId: Map<string, ModelPricing>;
  /** The date the prices in this catalogue were last checked. */
  lastReviewed: string;
  /** Ids whose bundled prices an overlay replaced. Empty for the bundled set. */
  overriddenModels: string[];
  /** Ids an overlay introduced that the bundled catalogue does not have. */
  addedModels: string[];
}

function makeCatalogue(
  models: ModelPricing[],
  lastReviewed: string,
  overriddenModels: string[] = [],
  addedModels: string[] = [],
): PricingCatalogue {
  return {
    models,
    byId: new Map(models.map((m) => [m.id, m])),
    lastReviewed,
    overriddenModels,
    addedModels,
  };
}

/** The prices compiled into this release. */
export const BUNDLED_CATALOGUE: PricingCatalogue = makeCatalogue(MODELS, PRICING_LAST_REVIEWED);

/** Looks a model up in a specific catalogue. */
export function modelFrom(catalogue: PricingCatalogue, id: string): ModelPricing {
  const model = catalogue.byId.get(id);
  if (!model) {
    throw new Error(
      `Unknown model: "${id}". Available: ${catalogue.models.map((m) => m.id).join(', ')}`,
    );
  }
  return model;
}

/**
 * Cheapest model of a tier within a catalogue.
 *
 * Compared on the **effective** price, so a model in a promotional window is
 * ranked at what it actually costs today rather than at its list price.
 */
export function cheapestOfTierIn(
  catalogue: PricingCatalogue,
  tier: ModelPricing['tier'],
  on: Date = new Date(),
): ModelPricing {
  const candidates = catalogue.models.filter((m) => m.tier === tier);
  const first = candidates[0];
  if (!first) throw new Error(`No models for tier "${tier}"`);
  return candidates.reduce(
    (best, m) =>
      effectivePricing(m, on).inputPerMTok < effectivePricing(best, on).inputPerMTok ? m : best,
    first,
  );
}

export function getModel(id: string): ModelPricing {
  return modelFrom(BUNDLED_CATALOGUE, id);
}

export function listModels(): ModelPricing[] {
  return [...MODELS];
}

/** Effective price on a given date, applying any live promotion. */
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

/** Cheapest model of each capability tier, for recommendations. */
export function cheapestOfTier(tier: ModelPricing['tier']): ModelPricing {
  const candidates = MODELS.filter((m) => m.tier === tier);
  const first = candidates[0];
  if (!first) throw new Error(`No models for tier "${tier}"`);
  return candidates.reduce((best, m) => (m.inputPerMTok < best.inputPerMTok ? m : best), first);
}
