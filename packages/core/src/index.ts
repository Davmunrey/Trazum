export * from './types.js';
export { estimateTokens, countTokensAnthropic } from './tokenizer.js';
export { countSentences, profilePrompt } from './profile.js';
export { PHRASE_LANGUAGES } from './phrases.js';
export { toPromptfoo } from './promptfoo.js';
export { toOtlpMetrics } from './otlp.js';
export type { OtlpAttribute, OtlpDataPoint, OtlpInput, OtlpMetric, OtlpPayload } from './otlp.js';
export type { PromptfooExport, PromptfooOptions, PromptfooWarning } from './promptfoo.js';
export type { ProfileOptions, PromptProfile } from './profile.js';
export { SUGGEST_SYSTEM_PROMPT, applyRewrites, rejectionText, suggestRewrites } from './suggest.js';
export type {
  RejectedReason,
  RewriteSuggestion,
  SuggestOptions,
  SuggestResult,
} from './suggest.js';
export type { AsyncTokenCounter, AnthropicCounterOptions } from './tokenizer.js';
export {
  MODELS,
  DEFAULT_MODEL,
  COST_MULTIPLIERS,
  PRICING_LAST_REVIEWED,
  reviewAgeDays,
  BUNDLED_CATALOGUE,
  getModel,
  listModels,
  effectivePricing,
  cheapestOfTier,
  modelFrom,
  cheapestOfTierIn,
  multipliersFor,
} from './pricing.js';
export type { PricingCatalogue } from './pricing.js';
export type { CachingMode, Capability, CostMultipliers } from './types.js';

// Local price corrections, so a price change needs no library upgrade.
export {
  MAX_PRICING_BYTES,
  PRICING_MODEL_KEYS,
  PRICING_OVERLAY_KEYS,
  PricingOverlayError,
  applyPricingOverlay,
  catalogueFromOverlay,
  parsePricingOverlay,
} from './pricing-overlay.js';
export type { PricingOverlay } from './pricing-overlay.js';
export { openrouterOverlay } from './openrouter.js';
export type { OpenRouterResult } from './openrouter.js';
export { RULES, getRule } from './rules.js';
export { segment, join, protectedTexts } from './segment.js';
export { computeSavings, costOfCall, formatUsd, formatSignedUsd } from './savings.js';
export { buildAdvisories, recommendTier } from './advisories.js';
export type { AdvisoryOptions } from './advisories.js';
export { analyzeCachePrefix } from './cache.js';

// Rearranging a prompt so its stable instructions sit in the cacheable prefix.
// The largest saving Trazum knows about, and the most dangerous transformation
// here — see reorder.ts for what it refuses to move and why.
export { reorderForCache } from './reorder.js';
export type {
  DeclinedBlock,
  ReorderOptions,
  ReorderResult,
  ReorderedBlock,
} from './reorder.js';
export type { CachePrefixAnalysis } from './cache.js';

// Prompts embedded in source files, found by an explicit marker rather than
// guessed at — see extract.ts for why a gate cannot afford a heuristic here.
export { extractPrompts, promptId, hasMarker, SOURCE_EXTENSIONS } from './extract.js';
export type { ExtractedPrompt, DeclinedPrompt, ExtractionResult } from './extract.js';

// Which provider a prompt is actually sent to, read from the code rather than
// assumed — see detect.ts for why it declines when a file points two ways.
export { detectFromSource } from './detect.js';
export type { Detection, Evidence, EvidenceKind, DetectOptions } from './detect.js';
export { optimize, withExactTokenCounts, DEFAULT_USAGE } from './optimize.js';
export {
  refineWithLlm,
  openAiCompatible,
  anthropicProvider,
  geminiProvider,
  customProvider,
  providerFromEnv,
  REFINER_SYSTEM_PROMPT,
} from './llm.js';
export type {
  RefineOptions,
  OpenAiCompatibleOptions,
  AnthropicProviderOptions,
  GeminiProviderOptions,
  CustomProviderOptions,
} from './llm.js';

// Internationalisation
export {
  DEFAULT_LOCALE,
  LOCALES,
  getMessages,
  isLocale,
  matchLocale,
  resolveLocale,
  en,
  es,
} from './i18n/index.js';
export type { CoreMessages, Locale, LocalizedMessage, RuleCopy, RuleId } from './i18n/index.js';

// Structural analysis
export {
  analyzeExamples,
  findContradictions,
  findExamples,
  findRestatedFormat,
} from './structure.js';
export type {
  Contradiction,
  ContradictionAxis,
  ContradictionSide,
  ExampleAnalysis,
  ExampleBlock,
  RedundantExample,
  RestatedFormat,
} from './structure.js';
export { jaccard, normalizeForCompare } from './similarity.js';

// Endpoint validation for the pluggable LLM layer
export {
  SAFE_FETCH_INIT,
  allowedEndpoints,
  checkedEndpoint,
  isPrivateHost,
  resolveEndpoint,
  validateLlmEndpoint,
} from './net.js';
export type { EndpointRejection, ValidateEndpointOptions } from './net.js';

// Per-rule change extraction
export { extractChanges, DEFAULT_CHANGE_LIMIT } from './changes.js';
export type { RuleChange } from './changes.js';

// Semantic review of few-shot examples (optional, costs an LLM call)
export { reviewExamples, EXAMPLE_REVIEW_SYSTEM_PROMPT } from './review.js';
export type { ExampleReview, ExampleRedundancy, ReviewExamplesOptions } from './review.js';

// Golden-set evaluation (optional, costs three LLM calls per case)
export { evaluate, fillPrompt, verdictFor } from './evaluate.js';
export type { EvalCase, EvalReport, EvalVerdict, EvaluateOptions } from './evaluate.js';

// Comparing two prompt versions
export { comparePrompts } from './compare.js';
export type {
  PromptComparison,
  CompareOptions,
  RuleDelta,
  AdvisoryDelta,
} from './compare.js';

// Glob matching for config budget patterns. Pure, so it belongs here; the
// config loader and directory walk that use it read the filesystem and live in
// "@trazum/core/node" instead — see node.ts for why that split is structural.
export { matchGlob, mostSpecificMatch, specificity } from './glob.js';
export { editDistance, nearestName } from './nearest.js';

// The config *schema*, without the loader: validation is a pure function of a
// string, so it belongs on the browser-safe entry point. `loadConfig`, which
// actually opens the file, is only in "@trazum/core/node".
export {
  CONFIG_FILENAME,
  CONFIG_KEYS,
  CONFIG_USAGE_KEYS,
  ConfigError,
  DEFAULT_EXTENSIONS,
  MAX_CONFIG_BYTES,
  MAX_CONFIG_SEARCH_DEPTH,
  budgetFor,
  parseConfig,
} from './config-schema.js';
export type { ResolvedBudget, TrazumConfig } from './config-schema.js';
