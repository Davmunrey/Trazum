export * from './types.js';
export { estimateTokens, countTokensAnthropic } from './tokenizer.js';
export type { AsyncTokenCounter, AnthropicCounterOptions } from './tokenizer.js';
export {
  MODELS,
  DEFAULT_MODEL,
  COST_MULTIPLIERS,
  PRICING_LAST_REVIEWED,
  getModel,
  listModels,
  effectivePricing,
  cheapestOfTier,
} from './pricing.js';
export { RULES, getRule } from './rules.js';
export { segment, join, protectedTexts } from './segment.js';
export { computeSavings, costOfCall, formatUsd } from './savings.js';
export { buildAdvisories, recommendTier } from './advisories.js';
export type { AdvisoryOptions } from './advisories.js';
export { analyzeCachePrefix } from './cache.js';
export type { CachePrefixAnalysis } from './cache.js';
export { optimize, withExactTokenCounts, DEFAULT_USAGE } from './optimize.js';
export {
  refineWithLlm,
  openAiCompatible,
  anthropicProvider,
  customProvider,
  providerFromEnv,
  REFINER_SYSTEM_PROMPT,
} from './llm.js';
export type {
  RefineOptions,
  OpenAiCompatibleOptions,
  AnthropicProviderOptions,
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
export { isPrivateHost, validateLlmEndpoint } from './net.js';
export type { EndpointRejection, ValidateEndpointOptions } from './net.js';
