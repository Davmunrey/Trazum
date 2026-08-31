import type { ModelPricing, PricingTier, TierCondition } from './types.js';

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
  /*
   * developers.openai.com/api/docs/pricing, read 2026-08-31.
   *
   * `platform.openai.com/docs/pricing` now 301s there, which is worth writing
   * down: the old address is what every note about this catalogue cited, and a
   * reviewer who stops at the redirect reads nothing.
   *
   * The page publishes four tables for the same model — standard, batch, flex
   * and priority. The standard one is the catalogue's, identified by the other
   * three being its multiples (0.5x, 0.5x, 2x) rather than by trusting the
   * order they appear in.
   */
  openai: '2026-08-31',
  /* ai.google.dev/gemini-api/docs/pricing, read 2026-08-28. */
  google: '2026-08-28',
  moonshot: '2026-06-24',
  /* api-docs.deepseek.com/quick_start/pricing, read 2026-08-28. */
  deepseek: '2026-08-28',
  xai: '2026-06-24',
  /*
   * `mistral.ai/pricing`, read 2026-08-28 — by a human, because the page
   * renders its table in the browser and serves a fetch only an FAQ example
   * with no model id attached.
   *
   * This date stayed at 2026-06-24 for a few hours after the other two moved,
   * which is the point of having one per provider: looking and finding nothing
   * servable is not the same as checking, and moving the date then would have
   * said it was.
   */
  mistral: '2026-08-28',
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
    /* Refused on 2026-08-28: still in `GET /v1beta/models`, and a 404 to a request. */
    retired: {
      on: '2026-08-28',
      because:
        'This model models/gemini-2.5-pro is no longer available to new users. Please update your code to use models/gemini-3.1-pro-preview for the latest features and improvements. We recommend you to use the Interactions API.',
    },
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
    /* Refused on 2026-08-28: still in `GET /v1beta/models`, and a 404 to a request. */
    retired: {
      on: '2026-08-28',
      because:
        'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features and improvements. We recommend you to use the Interactions API.',
    },
    capability: 'mid',
    tier: 'sonnet',
  },

  {
    /*
     * Google's own error message names this as the replacement for the two
     * retired 2.5 models, and ai.google.dev/gemini-api/docs/pricing carries the
     * rates, read 2026-08-28.
     *
     * The introductory price has a published end date and a published successor,
     * which is exactly what `promo` is for and is the shape the catalogue nearly
     * shipped Sonnet 5 wrong on: on 2027-01-01 every figure here doubles with no
     * code change, and `pricing-review.test.js` fails before that arrives.
     */
    id: 'gemini-3.6-flash',
    provider: 'google',
    displayName: 'Gemini 3.6 Flash',
    inputPerMTok: 1.5,
    outputPerMTok: 7.5,
    promo: { inputPerMTok: 0.75, outputPerMTok: 3.75, until: '2026-12-31' },
    contextWindow: 1_048_576,
    cacheMinTokens: 1024,
    caching: 'explicit',
    /*
     * $0.075 against $0.75 inside the introductory window, and $0.15 against
     * $1.50 after it: Google scales the cache price with the headline one, so
     * a single ratio is right on both sides of 2027-01-01 and the multiplier
     * does not need a date of its own.
     */
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    capability: 'mid',
    tier: 'sonnet',
    notes:
      'Context caching is billed for storage per hour as well as per read:'
      + ' $0.50 per 1M tokens per hour through 2026-12-31, $1.00 after.',
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
    /* Refused on 2026-08-28: the id itself is rejected, and the error names the survivors. */
    retired: {
      on: '2026-08-28',
      because:
        'The supported API model names are deepseek-v4-pro, deepseek-v4-flash, and deepseek-v4-flash-vision-exp, but you passed deepseek-v3.',
    },
    capability: 'mid',
    tier: 'sonnet',
  },
  {
    /*
     * DeepSeek V4 Flash, from api-docs.deepseek.com/quick_start/pricing, read
     * 2026-08-28. It replaced `deepseek-v3`, which the API now refuses.
     *
     * The base rate is off-peak because off-peak is the common case: peak is
     * 01:00-04:00 and 06:00-10:00 UTC on weekdays, which is 35 hours of 168.
     * The peak tier is exactly double, published as such.
     */
    id: 'deepseek-v4-flash',
    provider: 'deepseek',
    displayName: 'DeepSeek V4 Flash',
    inputPerMTok: 0.22,
    outputPerMTok: 0.66,
    tiers: [
      {
        id: 'peak',
        when: { kind: 'utc-hours', hours: [1, 2, 3, 6, 7, 8, 9], weekdaysOnly: true },
        inputPerMTok: 0.44,
        outputPerMTok: 1.32,
      },
    ],
    contextWindow: 1_000_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    /* $0.007 cache hit against $0.22 input off-peak. */
    multipliers: { cacheRead: 0.0318, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    capability: 'mid',
    tier: 'sonnet',
    notes: 'Maximum output 384K tokens.',
  },
  {
    /* Same page, same clock. Pro is three times Flash at both ends. */
    id: 'deepseek-v4-pro',
    provider: 'deepseek',
    displayName: 'DeepSeek V4 Pro',
    inputPerMTok: 0.66,
    outputPerMTok: 1.98,
    tiers: [
      {
        id: 'peak',
        when: { kind: 'utc-hours', hours: [1, 2, 3, 6, 7, 8, 9], weekdaysOnly: true },
        inputPerMTok: 1.32,
        outputPerMTok: 3.96,
      },
    ],
    contextWindow: 1_000_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    /* $0.022 cache hit against $0.66 input off-peak. */
    multipliers: { cacheRead: 0.0333, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    capability: 'large',
    tier: 'opus',
    notes: 'Maximum output 384K tokens.',
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
    /* Refused on 2026-08-28: the id itself is rejected. */
    retired: {
      on: '2026-08-28',
      because:
        'Invalid model: mistral-large-2',
    },
    capability: 'large',
    tier: 'opus',
    notes: 'No prompt caching: reordering still helps readability but saves nothing here.',
  },
  {
    /*
     * Mistral Large 3, the replacement for the refused `mistral-large-2`.
     *
     * **Read by a human from `mistral.ai/pricing` on 2026-08-28, and that is the
     * provenance.** The page renders its table in the browser, so a fetch sees
     * only an FAQ example with no model id attached: this repository looked,
     * found nothing servable, left the model unpriced and said so, and the table
     * was then read off the page and handed over. A price is a reading of the
     * provider's page; who did the reading is a fact about the reading, not a
     * reason to accept a worse source.
     *
     * The identity is measured rather than inferred. `GET /v1/models` declares
     * `mistral-large-latest` and `mistral-large-2512` as aliases of each other,
     * both reporting the name `mistral-large-2512` and a 262,144 context, so the
     * dated id is what a usage log carries and the moving pointer is the alias.
     */
    id: 'mistral-large-2512',
    aliases: ['mistral-large-latest'],
    provider: 'mistral',
    displayName: 'Mistral Large 3',
    inputPerMTok: 0.5,
    outputPerMTok: 1.5,
    contextWindow: 262_144,
    cacheMinTokens: 0,
    caching: 'none',
    multipliers: { batch: 0.5 },
    capability: 'large',
    tier: 'opus',
    notes: 'No prompt caching: reordering still helps readability but saves nothing here.',
  },
  {
    /*
     * Same page, same day, same reading.
     *
     * **This provider's ladder is not monotonic in price, and that is not a
     * typo.** Medium 3.5 costs three times Large 3 on input and five times on
     * output, because Mistral positions Large as the open-weight flagship and
     * Medium as the model for long-horizon agentic work. `capability` follows
     * the vendor's own description rather than the price, which is what the
     * field means; the consequence is that a step down from `large` to `mid`
     * here is dearer, and `levers.ts` simply does not offer a route whose saving
     * is not above zero. Nothing to fix, and worth saying so before somebody
     * "corrects" the ladder into producing a saving that does not exist.
     */
    id: 'mistral-medium-2604',
    aliases: ['mistral-medium-latest', 'mistral-medium-3-5'],
    provider: 'mistral',
    displayName: 'Mistral Medium 3.5',
    inputPerMTok: 1.5,
    outputPerMTok: 7.5,
    contextWindow: 262_144,
    cacheMinTokens: 0,
    caching: 'none',
    multipliers: { batch: 0.5 },
    capability: 'mid',
    tier: 'sonnet',
  },
  {
    /* Same page, same day. `mistral-small-2603` is what the API reports. */
    id: 'mistral-small-2603',
    aliases: ['mistral-small-latest'],
    provider: 'mistral',
    displayName: 'Mistral Small 4',
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    contextWindow: 262_144,
    cacheMinTokens: 0,
    caching: 'none',
    multipliers: { batch: 0.5 },
    capability: 'small',
    tier: 'haiku',
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

/**
 * Whether this model may be offered to a reader as something to move to.
 *
 * One home for a two-part rule that used to be written in four places as one
 * part. `recommendable: false` — a private programme, a waitlist — was honoured
 * at every one of them. `retired` is the stronger statement: the provider
 * answered a real request for the id with an error, so a switch to it is not a
 * worse recommendation, it is one that cannot be carried out at all.
 *
 * Written as a function rather than as a second `&&` at four call sites,
 * because the fifth call site is always the one that gets written with only the
 * first half. `pricing.test.js` fails a source file that filters on
 * `recommendable` without coming through here, and that guard was proved by
 * planting exactly that filter.
 *
 * Pricing is a separate question and stays answered: a retired model keeps its
 * price, because a log full of its calls records money that was really spent.
 */
export function isOffered(model: ModelPricing): boolean {
  return model.recommendable !== false && model.retired === undefined;
}

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
      isOffered(m) &&
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
interface Rates {
  inputPerMTok: number;
  outputPerMTok: number;
  promoApplied: boolean;
  tier: { applied: string | null; decided: boolean; because: string } | null;
}

const pricingMemo = new WeakMap<
  ModelPricing,
  { untilMs: number | null; promo: Rates | null; base: Rates }
>();

/** The two unconditional answers for one model, parsed once. */
function cache(model: ModelPricing): {
  untilMs: number | null;
  promo: Rates | null;
  base: Rates;
} {
  const entry = {
    untilMs: model.promo ? new Date(`${model.promo.until}T23:59:59.999Z`).getTime() : null,
    promo: model.promo
      ? Object.freeze({
          inputPerMTok: model.promo.inputPerMTok,
          outputPerMTok: model.promo.outputPerMTok,
          promoApplied: true,
          tier: null,
        })
      : null,
    base: Object.freeze({
      inputPerMTok: model.inputPerMTok,
      outputPerMTok: model.outputPerMTok,
      promoApplied: false,
      tier: null,
    }),
  };
  pricingMemo.set(model, entry);
  return entry;
}

/**
 * Whether one condition holds, for a call at `on` of `inputTokens` tokens.
 *
 * Returns `null` rather than `false` when the condition cannot be decided,
 * because "this does not apply" and "nobody said" lead to different reports and
 * collapsing them is the oldest mistake in this repository.
 */
function holds(
  when: TierCondition,
  on: Date,
  inputTokens: number | undefined,
): boolean | null {
  if (when.kind === 'utc-hours') {
    const day = on.getUTCDay();
    if (when.weekdaysOnly && (day === 0 || day === 6)) return false;
    return when.hours.includes(on.getUTCHours());
  }
  if (inputTokens === undefined) return null;
  return inputTokens > when.tokens;
}

/**
 * What one call is billed at, and what decided it.
 *
 * `tier` is the field this grew for, and it carries three states rather than
 * two. A model with no tiers gets `null`. A model whose condition could be
 * evaluated gets the tier that applied, or the base rate with `applied: null`
 * and `decided: true`. A model whose condition could **not** be evaluated —
 * a size tier priced without a token count — gets `decided: false`, the
 * **dearer** of the candidate rates, and `because` naming what would settle it.
 *
 * The dearer one is not a shrug. A cost figure that is a ceiling can prove
 * "under budget" and can never surprise a bill; a floor chosen for looking
 * better is the flattering direction this product spends its time refusing.
 * The reader still has to be told, which is what `decided: false` is for, and
 * `pricing.test.js` fails a tiered model whose report drops it.
 */
export function effectivePricing(
  model: ModelPricing,
  on: Date = new Date(),
  context: { inputTokens?: number } = {},
): Rates {
  const memo = pricingMemo.get(model) ?? cache(model);

  /**
   * Tiers first, and a promotion never runs on top of one.
   *
   * No provider here does both, and combining them would be this repository
   * inventing a price out of two real ones — the composed figure the first rule
   * in the doctrine is about. A model that grew both would fail the guard in
   * `pricing.test.js` rather than quietly getting a multiplied rate.
   */
  if (model.tiers !== undefined && model.tiers.length > 0) {
    const undecided: PricingTier[] = [];
    for (const tier of model.tiers) {
      const verdict = holds(tier.when, on, context.inputTokens);
      if (verdict === true) {
        return {
          inputPerMTok: tier.inputPerMTok,
          outputPerMTok: tier.outputPerMTok,
          promoApplied: false,
          tier: { applied: tier.id, decided: true, because: describe(tier.when) },
        };
      }
      if (verdict === null) undecided.push(tier);
    }

    if (undecided.length === 0) {
      return {
        ...memo.base,
        tier: { applied: null, decided: true, because: 'no conditional rate applies' },
      };
    }

    /* The dearest candidate, so the figure is a ceiling rather than a wish. */
    const dearest = undecided.reduce((worst, tier) =>
      tier.inputPerMTok > worst.inputPerMTok ? tier : worst,
    );
    const ceiling =
      dearest.inputPerMTok > model.inputPerMTok
        ? {
            inputPerMTok: dearest.inputPerMTok,
            outputPerMTok: dearest.outputPerMTok,
            applied: dearest.id,
          }
        : {
            inputPerMTok: model.inputPerMTok,
            outputPerMTok: model.outputPerMTok,
            applied: null,
          };
    return {
      inputPerMTok: ceiling.inputPerMTok,
      outputPerMTok: ceiling.outputPerMTok,
      promoApplied: false,
      tier: {
        applied: ceiling.applied,
        decided: false,
        because: `${describe(dearest.when)}, and the token count was not given`,
      },
    };
  }

  if (memo.untilMs !== null && on.getTime() <= memo.untilMs) return memo.promo!;
  return memo.base;
}

/** One condition as a sentence a reader can check against a provider's page. */
function describe(when: TierCondition): string {
  if (when.kind === 'input-tokens-above') {
    return `prompts over ${when.tokens.toLocaleString('en-US')} input tokens`;
  }
  const windows = [];
  let start = null;
  const sorted = [...when.hours].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (start === null) start = sorted[i]!;
    if (sorted[i]! + 1 !== sorted[i + 1]) {
      windows.push(`${String(start).padStart(2, '0')}:00-${String(sorted[i]! + 1).padStart(2, '0')}:00`);
      start = null;
    }
  }
  return `${windows.join(' and ')} UTC${when.weekdaysOnly ? ', Monday to Friday' : ''}`;
}

/**
 * The date the prices behind one report were reviewed.
 *
 * ## The sentence this exists to make true
 *
 * `PRICING_LAST_REVIEWED` is the **oldest** provider's date, which is the right
 * answer to *how old is this table* and the wrong answer to *how old are the
 * prices in front of me*. Every surface that warns about staleness was using
 * it, and the warning says, in these words, that the table behind **every
 * dollar here** was last reviewed on that date.
 *
 * On 2026-08-31 that sentence was false on a report of Claude and OpenAI
 * calls. It named 2026-06-24 — the date belonging to two models that appear in
 * no such report and whose providers stopped listing them — while the prices
 * actually used had been read four days and zero days earlier. A warning that
 * fires on every run is one people stop reading, and a provenance that does
 * not hold is the one thing this tool exists not to print.
 *
 * `trazum models` had already worked this out and prints the dates per
 * provider, with the reason in a comment. The fix reached one surface and not
 * the three that qualify a figure.
 *
 * ## What it returns, and the direction it errs in
 *
 * The oldest review date among the providers that actually priced these
 * models. Where that cannot be established it returns the catalogue's own
 * `lastReviewed`, which is the **conservative** direction: reporting a fresher
 * date for a report containing a price of unknown provenance would be claiming
 * provenance this table does not have.
 *
 * It cannot be established in three cases, all of which fall back:
 *
 * - **An overlay is in effect.** `--pricing` and `--pricing-live` replace
 *   prices with numbers whose provenance is the overlay's own date, and
 *   `PROVIDER_REVIEWED` describes the bundled table rather than theirs.
 * - **A model the catalogue does not carry**, or one carrying no provider: a
 *   price with no page behind it.
 * - **A provider with no recorded review date.**
 *
 * The fallback is inside this function rather than at each call site on
 * purpose. `isOffered` records why: the fifth call site is always the one
 * written with only the first half of a two-part rule.
 */
export function reviewedForModels(
  models: Iterable<string>,
  catalogue: PricingCatalogue,
): string {
  /* An overlay's prices are not this table's, so this table's dates say
     nothing about them. */
  if (catalogue.lastReviewed !== PRICING_LAST_REVIEWED) return catalogue.lastReviewed;

  let oldest: string | null = null;
  for (const id of models) {
    const model = catalogue.models.find((m) => m.id === id);
    if (model?.provider === undefined) return catalogue.lastReviewed;
    const date = PROVIDER_REVIEWED[model.provider];
    if (date === undefined) return catalogue.lastReviewed;
    if (oldest === null || date < oldest) oldest = date;
  }
  /* Nothing priced: there is no report-specific answer, so the table's own
     date stands rather than an absence being read as freshness. */
  return oldest ?? catalogue.lastReviewed;
}

/** Cheapest model of each capability tier, for recommendations. */
export function cheapestOfTier(tier: ModelPricing['tier']): ModelPricing {
  const candidates = MODELS.filter((m) => m.tier === tier && isOffered(m));
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
