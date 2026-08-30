/** Public types of @trazum/core. */

import type { RuleChange } from './changes.js';
import type { Locale, RuleId } from './i18n/types.js';
import type { PricingCatalogue } from './pricing.js';

/** How aggressive the deterministic rules are allowed to be. */
/**
 * The levels an optimisation runs at, from the one place that defines them.
 *
 * Exported as a value, not only as a type. `@trazum/core` had the union and no
 * list, so the valid set was not discoverable from the package and a caller
 * reaching for a plausible third name — `balanced` — got no answer from the
 * types at runtime and no error either.
 */
export const RULE_LEVELS = ['safe', 'aggressive'] as const;

export type RuleLevel = (typeof RULE_LEVELS)[number];

/**
 * A deterministic rule applied to the mutable text of a prompt.
 *
 * The rule carries no copy of its own: its title and rationale live in the
 * locale catalogues, keyed by `id`. That is what lets the same rule report
 * itself in any language.
 */
export interface Rule {
  id: RuleId;
  level: RuleLevel;
  /** Returns the transformed text and how many times the rule applied. */
  apply(text: string): { text: string; hits: number };
}

/** A rule after it has run, with its copy already resolved for a locale. */
export interface RuleResult {
  id: RuleId;
  title: string;
  rationale: string;
  level: RuleLevel;
  hits: number;
  /** Tokens saved attributable to this rule (estimated). */
  tokensSaved: number;
  /**
   * A sample of what this rule actually changed, so an aggressive run can be
   * reviewed rule by rule. Capped — `hits` carries the true total — and empty
   * when the change was too large to summarise usefully.
   */
  changes: RuleChange[];
}

/** Severity of an advisory: the higher it is, the more money is usually at stake. */
export type AdvisorySeverity = 'info' | 'opportunity' | 'warning';

/** Every advisory the core can emit. */
export type AdvisoryId =
  | 'context-overflow'
  | 'context-near-limit'
  | 'prompt-caching'
  | 'prompt-caching-not-worth-it'
  | 'below-cache-minimum'
  | 'cache-prefix-reorder'
  | 'batch-api'
  | 'model-downgrade'
  | 'tier-signals-conflict'
  | 'output-dominated'
  | 'promo-pricing'
  | 'model-retired'
  | 'contradictory-instructions'
  | 'redundant-examples'
  | 'restated-output-format'
  | 'movable-output-schema';

/** A recommendation that does NOT modify the prompt, only informs. */
export interface Advisory {
  id: AdvisoryId;
  severity: AdvisorySeverity;
  title: string;
  detail: string;
  /** Estimated monthly saving in USD if applied. `null` when not quantifiable. */
  estimatedMonthlyUsd: number | null;
}

/** Price of a model, in USD per million tokens. */
/**
 * How a provider prices caching and batching.
 *
 * These were global constants until models from other providers arrived, and
 * being global made them quietly wrong: a cache read costs about 10% of the
 * input price on Anthropic and about 50% on OpenAI. One number for both would
 * have overstated an OpenAI caching saving fivefold — an invented saving, which
 * is the one thing this tool must never print.
 *
 * Every field is optional and falls back to the Anthropic values, so a model
 * added without them prices exactly as it did before.
 */
export interface CostMultipliers {
  /** Cache read as a fraction of the input price. */
  cacheRead?: number;
  /** Cache write with the short TTL, as a multiple of the input price. */
  cacheWrite5m?: number;
  /** Cache write with the long TTL, where the provider offers one. */
  cacheWrite1h?: number;
  /**
   * Batch discount, or `null` where the provider has no batch API. `null` and
   * `undefined` mean different things here: "there is no batch API" versus
   * "nobody has said", and only the first should stop the advisory firing.
   */
  batch?: number | null;
}

/**
 * How prompt caching is turned on.
 *
 * The advice to move stable content into the prefix is the same everywhere,
 * because prefix caching is prefix caching. What differs is whether you have to
 * ask for it: telling an OpenAI user to "set cache_control" names a parameter
 * that does not exist for them.
 */
