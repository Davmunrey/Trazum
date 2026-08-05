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
  tokens: number;
  modelName: string;
  contextWindow: number;
}

export interface PromptCachingParams {
  /** First template placeholder, or `null` when the prompt has none. */
  placeholder: string | null;
  prefixTokens: number;
  totalTokens: number;
  minTokens: number;
  modelName: string;
  /** Cache hit rate as a whole percentage. */
  hitRatePct: number;
}

export interface BelowCacheMinimumParams {
  modelName: string;
  minTokens: number;
  placeholder: string | null;
  prefixTokens: number;
  totalTokens: number;
  /** Whether to point at Claude Opus 5's lower 512-token minimum. */
  mentionLowerMinimum: boolean;
}

export interface CachePrefixReorderParams {
  staticTokensAfter: number;
  sharePct: number;
  placeholder: string;
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

/** Reasons the optional LLM pass can reject a candidate. */
export interface LlmMessages {
  emptyResponse(): string;
  protectedContentAltered(count: number): string;
  notShorter(after: number, before: number): string;
  suspiciousShrink(retainedPct: number): string;
}

/** Everything the core needs to speak one language. */
export interface CoreMessages {
  locale: Locale;
  /** BCP 47 tag used for number formatting (e.g. `en-US`). */
  numberLocale: string;
  rules: Record<RuleId, RuleCopy>;
  llm: LlmMessages;
  advisories: {
    contextOverflow(p: ContextOverflowParams): LocalizedMessage;
    promptCaching(p: PromptCachingParams): LocalizedMessage;
    promptCachingNotWorthIt(): LocalizedMessage;
    belowCacheMinimum(p: BelowCacheMinimumParams): LocalizedMessage;
    cachePrefixReorder(p: CachePrefixReorderParams): LocalizedMessage;
    batchApi(): LocalizedMessage;
    modelDowngrade(p: ModelDowngradeParams): LocalizedMessage;
    outputDominated(p: OutputDominatedParams): LocalizedMessage;
    promoPricing(p: PromoPricingParams): LocalizedMessage;
    contradictoryInstructions(p: ContradictoryInstructionsParams): LocalizedMessage;
    redundantExamples(p: RedundantExamplesParams): LocalizedMessage;
  };
  /** Names of the axes two instructions can disagree on. */
  contradictionAxes: Record<ContradictionAxisId, string>;
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
