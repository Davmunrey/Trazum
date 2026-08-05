/** Public types of @trazum/core. */

import type { Locale, RuleId } from './i18n/types.js';

/** How aggressive the deterministic rules are allowed to be. */
export type RuleLevel = 'safe' | 'aggressive';

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
}

/** Severity of an advisory: the higher it is, the more money is usually at stake. */
export type AdvisorySeverity = 'info' | 'opportunity' | 'warning';

/** Every advisory the core can emit. */
export type AdvisoryId =
  | 'context-overflow'
  | 'prompt-caching'
  | 'prompt-caching-not-worth-it'
  | 'below-cache-minimum'
  | 'cache-prefix-reorder'
  | 'batch-api'
  | 'model-downgrade'
  | 'output-dominated'
  | 'promo-pricing'
  | 'contradictory-instructions'
  | 'redundant-examples'
  | 'restated-output-format';

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
export interface ModelPricing {
  id: string;
  displayName: string;
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
  /** Context window in tokens. */
  contextWindow: number;
  /** Minimum tokens before prompt caching actually caches. */
  cacheMinTokens: number;
  /** Capability tier, used to recommend a model. */
  tier: 'haiku' | 'sonnet' | 'opus' | 'frontier';
  /** Promotional pricing, when one is running. */
  promo?: {
    inputPerMTok: number;
    outputPerMTok: number;
    /** ISO date (inclusive) the promotional price applies until. */
    until: string;
  };
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
  | 'inline-code'
  | 'url'
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
}

/** Counts tokens in a text. Synchronous so it can run inside the rule loop. */
export type TokenCounter = (text: string) => number;

/** Full result of an optimisation. */
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