export type CachingMode =
  /** The caller marks the prefix, e.g. Anthropic's `cache_control`. */
  | 'explicit'
  /** The provider caches long-enough prefixes with no marker. */
  | 'automatic'
  /** No prompt caching at all. */
  | 'none'
  /**
   * Nobody here knows, and saying so beats guessing.
   *
   * A catalogue can now be built from a live source — OpenRouter publishes
   * price and context window for hundreds of models — and that source publishes
   * neither whether a model caches nor the minimum prefix it caches at. Both
   * halves of the caching advisory need those, and that advisory is the largest
   * saving Trazum reports.
   *
   * The two wrong answers are symmetrical. Assume caching works and Trazum
   * offers a saving that cannot be bought at any price, which is the Mistral
   * bug in a new costume. Assume it does not and Trazum hides the biggest
   * saving there is. So: `unknown` fires nothing and the report says the
   * catalogue does not know, which is a fact the reader can act on.
   */
  | 'unknown';

/**
 * Capability, without a vendor's ladder in the name.
 *
 * `tier` used Anthropic's own names as the generic axis, which reads as nonsense
 * the moment the model is not Anthropic's — telling somebody on Kimi that their
 * task "looks like haiku complexity" is a label that means something other than
 * what it says.
 */
export type Capability = 'small' | 'mid' | 'large' | 'frontier' | 'unknown';

/**
 * What makes a conditional rate apply, as data a machine can evaluate.
 *
 * Deliberately a closed union rather than a predicate function. A catalogue
 * entry is reviewed the way a price is reviewed, and a reviewer can check
 * "peak is 01:00-04:00 and 06:00-10:00 UTC on weekdays" against a provider's
 * page; nobody can review a closure. It also means the condition survives
 * `JSON.stringify`, which matters because the catalogue can be overlaid from a
 * file.
 */
export type TierCondition =
  /**
   * The prompt is larger than `tokens` input tokens.
   *
   * Decidable only where the token count is known, which is most of the places
   * that price a specific call and none of the places that merely rank models.
   * `effectivePricing` says which happened rather than guessing.
   */
  | { kind: 'input-tokens-above'; tokens: number }
  /**
   * The call falls inside one of `hours` in UTC, optionally on weekdays only.
   *
   * Decidable everywhere, because every caller already passes the date it is
   * pricing for. `hours` lists the hour each window *starts*, so 01:00-04:00
   * is `[1, 2, 3]` and not `[1, 4]`: an endpoint convention is the kind of
   * thing two readers disagree about silently.
   */
  | { kind: 'utc-hours'; hours: number[]; weekdaysOnly: boolean };

/**
 * A rate that applies when its condition holds.
 *
 * Deliberately carries no multipliers of its own, and the first draft did. The
 * reasoning for adding them was that DeepSeek halves the cache-hit price at
 * off-peak along with everything else, so a cache read priced off the base
 * would be wrong about the money — which is true of the *price* and false of
 * the *ratio*: $0.007 against $0.22 and $0.014 against $0.44 are the same
 * 3.18% to the last digit, on both models. Multiplying a tier's own input rate
 * by the model's multiplier already gives the right answer.
 *
 * It was removed because the guard written to prove it mattered could not: with
 * the tier multiplier equal to the base one, dropping it changed nothing and
 * the test passed either way. An option nothing can distinguish from its
 * absence is a claim nobody checks, which is worse than not having it.
 */
export interface PricingTier {
  /** Short, stable, and printed: a reader has to be able to see which applied. */
  id: string;
  when: TierCondition;
  inputPerMTok: number;
  outputPerMTok: number;
}

