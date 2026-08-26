/**
 * Internationalisation contract for the core.
 *
 * Every user-facing string the core produces lives in a locale catalogue
 * instead of being hardcoded next to the logic. Adding a locale means adding
 * one file — it never means touching the rules engine or the pricing model.
 */

/** Locales shipped with Trazum. English is the source of truth. */
export const LOCALES = ['en', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Identifier of every deterministic rule.
 *
 * Declared as a union rather than `string` on purpose: adding a rule fails to
 * compile until every locale catalogue describes it, so a new rule can never
 * ship with a missing translation.
 */
export type RuleId =
  | 'duplicate-blocks'
  | 'near-duplicate-blocks'
  | 'duplicate-lines'
  | 'verbose-phrases'
  | 'politeness'
  | 'filler'
  | 'hedges'
  | 'intensifiers'
  | 'self-check'
  | 'emphasis'
  | 'decoration'
  | 'whitespace';

/** A headline plus its explanation, both already translated. */
export interface LocalizedMessage {
  title: string;
  detail: string;
}

export interface RuleCopy {
  title: string;
  /** What the rule does and why it is safe at its level. */
  rationale: string;
}

// --------------------------------------------------------------------------
// Advisory parameters
// --------------------------------------------------------------------------

export interface ContextOverflowParams {
  /**
   * The count is an estimate and its band reaches back under the window, so
   * "the call will fail" is a prediction rather than a fact.
   *
   * Also true, unconditionally, when the band was never measured against this
   * model's tokenizer: there is then no margin to be past.
   */
  uncertain: boolean;
  /**
   * Whether the published error band describes this model's family.
   *
   * False for every family but the one it was measured on, and the message has
   * to change in two ways when it is: it may not present the estimate's margin
   * as known, and it may not send the reader to a counting endpoint that counts
   * a different tokenizer.
   */
  bandApplies: boolean;
  tokens: number;
  modelName: string;
  contextWindow: number;
}

export interface ContextNearLimitParams {
  tokens: number;
  modelName: string;
  contextWindow: number;
  /** See `ContextOverflowParams.bandApplies`. */
  bandApplies: boolean;
}

export interface PromptCachingParams {
  /** First template placeholder, or `null` when the prompt has none. */
  placeholder: string | null;
  prefixTokens: number;
  /**
   * The prefix is an estimate and the band reaches below the minimum, so the
   * saving may not be collectable at all.
   *
   * The mirror of `BelowCacheMinimumParams.couldReachMinimum`, and the asymmetry
   * was a real gap: that one hedged an estimate landing just *under* a hard
   * threshold, while this one promised money on an estimate landing just *over*
   * it. With a ±10% band an estimated 528-token prefix can truly be 475, in which
   * case nothing caches and the figure beside this advisory is uncollectable.
   *
   * The cautionary direction matters more than the encouraging one, because this
   * is the side with a dollar sign attached.
   */
  nearMinimum: boolean;
  totalTokens: number;
  minTokens: number;
  modelName: string;
  /** Cache hit rate as a whole percentage. */
  hitRatePct: number;
  /** Cache read price as a percentage of the input price, for this provider. */
  readPct: number;
  /** Cache write price as a percentage of the input price, for this provider. */
  writePct: number;
  /**
   * Whether the caller has to mark the prefix.
   *
   * Telling somebody on OpenAI to "set cache_control" names a parameter that
   * does not exist for them: their caching is automatic above a threshold. The
   * advice to move stable content forward is identical either way — a prefix is
   * a prefix — but the instruction that follows it is not.
   */
  explicit: boolean;
}

export interface BelowCacheMinimumParams {
  modelName: string;
  minTokens: number;
  placeholder: string | null;
  prefixTokens: number;
  totalTokens: number;
  /** Whether to point at Claude Opus 5's lower 512-token minimum. */
  mentionLowerMinimum: boolean;
  /**
   * The prefix is *estimated* and close enough to the minimum that the real
   * count could be above it.
   *
   * Without this the advisory asserts "caching will not work here" from a number
   * measured to ±10%, and on a prefix near the threshold that is not an imprecise
   * figure — it is wrong advice, and it costs the reader the largest saving
   * Trazum offers.
   */
  couldReachMinimum: boolean;
}

export interface CachePrefixReorderParams {
  staticTokensAfter: number;
  sharePct: number;
  placeholder: string;
  /** The command that attempts it, because Trazum can do this itself. */
  command: string;
}

export interface ModelDowngradeParams {
  modelName: string;
  tier: string;
  candidateName: string;
  currentUsd: string;
  candidateUsd: string;
}

export interface OutputDominatedParams {
  outputUsd: string;
  inputUsd: string;
}

export interface PromoPricingParams {
  modelName: string;
  promoInput: number;
  promoOutput: number;
  until: string;
  listInput: number;
  listOutput: number;
}

export interface ContradictoryInstructionsParams {
  /** Human-readable name of the axis the two instructions disagree on. */
  axis: string;
  firstValue: string;
  firstSnippet: string;
  secondValue: string;
  secondSnippet: string;
  /** How many other axes also disagree, beyond this one. */
  otherCount: number;
}

export interface RedundantExamplesParams {
  redundantCount: number;
  totalCount: number;
  redundantTokens: number;
  /** Similarity of the closest pair, 0-100. */
  topSimilarityPct: number;
}

export interface MovableSchemaParams {
  /** How many cued schema blocks were found. */
  blocks: number;
  /** Tokens they hold, fences included. */
  tokens: number;
  /** The keys, already formatted for prose. */
  keyList: string;
  /** The phrase that identified the block as an output contract. */
  cue: string;
}

export interface RestatedOutputFormatParams {
  restatedCount: number;
  totalCount: number;
  restatedTokens: number;
  /** The restated field names, already formatted for display. */
  keyList: string;
}

/** Reasons the optional LLM pass can reject a candidate. */
export interface LlmMessages {
  emptyResponse(): string;
  protectedContentAltered(count: number): string;
  notShorter(after: number, before: number): string;
  suspiciousShrink(retainedPct: number): string;
}

/**
 * What the caching-does-not-pay advisory needs to state a threshold that is
 * true about **this** model.
 *
 * It used to take nothing and print one sentence for every model: *"a cache
 * write costs 125% of the input price and a read costs 10%. Below roughly a 28%
 * hit rate you pay more than you save."* Two of those three numbers were the
 * Anthropic multipliers stated as universal, and the third was not derivable
 * from any model in the catalogue: at 125% and 10% the break-even is 21.74%,
 * not 28%.
 *
 * The multipliers were already in hand at the call site and already passed to
 * the advisory next door. Only this message invented its own.
 */
export interface PromptCachingNotWorthItParams {
  /** The model's cache read multiplier as a percentage of the input price. */
  readPct: number;
  /** Its 5-minute cache write multiplier, likewise. */
  writePct: number;
  /**
   * The hit rate at which caching stops costing money, derived rather than
   * quoted: `(1 - write) / (read - write)`.
   *
   * `null` when the write multiplier is 1, which is not a smaller threshold but
   * a different situation: writing costs exactly what not caching costs, so
   * caching can never lose money and there is no rate below which it does. Eight
   * of the eighteen models in the catalogue are that shape, and the old sentence
   * told all eight to consider turning caching off.
   */
  breakEvenPct: number | null;
}

/**
 * What the tier heuristic saw when it declined to answer.
 *
 * Both counts, because "three of each" and "one of each" are different degrees
 * of the same refusal and the reader can act on the difference.
 */
export interface TierSignalsConflictParams {
  complexSignals: number;
  simpleSignals: number;
}

/** Why a proposed rewrite did not survive checking against the prompt. */
export interface SuggestMessages {
  'not-found'(): string;
  'touches-protected'(): string;
  'introduces-protected'(): string;
  'no-saving'(): string;
  overlaps(): string;
}

/** Everything the core needs to speak one language. */
export interface CoreMessages {
  locale: Locale;
  /** BCP 47 tag used for number formatting (e.g. `en-US`). */
  numberLocale: string;
  rules: Record<RuleId, RuleCopy>;
  llm: LlmMessages;
  suggest: SuggestMessages;
  advisories: {
    contextOverflow(p: ContextOverflowParams): LocalizedMessage;
    contextNearLimit(p: ContextNearLimitParams): LocalizedMessage;
    promptCaching(p: PromptCachingParams): LocalizedMessage;
    promptCachingNotWorthIt(p: PromptCachingNotWorthItParams): LocalizedMessage;
    belowCacheMinimum(p: BelowCacheMinimumParams): LocalizedMessage;
    cachePrefixReorder(p: CachePrefixReorderParams): LocalizedMessage;
    batchApi(): LocalizedMessage;
    modelDowngrade(p: ModelDowngradeParams): LocalizedMessage;
    tierSignalsConflict(p: TierSignalsConflictParams): LocalizedMessage;
    outputDominated(p: OutputDominatedParams): LocalizedMessage;
    promoPricing(p: PromoPricingParams): LocalizedMessage;
    contradictoryInstructions(p: ContradictoryInstructionsParams): LocalizedMessage;
    redundantExamples(p: RedundantExamplesParams): LocalizedMessage;
    restatedOutputFormat(p: RestatedOutputFormatParams): LocalizedMessage;
    movableSchema(p: MovableSchemaParams): LocalizedMessage;
  };
  /** Names of the axes two instructions can disagree on. */
  contradictionAxes: Record<ContradictionAxisId, string>;
  /** Names of each end of those axes, as they read inside the advisory. */
  contradictionValues: Record<ContradictionValueId, string>;
}

/**
 * Kept in step with `ContradictionAxis` in `structure.ts`. Declared here so a
 * new axis fails to compile until every catalogue names it.
 */
export type ContradictionAxisId =
  | 'response-language'
  | 'output-format'
  | 'response-length'
  | 'reasoning-visibility';

/**
 * The two ends of each axis. Identifiers rather than prose for the same reason
 * the axes are: the advisory names both sides in its sentence, so leaving them
 * as English strings in the detector would print English inside a Spanish
 * report.
 */
export type ContradictionValueId =
  | 'fixed-language'
  | 'mirror-language'
  | 'format-json'
  | 'format-markdown'
  | 'format-plain-text'
  | 'length-brief'
  | 'length-detailed'
  | 'reasoning-shown'
  | 'reasoning-hidden';
