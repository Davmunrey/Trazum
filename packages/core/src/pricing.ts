import type { ModelPricing } from './types.js';

/**
 * Model and pricing catalogue (USD per million tokens).
 *
 * Source: official Claude API documentation. Prices change: check
 * `PRICING_LAST_REVIEWED` and update this file before making budget decisions.
 * Amazon Bedrock and Vertex AI pricing is set by each partner and is NOT the
 * pricing in this table.
 */
/**
 * When each provider's prices were last checked against that provider's own
 * published table.
 *
 * One date for the whole catalogue was the wrong shape, and it cost a real
 * error. Seven providers publish independently and are checked independently;
 * a single date forces a partial review to either overstate itself by moving
 * the date for everyone, or throw itself away by leaving it. What happened is
 * the second: this constant was written on 2026-08-04 already reading
 * 2026-06-24, and never moved again.
 *
 * Meanwhile Anthropic cancelled the increase that was going to take Sonnet 5
 * from its 2/10 introductory price to 3/15 on 2026-09-01, and made 2/10
 * standard. The catalogue still carried the promotion with its end date, so on
 * 2026-09-01 every Sonnet 5 figure this tool printed would have risen 50% with
 * no code change and no way for a reader to tell. A price nobody charges is
 * the one error this product cannot make, and it was four days out on a timer.
 *
 * So: a date per provider, checked against that provider's own page, and the
 * catalogue's headline date derived as the oldest of them rather than typed.
 */
export const PROVIDER_REVIEWED: Readonly<Record<string, string>> = Object.freeze({
  /* platform.claude.com/docs/en/about-claude/pricing, read 2026-08-27. */
  anthropic: '2026-08-27',
  openai: '2026-06-24',
  google: '2026-06-24',
  moonshot: '2026-06-24',
  deepseek: '2026-06-24',
  xai: '2026-06-24',
  mistral: '2026-06-24',
});

/**
 * The catalogue's age is its oldest provider's, because a reader asking how
 * old this table is wants the answer for the worst part of it, not the best.
 */
export const PRICING_LAST_REVIEWED: string = Object.values(PROVIDER_REVIEWED).reduce(
  (oldest, date) => (date < oldest ? date : oldest),
);

/** Cost multipliers relative to the input price. */
/**
 * The defaults, which are Anthropic's numbers.
 *
 * Still exported and still correct for every Anthropic model, but no longer the
 * whole story: a model can override any of these through `multipliers`, and
 * anything computing a cost should go through `multipliersFor` rather than
 * reading these directly. A cache read is ~10% of input on Anthropic and ~50%
 * on OpenAI, and using one number for both invents a saving.
 */
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

/**
 * The multipliers that apply to one model, defaults filled in.
 *
 * `batch` stays `null` when the provider has no batch API, which is different
 * from "unspecified": the first should stop the advisory firing, the second
 * should fall back to the default.
 */
/** Memoised for the same reason as `effectivePricing`: once per record. */
const multipliersMemo = new WeakMap<
  ModelPricing,
  { cacheWrite5m: number; cacheWrite1h: number; cacheRead: number; batch: number | null }
>();

export function multipliersFor(model: ModelPricing): {
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  batch: number | null;
} {
  const cached = multipliersMemo.get(model);
  if (cached !== undefined) return cached;
  const m = model.multipliers ?? {};
  const result = Object.freeze({
    cacheWrite5m: m.cacheWrite5m ?? COST_MULTIPLIERS.cacheWrite5m,
    cacheWrite1h: m.cacheWrite1h ?? COST_MULTIPLIERS.cacheWrite1h,
    cacheRead: m.cacheRead ?? COST_MULTIPLIERS.cacheRead,
    batch: m.batch === undefined ? COST_MULTIPLIERS.batch : m.batch,
  });
  multipliersMemo.set(model, result);
  return result;
}