export interface ModelPricing {
  id: string;
  displayName: string;
  /** Who sells it. Used to group the model list and to explain caching. */
  provider?: string;
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
  /** Context window in tokens. */
  contextWindow: number;
  /**
   * Minimum tokens before prompt caching actually caches.
   *
   * `null` when the catalogue does not know — see `CachingMode.unknown`. A
   * number here is a claim about a specific provider's behaviour, and a live
   * price feed is not a source for it.
   */
  cacheMinTokens: number | null;
  /** How caching is enabled. Defaults to `explicit`. */
  caching?: CachingMode;
  /** Provider-specific cache and batch pricing. Defaults to Anthropic's. */
  multipliers?: CostMultipliers;
  /**
   * Whether to offer this model as a cheaper alternative.
   *
   * Defaults to true. A model behind a private programme or a waitlist is real
   * and worth pricing, but recommending a switch to something the reader cannot
   * buy is advice that wastes their time.
   */
  recommendable?: boolean;
  /**
   * Set when the provider refused a real request for this id.
   *
   * A retired model keeps its price and loses its future. Both halves matter:
   * a log full of `deepseek-v3` calls records money that was genuinely spent,
   * so deleting the row would make somebody's own history unpriceable — and a
   * *new* call on that id will not happen at all, so quoting it as an option is
   * a number for a question nobody can ask.
   *
   * `on` is the day `scripts/check-model-availability.mjs` was refused, and
   * `because` is the provider's own sentence, quoted rather than paraphrased.
   * Neither is a judgement, and neither implies anything about what the
   * replacement costs: that is a price, and a price comes off the provider's
   * own page or not at all.
   *
   * A retired model is never recommended, never offered as a cheaper
   * alternative and never chosen as a tier's representative, in the same places
   * `recommendable: false` is honoured — this is a stronger statement than that
   * one and must not be weaker in effect.
   */
  retired?: {
    /** ISO date the refusal was recorded. */
    on: string;
    /** What the provider answered, in the provider's words. */
    because: string;
  };
  /** Capability, on a vendor-neutral scale. */
  capability: Capability;
  /**
   * @deprecated Use `capability`. Anthropic's ladder used as a generic axis
   * stopped making sense once other providers were priced. Kept in step with
   * `capability` for the whole of 1.x and removed in 2.0 — see VERSIONING.md.
   */
  tier: 'haiku' | 'sonnet' | 'opus' | 'frontier' | 'unknown';
  /** Promotional pricing, when one is running. */
  promo?: {
    inputPerMTok: number;
    outputPerMTok: number;
    /** ISO date (inclusive) the promotional price applies until. */
    until: string;
  };
  /**
   * Rates that apply only under a stated condition.
   *
   * The catalogue held one input price and one output price per model until a
   * real credential was pointed at the providers and two of them turned out not
   * to charge that way:
   *
   * - **DeepSeek V4 bills by the clock.** Peak is 01:00-04:00 and 06:00-10:00
   *   UTC, Monday to Friday, and off-peak is exactly half. That is 35 hours of
   *   168, so the common case is the cheap one and a single number would have
   *   been wrong by 2x in whichever direction it was chosen.
   * - **Gemini 3.1 Pro bills by prompt size**, $2/$12 up to 200k input tokens
   *   and $4/$18 above it.
   *
   * Both are *conditions*, so both are written as data rather than as prose in
   * `notes`: a note is something a reader has to apply by hand, and this
   * product exists to stop people doing arithmetic by hand.
   *
   * The base `inputPerMTok` and `outputPerMTok` stay the rate that applies when
   * no condition matches, which keeps every model that has no tiers unchanged
   * and keeps this field optional in effect as well as in the type.
   */
  tiers?: PricingTier[];
  /**
   * Other ids that bill at exactly this rate.
   *
   * A provider's canonical id is often the dated snapshot
   * (`claude-haiku-4-5-20251001`) while the catalogue lists the short form
   * a person recognises, so a real usage log arrives full of ids the
   * catalogue does not hold and the report has to leave those calls out of
   * its totals. An alias closes that, and it is **declared one line at a
   * time, never derived**: a rule that stripped anything resembling a date
   * would be a machine guessing that two ids bill alike, which is the one
   * guess this product does not make. Every entry here is a statement,
   * reviewed the way a price is reviewed.
   */
  aliases?: string[];
  /** Notes relevant to cost calculation. */
  notes?: string;
}

/** Usage scenario used to turn token savings into money. */
export interface UsageProfile {
  /** Model the cost is computed against. */
  model: string;
  /** Calls per month using this prompt. */
  callsPerMonth: number;
  /** Average output tokens per call. */
  avgOutputTokens: number;
  /**
   * Fraction of calls that would reuse the cached prefix (0-1).
   * Only used by the prompt caching advisory.
   */
  cacheHitRate: number;
  /** If the work tolerates latency, the Batch API costs half. */
  batchEligible: boolean;
}

/** Itemised cost of a scenario. */
export interface CostBreakdown {
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
}

/** Before/after cost comparison. */
export interface SavingsReport {
  model: string;
  modelDisplayName: string;
  /** Whether a promotional price is currently being applied. */
  promoApplied: boolean;
  perCall: { before: CostBreakdown; after: CostBreakdown };
  perMonth: { before: CostBreakdown; after: CostBreakdown };
  monthlySavingsUsd: number;
  /** Percentage saved against the total monthly cost (0-100). */
  monthlySavingsPct: number;
}

