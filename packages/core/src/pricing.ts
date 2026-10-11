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
  /*
   * platform.claude.com/docs/en/about-claude/pricing, the models overview and
   * each model's own page, read 2026-10-10. Every existing row matched and
   * five models were added. Claude Haiku 5.5 waited for per-request pricing,
   * because it bills by prompt length, and was added with it on 2026-10-11.
   */
  anthropic: '2026-10-10',
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
   *
   * Re-read 2026-10-11 with the prompt-caching guide, the GPT-5 model page and
   * the deprecations page. GPT-5, mini and nano matched to the cent. Their
   * dated snapshots (`gpt-5-2025-08-07` and the mini and nano ones), which is
   * the id a usage log usually carries, shut down on 2026-12-11 and are now
   * declared as aliases. The current generation (gpt-6-astra, gpt-6.1-sol,
   * gpt-6-sol, gpt-6-luna and gpt-5.6 sol, terra and luna) waited for
   * per-request pricing, since each doubles its rates for prompts over 272K
   * tokens, and was added with it the same day, from each model's own page.
   */
  openai: '2026-10-11',
  /*
   * ai.google.dev/gemini-api/docs/pricing, docs/caching and the model pages,
   * read 2026-10-10. Every price matched; what changed is how caching starts
   * and what it costs on the old models. Implicit caching is on by default
   * for every Gemini 2.5 and newer model, so `caching` is 'automatic' across
   * the board; the minimums moved to 4,096 on 3.6 and 3.8 Flash and 2,048 on
   * 2.5 Flash; and the 2.5 models read the cache at 10% of input today, not
   * the 25% this table carried. Gemini 3.8 Flash was added, and Gemini 3.1
   * Pro Preview on 2026-10-11 with per-request pricing, which its prompts
   * over 200k need. 2.5 Pro's own long-context rate is named in its note.
   */
  google: '2026-10-10',
  /*
   * platform.kimi.ai/docs/pricing/chat, models and pricing/batch, read
   * 2026-10-11 in their Markdown form; the HTML renders its tables in the
   * browser, which is why the review of 2026-09-12 found no context window
   * and added nothing. Kimi K3, K2.7 Code (and its high-speed variant) and
   * K2.6 are priced now. `kimi-k2` was discontinued on 2026-05-25 by the
   * provider's own notice, so it stays priced and is no longer recommended.
   */
  moonshot: '2026-10-11',
  /*
   * api-docs.deepseek.com/quick_start/pricing read 2026-10-10, and the
   * 2026-09-10 announcement (api-docs.deepseek.com/news/news260910) read
   * 2026-10-11 for the instant: "New pricing takes effect at 04:00 UTC on
   * Sept 10, 2026." V4 Flash was retired that day and its id now bills at
   * the new deepseek-flash price, so the old price lives in its `history`.
   * V4 Pro matched the page unchanged.
   */
  deepseek: '2026-10-10',
  /*
   * docs.x.ai/developers/models, each model's page and the 2026-05-15
   * retirement notice, read 2026-10-11 in their Markdown form. Grok 4.7, 4.6,
   * 4.5, 4.3, the 4.20 family and Build 0.1 are priced, each with the rate a
   * request pays once its prompt reaches 200k tokens, which per-request
   * pricing can now express. `grok-4` was retired on 2026-05-15 and its calls
   * have billed at Grok 4.3's prices since, so it carries both periods.
   */
  xai: '2026-10-11',
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
  /*
   * Re-read 2026-10-11 from mistral.ai/cloud/inference/ and the model cards
   * at mistral.ai/news/mistral-3/, /mistral-small-4/ and
   * /vibe-remote-agents-mistral-medium-3-5/, which carry the prices in their
   * markup (`data-prices`) and bind the `-latest` ids. Every price matched.
   * What changed is caching: the inference page offers "Cached input tokens
   * -90% on input token", and every one of the three cards marks its input
   * price as carrying the cache discount. This table said Mistral had no
   * prompt caching at all. docs.mistral.ai, where a minimum or a mechanism
   * would be, is not reachable from here, so neither is claimed.
   */
  mistral: '2026-10-11',
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
 * Still exported, and still Anthropic's numbers for every model up to Opus 5
 * and Sonnet 5, but no longer the whole story even there: Claude Fable 5.1 and
 * Mythos 5.1 read the cache at 0.025x and Opus 5.5 and Sonnet 5.5 at 0.05x, so
 * a model overrides any of these through `multipliers`, and anything computing
 * a cost should go through `multipliersFor` rather than reading these
 * directly. Using one cache-read ratio for every model invents a saving.
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