export const MODELS: ModelPricing[] = [
  {
    id: 'claude-fable-5',
    provider: 'anthropic',
    displayName: 'Claude Fable 5',
    inputPerMTok: 10,
    outputPerMTok: 50,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    capability: 'frontier',
    tier: 'frontier',
    notes: 'Highest capability. Requires 30-day data retention.',
  },
  {
    id: 'claude-mythos-5',
    provider: 'anthropic',
    displayName: 'Claude Mythos 5',
    recommendable: false,
    inputPerMTok: 10,
    outputPerMTok: 50,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    capability: 'frontier',
    tier: 'frontier',
    notes: 'Available only through Project Glasswing.',
  },
  {
    id: 'claude-opus-5',
    provider: 'anthropic',
    displayName: 'Claude Opus 5',
    inputPerMTok: 5,
    outputPerMTok: 25,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    capability: 'large',
    tier: 'opus',
    notes: '512-token cache minimum: caches prompts that would miss on Opus 4.6.',
  },
  {
    id: 'claude-opus-4-8',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.8',
    inputPerMTok: 5,
    outputPerMTok: 25,
    contextWindow: 1_000_000,
    cacheMinTokens: 1024,
    capability: 'large',
    tier: 'opus',
  },
  {
    id: 'claude-opus-4-7',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.7',
    inputPerMTok: 5,
    outputPerMTok: 25,
    contextWindow: 1_000_000,
    cacheMinTokens: 2048,
    capability: 'large',
    tier: 'opus',
  },
  {
    id: 'claude-opus-4-6',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.6',
    inputPerMTok: 5,
    outputPerMTok: 25,
    contextWindow: 1_000_000,
    cacheMinTokens: 4096,
    capability: 'large',
    tier: 'opus',
  },
  {
    id: 'claude-sonnet-5',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 5',
    inputPerMTok: 2,
    outputPerMTok: 10,
    contextWindow: 1_000_000,
    cacheMinTokens: 1024,
    capability: 'mid',
    tier: 'sonnet',
    notes:
      'Launched with 2/10 as introductory pricing through 2026-08-31; the scheduled'
      + ' increase to 3/15 on 2026-09-01 was cancelled and 2/10 is the standard price.',
  },
  {
    id: 'claude-sonnet-4-6',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.6',
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 1_000_000,
    cacheMinTokens: 1024,
    capability: 'mid',
    tier: 'sonnet',
  },
  {
    id: 'claude-haiku-4-5',
    // The dated form is the canonical API id and is what a real usage log
    // carries; the short id above is the alias people recognise. Declared,
    // not derived: see `aliases` in types.ts.
    aliases: ['claude-haiku-4-5-20251001'],
    provider: 'anthropic',
    displayName: 'Claude Haiku 4.5',
    inputPerMTok: 1,
    outputPerMTok: 5,
    contextWindow: 200_000,
    cacheMinTokens: 4096,
    capability: 'small',
    tier: 'haiku',
    notes: '200K context window and a 64K output cap, smaller than the rest.',
  },

  // ------------------------------------------------------------------------
  // OpenAI
  //
  // Caching is AUTOMATIC above 1,024 tokens — there is no cache_control to set,
  // and a cached read costs about half the input price rather than a tenth. The
  // reordering advice is identical (a prefix is a prefix), the marker advice is
  // not, which is why `caching` and `multipliers` exist at all.
  // ------------------------------------------------------------------------
  {
    id: 'gpt-5',
    provider: 'openai',
    displayName: 'GPT-5',
    inputPerMTok: 1.25,
    outputPerMTok: 10,
    contextWindow: 400_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    capability: 'frontier',
    tier: 'frontier',
    notes: 'Caching is automatic above 1,024 tokens; there is no cache_control to set.',
  },
  {
    id: 'gpt-5-mini',
    provider: 'openai',
    displayName: 'GPT-5 mini',
    inputPerMTok: 0.25,
    outputPerMTok: 2,
    contextWindow: 400_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    capability: 'mid',
    tier: 'sonnet',
  },
  {
    id: 'gpt-5-nano',
    provider: 'openai',
    displayName: 'GPT-5 nano',
    inputPerMTok: 0.05,
    outputPerMTok: 0.4,
    contextWindow: 400_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    capability: 'small',
    tier: 'haiku',
  },

  // ------------------------------------------------------------------------
  // Google
  // ------------------------------------------------------------------------
  {
    id: 'gemini-2.5-pro',
    provider: 'google',
    displayName: 'Gemini 2.5 Pro',
    inputPerMTok: 1.25,
    outputPerMTok: 10,
    contextWindow: 1_048_576,
    cacheMinTokens: 2048,
    caching: 'explicit',
    multipliers: { cacheRead: 0.25, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    capability: 'large',
    tier: 'opus',
    notes: 'Context caching is billed for storage per hour as well as per read.',
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'google',
    displayName: 'Gemini 2.5 Flash',
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
    contextWindow: 1_048_576,
    cacheMinTokens: 1024,
    caching: 'explicit',
    multipliers: { cacheRead: 0.25, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    capability: 'mid',
    tier: 'sonnet',
  },

  // ------------------------------------------------------------------------
  // Moonshot
  // ------------------------------------------------------------------------
  {
    id: 'kimi-k2',
    provider: 'moonshot',
    displayName: 'Kimi K2',
    inputPerMTok: 0.6,
    outputPerMTok: 2.5,
    contextWindow: 256_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    capability: 'mid',
    tier: 'sonnet',
    notes: 'No batch API: the batch advisory stays quiet rather than offering a discount you cannot buy.',
  },

  // ------------------------------------------------------------------------
  // DeepSeek
  // ------------------------------------------------------------------------
  {
    id: 'deepseek-v3',
    provider: 'deepseek',
    displayName: 'DeepSeek V3',
    inputPerMTok: 0.27,
    outputPerMTok: 1.1,
    contextWindow: 128_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    capability: 'mid',
    tier: 'sonnet',
  },

  // ------------------------------------------------------------------------
  // xAI
  // ------------------------------------------------------------------------
  {
    id: 'grok-4',
    provider: 'xai',
    displayName: 'Grok 4',
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 256_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.25, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    capability: 'large',
    tier: 'opus',
  },

  // ------------------------------------------------------------------------
  // Mistral
  // ------------------------------------------------------------------------
  {
    id: 'mistral-large-2',
    provider: 'mistral',
    displayName: 'Mistral Large 2',
    inputPerMTok: 2,
    outputPerMTok: 6,
    contextWindow: 128_000,
    cacheMinTokens: 0,
    caching: 'none',
    multipliers: { batch: 0.5 },
    capability: 'large',
    tier: 'opus',
    notes: 'No prompt caching: reordering still helps readability but saves nothing here.',
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

/**
 * The one index every catalogue is looked up through.
 *
 * Exported, and the only builder, because there used to be two: this one
 * learned about `aliases` in 1.77.0 and the overlay's did not, so a dated
 * model id priced fine until somebody passed `--pricing-live` and then
 * eight calls quietly left the totals. Two builders means one of them is
 * always the one nobody updated.
 *
 * Aliases are written first and ids last, so a real id always wins over a
 * declared alias that collides with it.
 */
export function indexModels(models: ModelPricing[]): Map<string, ModelPricing> {
  return new Map([
    ...models.flatMap((m) => (m.aliases ?? []).map((alias) => [alias, m] as const)),
    ...models.map((m) => [m.id, m] as const),
  ]);
}

function makeCatalogue(
  models: ModelPricing[],
  lastReviewed: string,
  overriddenModels: string[] = [],
  addedModels: string[] = [],
): PricingCatalogue {
  return {
    models,
    byId: indexModels(models),
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
  /**
   * Restrict to one provider. Omit to search the whole catalogue, which is what
   * this did before other providers existed — kept as the default so the
   * signature stays additive, though the advisory always passes one: switching
   * vendor is a migration, not a cheaper model.
   */
  provider?: string,
): ModelPricing {
  const candidates = catalogue.models.filter(
    (m) =>
      m.tier === tier &&
      m.recommendable !== false &&
      (provider === undefined || m.provider === provider),
  );
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
/**
 * Memoised per model, because this runs once per record when a usage log is
 * priced: a 200k-line profile called it 200k times, and the `new Date(...)`
 * parse of the promo's end date alone was 0.7 of the 2.4 seconds the whole
 * profile took — measured with --cpu-prof, not guessed. The cache keys on
 * the model object (a WeakMap, so an overlay's models are collected with
 * the overlay) and stores the parsed end-of-promo instant plus the two
 * possible answers; `on` still decides which answer applies on every call,
 * so behaviour is unchanged to the millisecond.
 */
const pricingMemo = new WeakMap<
  ModelPricing,
  {
    untilMs: number | null;
    promo: { inputPerMTok: number; outputPerMTok: number; promoApplied: boolean } | null;
    base: { inputPerMTok: number; outputPerMTok: number; promoApplied: boolean };
  }
>();

export function effectivePricing(
  model: ModelPricing,
  on: Date = new Date(),
): { inputPerMTok: number; outputPerMTok: number; promoApplied: boolean } {
  let memo = pricingMemo.get(model);
  if (memo === undefined) {
    memo = {
      untilMs: model.promo ? new Date(`${model.promo.until}T23:59:59.999Z`).getTime() : null,
      promo: model.promo
        ? {
            inputPerMTok: model.promo.inputPerMTok,
            outputPerMTok: model.promo.outputPerMTok,
            promoApplied: true,
          }
        : null,
      base: Object.freeze({
        inputPerMTok: model.inputPerMTok,
        outputPerMTok: model.outputPerMTok,
        promoApplied: false,
      }),
    };
    if (memo.promo) Object.freeze(memo.promo);
    pricingMemo.set(model, memo);
  }
  if (memo.untilMs !== null && on.getTime() <= memo.untilMs) return memo.promo!;
  return memo.base;
}

/** Cheapest model of each capability tier, for recommendations. */
export function cheapestOfTier(tier: ModelPricing['tier']): ModelPricing {
  const candidates = MODELS.filter((m) => m.tier === tier && m.recommendable !== false);
  const first = candidates[0];
  if (!first) throw new Error(`No models for tier "${tier}"`);
  return candidates.reduce((best, m) => (m.inputPerMTok < best.inputPerMTok ? m : best), first);
}

/**
 * Whole days between a `YYYY-MM-DD` review date and now, or `null`.
 *
 * Every dollar figure Trazum prints descends from a price list, and the list
 * carries the date it was checked. Printing only that date makes the reader do
 * arithmetic against today to learn the one thing they wanted to know — whether
 * to trust it — and a reader who is not already suspicious will not bother.
 *
 * `now` is a parameter for the reason `computeSavings` takes a `Date`: a function
 * that reads the clock can only be asserted for shape.
 *
 * Compared at UTC midnight on both sides, so the answer does not change by one
 * depending on what time of day the command runs. `null` for anything that is not
 * a date — an overlay supplies this string, and a wrong one should read as
 * unknown rather than as a confident number computed from `NaN`.
 */
/**
 * The age at which this product stops treating its own price table as current.
 *
 * Three surfaces warn a reader that the figures above may be off — `profile`,
 * the MCP report, the browser's bill — and each of them had typed `45` into
 * its own comparison, with four locale sentences stating it again in prose.
 * Seven copies of one claim, and nothing that would notice when they
 * disagreed; the sentence a reader sees names the number, so a drift between
 * them would have been a surface telling the reader one threshold and applying
 * another.
 *
 * The value is what those surfaces already published, not a new judgement.
 */
export const STALE_PRICING_DAYS = 45;

export function reviewAgeDays(lastReviewed: string, now: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastReviewed)) return null;
  const then = Date.parse(`${lastReviewed}T00:00:00Z`);
  if (Number.isNaN(then)) return null;

  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((today - then) / 86_400_000);
  // A future date is a typo or a clock problem, not an age. Reported as unknown
  // rather than as a negative number of days, which reads like a bug either way.
  return days < 0 ? null : days;
}