/** A slice of the prompt: protected slices are never modified. */
export interface Segment {
  kind: 'mutable' | 'protected';
  /** What kind of protected content this is (for diagnostics). */
  protection?: ProtectionKind;
  text: string;
}

export type ProtectionKind =
  | 'fenced-code'
  | 'indented-code'
  | 'inline-code'
  | 'url'
  | 'email'
  | 'placeholder'
  | 'xml-tag';

/** Optimisation options. */
export interface OptimizeOptions {
  /** `safe` (the default) only applies rules with no semantic risk. */
  level?: RuleLevel;
  /** Rule ids to disable. */
  disableRules?: RuleId[];
  /** Usage profile used to quantify the saving. */
  usage?: Partial<UsageProfile>;
  /** Alternative token counter (e.g. the real token-counting API). */
  tokenCounter?: TokenCounter;
  /** Language of the report. Defaults to English. */
  locale?: Locale;
  /**
   * Prices to work from. Defaults to the catalogue bundled with this release.
   *
   * Build one with `applyPricingOverlay` when a published price has moved: a
   * stale price is a wrong number in a budget decision, and correcting it should
   * not require a library upgrade.
   */
  pricing?: PricingCatalogue;
}

/** Counts tokens in a text. Synchronous so it can run inside the rule loop. */
export type TokenCounter = (text: string) => number;

/** Full result of an optimisation. */
/** Which counter produced a figure, named rather than left as *external*. */
export interface TokenProvenance {
  /**
   * A stable identifier for the counter, not a sentence.
   *
   * `anthropic-count-tokens` for the official endpoint,
   * `openai-tiktoken` for the local rank tables. A consumer branches on this;
   * `detail` is what a person reads.
   */
  counter: string;
  /** The model the count was made for, since an encoding is a property of one. */
  model: string;
  /**
   * What a reader needs to know about this particular count -- the encoding, or
   * the endpoint. Free text, and never the only place a fact lives.
   */
  detail: string;
  /**
   * Whether the count came from this machine or from a request.
   *
   * The one distinction a privacy-conscious reader actually cares about: a
   * local counter read the prompt in this process, a remote one sent it
   * somewhere. Both are `external` to the heuristic, and only one leaves.
   */
  where: 'local' | 'remote';
}

export interface OptimizationResult {
  original: string;
  optimized: string;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  /** Percentage reduction of input tokens (0-100). */
  reductionPct: number;
  rules: RuleResult[];
  advisories: Advisory[];
  savings: SavingsReport;
  usage: UsageProfile;
  /** Locale the report was rendered in. */
  locale: Locale;
  /** How tokens were counted, so the caller knows the margin of error. */
  tokenSource: 'heuristic' | 'external';
  /**
   * Which counter produced the figures, when it was not the heuristic.
   *
   * `tokenSource` says *not the estimator*, which is the question a margin of
   * error depends on. It does not say **whose** counter, and once more than one
   * external counter exists that difference matters: a count from Anthropic's
   * endpoint and a count from OpenAI's rank tables are both `external` and are
   * not interchangeable, and a reader repricing one workload against another
   * model needs to know which they are holding.
   *
   * `null` when `tokenSource` is `heuristic`, so the two fields cannot drift
   * into disagreeing about whether anything external was used at all.
   */
  countedBy: TokenProvenance | null;
  /**
   * Where the prices came from.
   *
   * Reported rather than assumed: once prices can be overlaid locally, a figure
   * from the bundled catalogue and a figure from somebody's JSON file look
   * identical, and a reader has to be able to tell which they are reading.
   */
  pricingSource: {
    lastReviewed: string;
    /** Bundled prices an overlay replaced. Empty when none did. */
    overriddenModels: string[];
    /** Models an overlay introduced. Empty when none did. */
    addedModels: string[];
  };
  /** Present only when an LLM pass ran. */
  llm?: LlmRefinement;
}

/** Result of the optional LLM pass. */
export interface LlmRefinement {
  applied: boolean;
  /** Why it was not applied, when `applied` is false. */
  rejectedReason?: string;
  provider: string;
  model: string;
  candidate: string;
  tokensBefore: number;
  tokensAfter: number;
}

/** Pluggable LLM provider: this is where your own model plugs in. */
export interface LlmProvider {
  /** Human-readable name, shown in the report. */
  name: string;
  /** Identifier of the model used. */
  model: string;
  complete(input: { system: string; user: string }): Promise<string>;
}

export type { Locale, RuleId };