export function multipliersFor(model: ModelPricing, on?: Date): {
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  batch: number | null;
} {
  // A dated question about a repriced model asks the period in force then.
  if (on !== undefined && model.history !== undefined) {
    const period = pricedAt(model, on);
    if (period !== model) return multipliersFor(period);
  }
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

/** Five minutes and an hour: Anthropic's two cache entries, and the default. */
const ANTHROPIC_TTL = Object.freeze({ writeMs: 5 * 60_000, longerMs: 60 * 60_000 });

/** How long a model's cache entries live. See `ModelPricing.cacheTtl`. */
export function cacheTtlOf(model: ModelPricing): { writeMs: number; longerMs: number | null } {
  return model.cacheTtl ?? ANTHROPIC_TTL;
}

/**
 * Mistral discounts cached input by 90% and publishes nothing else about it
 * that can be read from here: not how caching starts, not a minimum, not a
 * write price. Its usage reports no write tokens, so the write ratio of 1 is
 * never multiplied by anything; it is there so the default (Anthropic's 1.25)
 * cannot be.
 */
/** What the GPT-5 family's three rows share, from OpenAI's guide and deprecations page, read 2026-10-11. */
/** xAI's long-context band: a request whose prompt reaches 200,000 tokens, at the published higher rates. */
const GROK_LONG = (inputPerMTok: number, outputPerMTok: number): PricingTier => ({
  id: 'from-200k',
  when: { kind: 'input-tokens-at-least', tokens: 200_000 },
  inputPerMTok,
  outputPerMTok,
});

/**
 * Said on every row that caches but whose provider publishes no minimum
 * prefix. The bill still prices its cache reads and writes, which are
 * published; what goes quiet is the advice that needs the minimum to promise
 * a saving, and the reader is told why rather than handed a number from
 * nowhere. The catalogue tests hold a null minimum on a caching model to
 * carrying this sentence, so a forgotten minimum cannot pass as a deliberate one.
 */
const NO_PUBLISHED_CACHE_MINIMUM =
  'Caches automatically, but no minimum prefix length is published, so no caching advice is given for it.';

/** OpenAI's GPT-5.6 and later: one cache entry, living at least 30 minutes. */
const OPENAI_CACHE_TTL = Object.freeze({ writeMs: 30 * 60_000, longerMs: null });

const OPENAI_CURRENT_NOTE =
  'Priced per request by prompt length: over 272,000 input tokens, 2x input and cache and 1.5x output for'
  + ' the whole request. Cache writes cost 1.25x input and an entry lives at least 30 minutes.';

const OPENAI_GPT5_NOTE =
  'Caching is automatic, with no cache_control to set. OpenAI says the minimum for models before GPT-5.6 varies by'
  + ' request settings, so 1,024 here is the nearest published floor. The 2025-08-07 snapshot shuts down on'
  + ' 2026-12-11; OpenAI names the gpt-5.6 models as replacements.';

const MISTRAL_CACHE_NOTE =
  'Cached input costs 10% of the input price (mistral.ai/cloud/inference, read 2026-10-11). How caching starts and'
  + ' its minimum are not published anywhere Trazum can read, so no caching advice is given for it.';

export const MODELS: ModelPricing[] = [
  {
    /*
     * platform.claude.com/docs/en/about-claude/pricing and the Fable 5.1 model
     * page, read 2026-10-10. The same $10/$50 as Fable 5; what moved is the
     * cache read, $0.25 against $10 of input, a quarter of the 0.1x every
     * earlier Claude model pays. Writes stay at 1.25x and 2x ($12.50, $20),
     * and the Batch API halves both sides ($5/$25).
     */
    id: 'claude-fable-5-1',
    provider: 'anthropic',
    displayName: 'Claude Fable 5.1',
    inputPerMTok: 10,
    outputPerMTok: 50,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    multipliers: { cacheRead: 0.025, cacheWrite5m: 1.25, cacheWrite1h: 2, batch: 0.5 },
    capability: 'frontier',
    tier: 'frontier',
    notes: 'Cache hits cost 2.5% of the input price ($0.25). Requires 30-day data retention.',
  },
  {
    /*
     * The same page and prices as Fable 5.1, cache read included ($0.25,
     * 0.025x). Sold only to verified organisations, so priced for the logs that
     * carry it and never offered as somebody's cheaper alternative.
     */
    id: 'claude-mythos-5-1',
    provider: 'anthropic',
    displayName: 'Claude Mythos 5.1',
    recommendable: false,
    inputPerMTok: 10,
    outputPerMTok: 50,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    multipliers: { cacheRead: 0.025, cacheWrite5m: 1.25, cacheWrite1h: 2, batch: 0.5 },
    capability: 'frontier',
    tier: 'frontier',
    notes:
      'Available only to organizations verified through Anthropic\'s verification programs.'
      + ' Requires 30-day data retention.',
  },
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
    notes: 'Legacy: superseded by Claude Fable 5.1 at the same prices. Requires 30-day data retention.',
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
    notes:
      'Available only to organizations verified through Anthropic\'s verification programs.'
      + ' Requires 30-day data retention.',
  },
  {
    /*
     * The pricing page and the Opus 5.5 model page, read 2026-10-10. Cheaper
     * than Opus 5 at both ends, $4/$20, and the overview now says to start
     * there for most workloads. Cache read $0.20 is 0.05x, half the ratio of
     * every earlier Opus; writes $5 and $8 are 1.25x and 2x; batch $2/$10.
     */
    id: 'claude-opus-5-5',
    provider: 'anthropic',
    displayName: 'Claude Opus 5.5',
    inputPerMTok: 4,
    outputPerMTok: 20,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    multipliers: { cacheRead: 0.05, cacheWrite5m: 1.25, cacheWrite1h: 2, batch: 0.5 },
    capability: 'large',
    tier: 'opus',
    notes: 'Cache hits cost 5% of the input price ($0.20), against 10% on Opus 5 and earlier.',
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
    /*
     * Legacy and still served, and never carried here before, so every
     * Claude Code log from late 2025 had it as an unpriced gap. The Opus 4.5
     * model page, read 2026-10-10: model id claude-opus-4-5-20251101, alias
     * claude-opus-4-5, 200K context, $5/$25, 4,096-token cache minimum (the
     * prompt caching page). Like Haiku 4.5, the short alias is the id and the
     * dated canonical form is declared, not derived.
     */
    id: 'claude-opus-4-5',
    aliases: ['claude-opus-4-5-20251101'],
    provider: 'anthropic',
    displayName: 'Claude Opus 4.5',
    inputPerMTok: 5,
    outputPerMTok: 25,
    contextWindow: 200_000,
    cacheMinTokens: 4096,
    capability: 'large',
    tier: 'opus',
    notes: '200K context window and a 64K output cap.',
  },
  {
    /*
     * The pricing page and the Sonnet 5.5 model page, read 2026-10-10. The
     * same $2/$10 as Sonnet 5, with the cache read at $0.10, 0.05x, where
     * Sonnet 5 reads at $0.20. Writes $2.50 and $4; batch $1/$5.
     */
    id: 'claude-sonnet-5-5',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 5.5',
    inputPerMTok: 2,
    outputPerMTok: 10,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    multipliers: { cacheRead: 0.05, cacheWrite5m: 1.25, cacheWrite1h: 2, batch: 0.5 },
    capability: 'mid',
    tier: 'sonnet',
    notes: 'Cache hits cost 5% of the input price ($0.10), against 10% ($0.20) on Sonnet 5.',
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
    /*
     * The pricing page, the models overview and the prompt-caching page, read
     * 2026-10-10. Priced by prompt length, per request: $0.10/$0.50 for a
     * prompt up to 100,000 tokens and $0.50/$2.50 over it, where the length
     * counts every input token the request carried, cache reads and writes
     * included, and "each request is priced on its own". Caching is the same
     * ratio in both bands (hits $0.01 and $0.05, writes $0.125/$0.20 and
     * $0.625/$1), and so is batch ($0.05/$0.25, $0.25/$1.25). 1M context,
     * 128K output, a 512-token cache minimum.
     *
     * It waited for the change that prices a log per request. A record that
     * is one call carries its own prompt; a row out of a usage report sums
     * requests, and is billed at the over-100,000 rate unless its whole
     * prompt total is under the line, with the cheaper figure printed beside
     * it. See `PromptSize`.
     */
    id: 'claude-haiku-5-5',
    provider: 'anthropic',
    displayName: 'Claude Haiku 5.5',
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    contextWindow: 1_000_000,
    cacheMinTokens: 512,
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2, batch: 0.5 },
    tiers: [
      {
        id: 'over-100k',
        when: { kind: 'input-tokens-above', tokens: 100_000 },
        inputPerMTok: 0.5,
        outputPerMTok: 2.5,
      },
    ],
    capability: 'small',
    tier: 'haiku',
    notes:
      'Priced per request by prompt length: $0.10/$0.50 up to 100,000 input tokens, cache reads'
      + ' and writes included, and $0.50/$2.50 over it.',
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
  // Caching is AUTOMATIC, with no cache_control to set, and a cached read costs
  // a tenth of input on these three ($0.125 against $1.25). The reordering
  // advice is identical (a prefix is a prefix), the marker advice is not, which
  // is why `caching` and `multipliers` exist at all. The 1,024 minimum is the
  // one OpenAI publishes for GPT-5.6 and later; for these older models its
  // guide says the minimum "varies by request settings", so it is the nearest
  // published floor, not a promise, and each row's note says so.
  // ------------------------------------------------------------------------
  // GPT-5.6 and later: OpenAI's current generation.
  //
  // The pricing page and each model's page, read 2026-10-10 and 2026-10-11,
  // and the prompt-caching guide. Three things set them apart from GPT-5:
  //
  // - **A long-context band, per request.** "Prompts with more than 272K input
  //   tokens are priced at 2x input and cache rates and 1.5x output for the
  //   full request." 272,000, the GPT-5 era's own input limit; a tier.
  // - **Cache writes are billed**, at 1.25x the uncached input rate, and the
  //   usage object reports them (`cache_write_tokens`). Reads are 10% of input,
  //   5% on GPT-6.1 Sol.
  // - **An entry lives at least 30 minutes** after its last write or read, and
  //   there is no longer one to buy: `cacheTtl`.
  //
  // Caching is implicit by default (a breakpoint at the end of the latest
  // eligible message) from a 1,024-token minimum. Batch and Flex are half
  // price; Fast, Ultrafast and regional processing are other service tiers
  // and are not priced here. Every model: 1,050,000 context, 922,000 input at
  // most, 128,000 output.
  // ------------------------------------------------------------------------
  {
    id: 'gpt-6-astra',
    provider: 'openai',
    displayName: 'GPT-6 Astra',
    inputPerMTok: 10,
    outputPerMTok: 50,
    contextWindow: 1_050_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 1.25, batch: 0.5 },
    cacheTtl: OPENAI_CACHE_TTL,
    tiers: [
      {
        id: 'over-272k',
        when: { kind: 'input-tokens-above', tokens: 272_000 },
        inputPerMTok: 20,
        outputPerMTok: 75,
      },
    ],
    capability: 'frontier',
    tier: 'frontier',
    notes: OPENAI_CURRENT_NOTE,
  },
  {
    id: 'gpt-6.1-sol',
    provider: 'openai',
    displayName: 'GPT-6.1 Sol',
    inputPerMTok: 2,
    outputPerMTok: 10,
    contextWindow: 1_050_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.05, cacheWrite5m: 1.25, cacheWrite1h: 1.25, batch: 0.5 },
    cacheTtl: OPENAI_CACHE_TTL,
    tiers: [
      {
        id: 'over-272k',
        when: { kind: 'input-tokens-above', tokens: 272_000 },
        inputPerMTok: 4,
        outputPerMTok: 15,
      },
    ],
    capability: 'large',
    tier: 'opus',
    notes: OPENAI_CURRENT_NOTE,
  },
  {
    id: 'gpt-6-sol',
    provider: 'openai',
    displayName: 'GPT-6 Sol',
    inputPerMTok: 2,
    outputPerMTok: 10,
    contextWindow: 1_050_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 1.25, batch: 0.5 },
    cacheTtl: OPENAI_CACHE_TTL,
    tiers: [
      {
        id: 'over-272k',
        when: { kind: 'input-tokens-above', tokens: 272_000 },
        inputPerMTok: 4,
        outputPerMTok: 15,
      },
    ],
    capability: 'large',
    tier: 'opus',
    notes: OPENAI_CURRENT_NOTE,
  },
  {
    id: 'gpt-6-luna',
    provider: 'openai',
    displayName: 'GPT-6 Luna',
    inputPerMTok: 0.1,
    outputPerMTok: 0.5,
    contextWindow: 1_050_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 1.25, batch: 0.5 },
    cacheTtl: OPENAI_CACHE_TTL,
    tiers: [
      {
        id: 'over-272k',
        when: { kind: 'input-tokens-above', tokens: 272_000 },
        inputPerMTok: 0.2,
        outputPerMTok: 0.75,
      },
    ],
    capability: 'small',
    tier: 'haiku',
    notes: OPENAI_CURRENT_NOTE,
  },
  {
    id: 'gpt-5.6-sol',
    provider: 'openai',
    displayName: 'GPT-5.6 Sol',
    inputPerMTok: 4,
    outputPerMTok: 20,
    contextWindow: 1_050_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 1.25, batch: 0.5 },
    cacheTtl: OPENAI_CACHE_TTL,
    tiers: [
      {
        id: 'over-272k',
        when: { kind: 'input-tokens-above', tokens: 272_000 },
        inputPerMTok: 8,
        outputPerMTok: 30,
      },
    ],
    capability: 'large',
    tier: 'opus',
    notes: OPENAI_CURRENT_NOTE,
  },
  {
    id: 'gpt-5.6-terra',
    provider: 'openai',
    displayName: 'GPT-5.6 Terra',
    inputPerMTok: 2,
    outputPerMTok: 12,
    contextWindow: 1_050_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 1.25, batch: 0.5 },
    cacheTtl: OPENAI_CACHE_TTL,
    tiers: [
      {
        id: 'over-272k',
        when: { kind: 'input-tokens-above', tokens: 272_000 },
        inputPerMTok: 4,
        outputPerMTok: 18,
      },
    ],
    capability: 'mid',
    tier: 'sonnet',
    notes: OPENAI_CURRENT_NOTE,
  },
  {
    id: 'gpt-5.6-luna',
    provider: 'openai',
    displayName: 'GPT-5.6 Luna',
    inputPerMTok: 0.2,
    outputPerMTok: 1.2,
    contextWindow: 1_050_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 1.25, batch: 0.5 },
    cacheTtl: OPENAI_CACHE_TTL,
    tiers: [
      {
        id: 'over-272k',
        when: { kind: 'input-tokens-above', tokens: 272_000 },
        inputPerMTok: 0.4,
        outputPerMTok: 1.8,
      },
    ],
    capability: 'small',
    tier: 'haiku',
    notes: OPENAI_CURRENT_NOTE,
  },

  // ------------------------------------------------------------------------
  {
    id: 'gpt-5',
    aliases: ['gpt-5-2025-08-07'],
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
    notes: OPENAI_GPT5_NOTE,
  },
  {
    id: 'gpt-5-mini',
    aliases: ['gpt-5-mini-2025-08-07'],
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
    notes: OPENAI_GPT5_NOTE,
  },
  {
    id: 'gpt-5-nano',
    aliases: ['gpt-5-nano-2025-08-07'],
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
    notes: OPENAI_GPT5_NOTE,
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
    caching: 'automatic',
    /* $0.125 cached against $1.25 input for prompts up to 200k, read 2026-10-10. */
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    /* Refused on 2026-08-28: still in `GET /v1beta/models`, and a 404 to a request. */
    retired: {
      on: '2026-08-28',
      because:
        'This model models/gemini-2.5-pro is no longer available to new users. Please update your code to use models/gemini-3.1-pro-preview for the latest features and improvements. We recommend you to use the Interactions API.',
    },
    capability: 'large',
    tier: 'opus',
    notes:
      'Prompts over 200k tokens are billed $2.50 in and $15.00 out; this row prices every prompt at the up-to-200k rate,'
      + ' because no log Trazum prices says how long each prompt was. Implicit caching is automatic; explicit caching is'
      + ' also billed for storage per hour.',
  },
  {
    id: 'gemini-2.5-flash',
    provider: 'google',
    displayName: 'Gemini 2.5 Flash',
    inputPerMTok: 0.3,
    outputPerMTok: 2.5,
    contextWindow: 1_048_576,
    cacheMinTokens: 2048,
    caching: 'automatic',
    /* $0.03 cached against $0.30 input (text), read 2026-10-10. */
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
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
     * Google's own error message names this as the replacement for the retired
     * 2.5 Flash (the 2.5 Pro refusal names 3.1 Pro Preview), and
     * ai.google.dev/gemini-api/docs/pricing carries the rates, read 2026-08-28
     * and again on 2026-10-10.
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
    cacheMinTokens: 4096,
    caching: 'automatic',
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
      'Implicit caching is automatic above 4,096 tokens. Explicit caching is also billed for storage:'
      + ' $0.50 per 1M tokens per hour through 2026-12-31, $1.00 after.',
  },
  {
    /*
     * Gemini 3.8 Flash, from ai.google.dev/gemini-api/docs/pricing, its model
     * page and docs/caching, read 2026-10-10. The same rates and the same
     * introductory window as 3.6 Flash, published as one table each: $0.75
     * and $3.75 through 2026-12-31, $1.50 and $7.50 from 2027-01-01, and the
     * cache price scales with them ($0.075, then $0.15).
     */
    id: 'gemini-3.8-flash',
    provider: 'google',
    displayName: 'Gemini 3.8 Flash',
    inputPerMTok: 1.5,
    outputPerMTok: 7.5,
    promo: { inputPerMTok: 0.75, outputPerMTok: 3.75, until: '2026-12-31' },
    contextWindow: 1_048_576,
    cacheMinTokens: 4096,
    caching: 'automatic',
    /* $0.075 / $0.75 = 0.1 (and $0.15 / $1.50); batch $0.375 / $0.75 = 0.5 (and $1.875 / $3.75). */
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    capability: 'mid',
    tier: 'sonnet',
    notes:
      'Implicit caching is automatic above 4,096 tokens. Explicit caching is also billed for storage:'
      + ' $0.50 per 1M tokens per hour through 2026-12-31, $1.00 after.',
  },
  {
    /*
     * The pricing page, the model page and the caching page, read 2026-10-10
     * and 2026-10-11. The model Google's own refusal of 2.5 Pro names as its
     * replacement, and the second model here priced by prompt length: $2/$12
     * for a prompt up to 200,000 tokens and $4/$18 over it, the cache at
     * $0.20 and $0.40 (10% in both bands), batch $1/$6 and $2/$9 (half in
     * both). 1,048,576 tokens in, 65,536 out, implicit caching from 4,096.
     * The `-customtools` endpoint is "same as Gemini 3.1 Pro Preview pricing".
     *
     * A preview, and priced because a log carries it: Google's 2.5 Pro
     * refusal sends every caller here.
     */
    id: 'gemini-3.1-pro-preview',
    aliases: ['gemini-3.1-pro-preview-customtools'],
    provider: 'google',
    displayName: 'Gemini 3.1 Pro Preview',
    inputPerMTok: 2,
    outputPerMTok: 12,
    contextWindow: 1_048_576,
    cacheMinTokens: 4096,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    tiers: [
      {
        id: 'over-200k',
        when: { kind: 'input-tokens-above', tokens: 200_000 },
        inputPerMTok: 4,
        outputPerMTok: 18,
      },
    ],
    capability: 'large',
    tier: 'opus',
    notes:
      'Priced per request by prompt length: $2/$12 up to 200,000 input tokens and $4/$18 over it.'
      + ' Implicit caching is automatic above 4,096 tokens; explicit caching is also billed for storage,'
      + ' $4.50 per 1M tokens per hour.',
  },

  // ------------------------------------------------------------------------
  // Moonshot
  // ------------------------------------------------------------------------
  /*
   * platform.kimi.ai/docs/pricing/chat, models and pricing/batch, read in
   * their Markdown form on 2026-10-11 (the HTML renders its tables in the
   * browser, which is why the September review saw no context windows). K3
   * bills cache writes as their own line, by TTL, like Anthropic: $3.00 for a
   * 5-minute entry and $6.00 for an hour against a $3.00 input, and reads at
   * $0.30. The K2 series bills no write, and reads at its own hit price. Batch
   * is 60% of standard on K2.7 Code and K2.6 and not offered on K3 or the
   * high-speed K2.7. No cache minimum is published for any of them.
   */
  {
    id: 'kimi-k3',
    provider: 'moonshot',
    displayName: 'Kimi K3',
    inputPerMTok: 3,
    outputPerMTok: 15,
    contextWindow: 1_048_576,
    cacheMinTokens: null,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 2, batch: null },
    capability: 'frontier',
    tier: 'frontier',
    notes:
      'Cache writes are billed as their own line: 1x input for a 5-minute entry, 2x for an hour.'
      + ` No batch API for this model. ${NO_PUBLISHED_CACHE_MINIMUM}`,
  },
  {
    id: 'kimi-k2.7-code',
    provider: 'moonshot',
    displayName: 'Kimi K2.7 Code',
    inputPerMTok: 0.95,
    outputPerMTok: 4,
    contextWindow: 262_144,
    cacheMinTokens: null,
    caching: 'automatic',
    /* $0.19 on a hit against $0.95; batch $0.57 / $2.40, 60%. */
    multipliers: { cacheRead: 0.2, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.6 },
    capability: 'mid',
    tier: 'sonnet',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    id: 'kimi-k2.7-code-highspeed',
    provider: 'moonshot',
    displayName: 'Kimi K2.7 Code (high speed)',
    inputPerMTok: 1.9,
    outputPerMTok: 8,
    contextWindow: 262_144,
    cacheMinTokens: null,
    caching: 'automatic',
    /* $0.38 on a hit against $1.90; no batch API for this variant. */
    multipliers: { cacheRead: 0.2, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    capability: 'mid',
    tier: 'sonnet',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    id: 'kimi-k2.6',
    provider: 'moonshot',
    displayName: 'Kimi K2.6',
    inputPerMTok: 0.95,
    outputPerMTok: 4,
    contextWindow: 262_144,
    cacheMinTokens: null,
    caching: 'automatic',
    /* $0.16 on a hit against $0.95, written as the ratio so the product is the page's figure. */
    multipliers: { cacheRead: 0.16 / 0.95, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.6 },
    capability: 'mid',
    tier: 'sonnet',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    id: 'kimi-k2',
    provider: 'moonshot',
    displayName: 'Kimi K2',
    inputPerMTok: 0.6,
    outputPerMTok: 2.5,
    contextWindow: 256_000,
    cacheMinTokens: null,
    caching: 'automatic',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    /*
     * Discontinued: "The kimi-k2 series models were officially discontinued
     * on May 25, 2026" (the provider's model list, read 2026-10-11). Kept at
     * its last published price, because calls in somebody's log really
     * happened at it, and never offered as somewhere to move. Not `retired`,
     * which records the provider refusing a request, and no key was here to
     * send one.
     */
    recommendable: false,
    capability: 'mid',
    tier: 'sonnet',
    notes:
      'Discontinued by Moonshot on 2026-05-25; priced at the last rate it published. No batch API.'
      + ` ${NO_PUBLISHED_CACHE_MINIMUM}`,
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
     * DeepSeek V4 Flash, retired on 2026-09-10. The pricing page (read
     * 2026-10-10) says the id "is still accepted ... served by the
     * DeepSeek-V4.1-Flash model and billed at the Flash price", so from
     * 04:00 UTC that day it carries deepseek-flash's rates. Before that
     * instant it billed at its own, read off the same page on 2026-08-28:
     * $0.22/$0.66 off-peak, double at peak, $0.007 a cache hit.
     *
     * The base rate is off-peak because off-peak is the common case: peak is
     * 01:00-04:00 and 06:00-10:00 UTC on weekdays, which is 35 hours of 168.
     * The peak tier is exactly double, published as such. Clock pricing began
     * at 16:00 UTC on 2026-08-16; the flat price before it is on no page this
     * table can read, so calls before then are priced as the first period.
     *
     * Not recommendable: a legacy id DeepSeek routes "temporarily". Without
     * this, a tie on price would offer it ahead of deepseek-flash.
     */
    id: 'deepseek-v4-flash',
    provider: 'deepseek',
    displayName: 'DeepSeek V4 Flash',
    recommendable: false,
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    tiers: [
      {
        id: 'peak',
        when: { kind: 'utc-hours', hours: [1, 2, 3, 6, 7, 8, 9], weekdaysOnly: true },
        inputPerMTok: 0.3,
        outputPerMTok: 1.2,
      },
    ],
    history: [
      {
        until: '2026-09-10T04:00:00Z',
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
        /* $0.007 cache hit against $0.22 input off-peak. */
        multipliers: { cacheRead: 0.0318, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
      },
    ],
    contextWindow: 1_000_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    /* $0.003 cache hit against $0.15 input off-peak, $0.006 against $0.30 at peak. */
    multipliers: { cacheRead: 0.02, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    capability: 'mid',
    tier: 'sonnet',
    notes:
      'Retired 2026-09-10: the id is still accepted, served by V4.1 Flash and billed at the deepseek-flash price.'
      + ' Maximum output 384K tokens. Peak excludes Chinese public holidays, which this table cannot express.',
  },
  {
    /*
     * DeepSeek V4.1 Flash, from api-docs.deepseek.com/quick_start/pricing,
     * read 2026-10-10. Released 2026-09-10; its price took effect at 04:00
     * UTC that day. Off-peak is the base and peak is exactly double, as
     * published; the cache hit is 2% of input at both ($0.003 and $0.006).
     *
     * The cache minimum is carried from deepseek-v4-flash: DeepSeek's pages
     * publish none for this generation, and 1,024 is the figure the earlier
     * row was reviewed with.
     */
    id: 'deepseek-flash',
    provider: 'deepseek',
    displayName: 'DeepSeek V4.1 Flash',
    inputPerMTok: 0.15,
    outputPerMTok: 0.6,
    tiers: [
      {
        id: 'peak',
        when: { kind: 'utc-hours', hours: [1, 2, 3, 6, 7, 8, 9], weekdaysOnly: true },
        inputPerMTok: 0.3,
        outputPerMTok: 1.2,
      },
    ],
    contextWindow: 1_000_000,
    cacheMinTokens: 1024,
    caching: 'automatic',
    multipliers: { cacheRead: 0.02, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    capability: 'mid',
    tier: 'sonnet',
    notes:
      'Maximum output 384K tokens. Peak excludes Chinese public holidays, which this table cannot express:'
      + ' on a weekday holiday it charges peak where DeepSeek charges off-peak.',
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
  /*
   * docs.x.ai/developers/models and each model's page, read in their
   * Markdown form on 2026-10-11. Every text model has two rates: "requests
   * whose prompt reaches 200k tokens are billed at the higher rate for all
   * tokens in the request", which is a size tier at 200,000 inclusive and is
   * priced per request. Cached input scales with the band; writes are not
   * billed; batch is a 20% discount where the model's page offers it at all.
   * No cache minimum is published. Aliases are the stable family names the
   * pages list, never the `-latest` names, which move.
   */
  {
    id: 'grok-4.7',
    provider: 'xai',
    displayName: 'Grok 4.7',
    inputPerMTok: 2,
    outputPerMTok: 6,
    contextWindow: 500_000,
    cacheMinTokens: null,
    caching: 'automatic',
    multipliers: { cacheRead: 0.25, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    tiers: [GROK_LONG(4, 12)],
    capability: 'frontier',
    tier: 'frontier',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    id: 'grok-4.6',
    provider: 'xai',
    displayName: 'Grok 4.6',
    inputPerMTok: 2,
    outputPerMTok: 6,
    contextWindow: 500_000,
    cacheMinTokens: null,
    caching: 'automatic',
    multipliers: { cacheRead: 0.25, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    tiers: [GROK_LONG(4, 12)],
    capability: 'large',
    tier: 'opus',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    id: 'grok-4.5',
    provider: 'xai',
    displayName: 'Grok 4.5',
    inputPerMTok: 2,
    outputPerMTok: 6,
    contextWindow: 500_000,
    cacheMinTokens: null,
    caching: 'automatic',
    /* $0.30 cached against $2.00. */
    multipliers: { cacheRead: 0.15, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    tiers: [GROK_LONG(4, 12)],
    capability: 'large',
    tier: 'opus',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    id: 'grok-4.3',
    provider: 'xai',
    displayName: 'Grok 4.3',
    inputPerMTok: 1.25,
    outputPerMTok: 2.5,
    contextWindow: 1_000_000,
    cacheMinTokens: null,
    caching: 'automatic',
    /* $0.20 cached against $1.25; batch 20% off. */
    multipliers: { cacheRead: 0.16, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.8 },
    tiers: [GROK_LONG(2.5, 5)],
    capability: 'mid',
    tier: 'sonnet',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    id: 'grok-4.20-0309-reasoning',
    aliases: ['grok-4.20', 'grok-4.20-reasoning', 'grok-4.20-0309'],
    provider: 'xai',
    displayName: 'Grok 4.20 (reasoning)',
    inputPerMTok: 1.25,
    outputPerMTok: 2.5,
    contextWindow: 1_000_000,
    cacheMinTokens: null,
    caching: 'automatic',
    multipliers: { cacheRead: 0.16, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.8 },
    tiers: [GROK_LONG(2.5, 5)],
    capability: 'mid',
    tier: 'sonnet',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    id: 'grok-4.20-0309-non-reasoning',
    aliases: ['grok-4.20-non-reasoning'],
    provider: 'xai',
    displayName: 'Grok 4.20 (non-reasoning)',
    inputPerMTok: 1.25,
    outputPerMTok: 2.5,
    contextWindow: 1_000_000,
    cacheMinTokens: null,
    caching: 'automatic',
    multipliers: { cacheRead: 0.16, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.8 },
    tiers: [GROK_LONG(2.5, 5)],
    capability: 'mid',
    tier: 'sonnet',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    id: 'grok-4.20-multi-agent-0309',
    aliases: ['grok-4.20-multi-agent'],
    provider: 'xai',
    displayName: 'Grok 4.20 Multi-Agent',
    inputPerMTok: 1.25,
    outputPerMTok: 2.5,
    contextWindow: 1_000_000,
    cacheMinTokens: null,
    caching: 'automatic',
    multipliers: { cacheRead: 0.16, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.8 },
    tiers: [GROK_LONG(2.5, 5)],
    capability: 'mid',
    tier: 'sonnet',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    id: 'grok-build-0.1',
    provider: 'xai',
    displayName: 'Grok Build 0.1',
    inputPerMTok: 1,
    outputPerMTok: 2,
    contextWindow: 256_000,
    cacheMinTokens: null,
    caching: 'automatic',
    multipliers: { cacheRead: 0.2, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    tiers: [GROK_LONG(2, 4)],
    capability: 'mid',
    tier: 'sonnet',
    notes: NO_PUBLISHED_CACHE_MINIMUM,
  },
  {
    /*
     * Retired on 2026-05-15 at 12:00 PT (19:00 UTC), and billed since at
     * Grok 4.3's prices: "requests to the retired model slugs above will
     * automatically redirect to grok-4.3 ... you will be billed at grok-4.3
     * pricing" (xAI's retirement notice, read 2026-10-11). So the id has two
     * periods, and a log that spans the date is billed both ways, at the
     * instant xAI gave. `grok-4-0709` is the dated id the notice names.
     */
    id: 'grok-4',
    aliases: ['grok-4-0709'],
    provider: 'xai',
    displayName: 'Grok 4',
    inputPerMTok: 1.25,
    outputPerMTok: 2.5,
    contextWindow: 256_000,
    cacheMinTokens: null,
    caching: 'automatic',
    multipliers: { cacheRead: 0.16, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
    tiers: [GROK_LONG(2.5, 5)],
    history: [
      {
        until: '2026-05-15T19:00:00Z',
        inputPerMTok: 3,
        outputPerMTok: 15,
        multipliers: { cacheRead: 0.25, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
      },
    ],
    recommendable: false,
    capability: 'large',
    tier: 'opus',
    notes:
      'Retired by xAI on 2026-05-15 and redirected to Grok 4.3, whose price it bills at from then;'
      + ` $3/$15 before. ${NO_PUBLISHED_CACHE_MINIMUM}`,
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
    cacheMinTokens: null,
    caching: 'unknown',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    capability: 'large',
    tier: 'opus',
    notes: MISTRAL_CACHE_NOTE,
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
    cacheMinTokens: null,
    caching: 'unknown',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    capability: 'mid',
    tier: 'sonnet',
    notes: MISTRAL_CACHE_NOTE,
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
    cacheMinTokens: null,
    caching: 'unknown',
    multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: 0.5 },
    capability: 'small',
    tier: 'haiku',
    notes: MISTRAL_CACHE_NOTE,
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
  tier: {
    applied: string | null;
    decided: boolean;
    because: string;
    /**
     * The cheapest rate the undecided condition allows, present only when it
     * was not decided. The figure above is the ceiling and stays the one
     * billed; this is the other end, so a report can say how wide the
     * uncertainty is instead of only that there is some.
     */
    floor?: { inputPerMTok: number; outputPerMTok: number };
  } | null;
}

/**
 * What is known about the size of the prompt being priced.
 *
 * `inputTokens` is one request's prompt, every input token it carried, cache
 * reads and writes included, and decides a size tier outright.
 *
 * `inputTokensAtMost` is a bound, for a row that sums requests: a usage
 * report's hourly or daily bucket, an export's per-day line. No single
 * request in it can be larger than the whole row, so a row whose total is at
 * or under a threshold proves every request in it was under, and that decides
 * the tier. A row over the threshold proves nothing about any one request,
 * and the tier stays undecided. The bound is never treated as a size: a day of
 * 2,000 short prompts sums past 100,000 tokens without a single request
 * getting near it.
 */
export interface PromptSize {
  inputTokens?: number;
  inputTokensAtMost?: number;
}

const pricingMemo = new WeakMap<
  ModelPricing,
  { untilMs: number | null; promo: Rates | null; base: Rates }
>();

/**
 * The row as it stood at `on`: itself when the current price applies, or a
 * frozen copy carrying the period's rates, tiers and ratios. Built once per
 * period, so a log of a million calls does not build a million rows.
 */
const periodMemo = new WeakMap<ModelPricing, { untilMs: number; row: ModelPricing }[]>();

function pricedAt(model: ModelPricing, on: Date): ModelPricing {
  const history = model.history;
  if (history === undefined || history.length === 0) return model;
  let periods = periodMemo.get(model);
  if (periods === undefined) {
    periods = history.map((period) => {
      const { history: _history, promo: _promo, tiers: _tiers, multipliers: _multipliers, ...rest } = model;
      const row: ModelPricing = Object.freeze({
        ...rest,
        inputPerMTok: period.inputPerMTok,
        outputPerMTok: period.outputPerMTok,
        ...(period.tiers !== undefined ? { tiers: period.tiers } : {}),
        ...(period.multipliers !== undefined
          ? { multipliers: period.multipliers }
          : model.multipliers !== undefined
            ? { multipliers: model.multipliers }
            : {}),
      });
      return { untilMs: new Date(period.until).getTime(), row };
    });
    periodMemo.set(model, periods);
  }
  const at = on.getTime();
  for (const period of periods) if (at < period.untilMs) return period.row;
  return model;
}

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
function holds(when: TierCondition, on: Date, size: PromptSize): boolean | null {
  if (when.kind === 'utc-hours') {
    const day = on.getUTCDay();
    if (when.weekdaysOnly && (day === 0 || day === 6)) return false;
    return when.hours.includes(on.getUTCHours());
  }
  const over = (tokens: number): boolean =>
    when.kind === 'input-tokens-at-least' ? tokens >= when.tokens : tokens > when.tokens;
  if (size.inputTokens !== undefined) return over(size.inputTokens);
  // A whole row under the line puts every request in it under the line.
  if (size.inputTokensAtMost !== undefined && !over(size.inputTokensAtMost)) return false;
  return null;
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
  context: PromptSize = {},
): Rates {
  /* A call before a published price change is priced as it was billed then. */
  if (model.history !== undefined) {
    const period = pricedAt(model, on);
    if (period !== model) return effectivePricing(period, on, context);
  }
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
      const verdict = holds(tier.when, on, context);
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
    /*
     * And the cheapest, which is the base: every undecided condition might not
     * hold, and a tier is never below the base (`pricing-tiers.test.js`).
     */
    const floor = { inputPerMTok: model.inputPerMTok, outputPerMTok: model.outputPerMTok };
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
        because:
          context.inputTokensAtMost !== undefined
            ? `${describe(dearest.when)}, and this row sums requests without giving any one prompt's length`
            : `${describe(dearest.when)}, and the token count was not given`,
        floor,
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
  if (when.kind === 'input-tokens-at-least') {
    return `prompts of ${when.tokens.toLocaleString('en-US')} input tokens or more`;
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
