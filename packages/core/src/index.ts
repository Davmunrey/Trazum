export * from './types.js';
export { ESTIMATE_ERROR_BAND_PCT, estimateTokens, countTokensAnthropic } from './tokenizer.js';
export {
  UNLABELLED,
  cacheEconomics,
  cacheHitRate,
  parseUsageLine,
  profileUsage,
  sharesOf,
} from './usage.js';
export type {
  CacheEconomics,
  CacheVerdict,
  UsageProfileOptions,
  UsageBreakdown,
  FieldCoverage,
  UsageProfileReport,
  UsageRecord,
  UsageShares,
} from './usage.js';
export { conversationGrowth, createConversationTracker } from './conversation.js';
// Whether the cache TTL fits how fast the turns arrive — the mechanism behind a
// losing cache, readable only when the log carries a clock. See ttl-fit.ts.
export { TTL_1H_MS, TTL_5M_MS, cacheTtlFit, createTtlFitTracker } from './ttl-fit.js';
export type { CacheTtlFit, TtlFitOptions, TtlFitTracker, TtlFitVerdict } from './ttl-fit.js';
// Cache writes by conversations that never came back — a ceiling on waste,
// named as one, and a fact when the slice read nothing. See session-ledger.ts.
// The drivers of a change between two bills — one implementation, because the
// sign convention (positive means the bill grew) has flipped once already
// when restated by hand. See against.ts.
// The profile as a spreadsheet — one row per label and model, no total row,
// empty cells where dollars are unknown. See csv.ts.
export {
  PROFILE_CSV_COLUMNS,
  PROFILE_CSV_DAY_COLUMNS,
  PROFILE_CSV_HOUR_COLUMNS,
  PROFILE_CSV_MODEL_DAY_COLUMNS,
  profileToCsv,
} from './csv.js';
export type { ProfileCsvOptions, ProfileCsvShape } from './csv.js';
export { driversBetween } from './against.js';
export type { AgainstDriver } from './against.js';
export { coverageDrift, COVERAGE_FIELDS, COVERAGE_DRIFT_MIN } from './coverage-drift.js';
export { explainGateFailure, gateMargin, GATE_MARGIN_TIGHT } from './gate-explain.js';
export { measuredUsage, labelCoverage, MIN_SCALE_DAYS, SCALE_TO_DAYS } from './measured-profile.js';
export { assignSources, fleetRollup } from './fleet.js';
export { buildPlan, planLabelName, parsePlanDocument, PLAN_ACTION_KINDS } from './plan.js';
export type { PlanParseFailure, PlanParseResult } from './plan.js';
export type { PlanAction, PlanActionKind, PlanAssumption, PlanDocument } from './plan.js';
export { verifyPlan } from './verify.js';
export { buildHistory, storedReportFrom, MIN_RUN } from './history.js';
export { budgetPositions, monthOf, MAX_UNMEASURED_NAMED } from './budget.js';
export type {
  BudgetCoverage,
  BudgetOptions,
  BudgetPeriod,
  BudgetStanding,
  BudgetReport,
  BudgetScope,
  BurnDown,
  BurnShape,
} from './budget.js';
export { waiverHistory, waiverDay, isWaiverUse } from './waivers.js';
export type { WaiverHabit, WaiverHistory, WaiverUse, WaiverVerdict } from './waivers.js';
export { answerCost } from './answer.js';
export { guardSpend } from './guard.js';
export type { GuardAlternative, GuardAnswer, GuardRequest, GuardVerdict } from './guard.js';
export { proposeInit, HEADLINE_FLOOR_SHARE, MIN_RATE_DAYS } from './init.js';
export type {
  InitDecline,
  InitHeadline,
  InitJustification,
  InitKey,
  InitObservations,
  InitOptions,
  InitProposal,
  NoHeadline,
  ProviderSighting,
  UsageSighting,
} from './init.js';
export type {
  AnswerRequest,
  AnswerVerdict,
  BudgetPosition,
  CallEstimate,
  CannotTellReasonAnswer,
  CostAnswer,
} from './answer.js';
export { evaluateWatch, firedKey, COVERAGE_FLOOR, DAY_MS } from './watch.js';
export type {
  NotJudgeable,
  WatchAbstention,
  WatchCrossing,
  WatchGate,
  WatchOptions,
  WatchResult,
  WatchThresholds,
} from './watch.js';
export {
  STORE_SCHEMA_VERSION,
  identityOf,
  resolveStore,
  recordsFromBuckets,
  bucketsFromRecords,
  storeInventory,
  pruneRecords,
} from './store.js';
export type { PruneResult, ResolvedStore, StoreInventory, StoreRecord } from './store.js';
export {
  CONNECTORS,
  connectorFor,
  normalizeAnthropicUsage,
  normalizeOpenAIUsage,
  bucketedProfile,
  bucketedCacheEconomics,
} from './connector.js';
export type {
  BucketedReport,
  BucketedSlice,
  ConnectorDescriptor,
  ConnectorGranularity,
  ConnectorPull,
  PullGap,
  UnavailableFinding,
  UsageBucket,
} from './connector.js';
export type { HistoryDocument, HistoryRun, RepeatedPlanAction, StoredReport } from './history.js';
export type { CannotTellReason, PlanVerification, VerifiedAction, VerifyOutcome } from './verify.js';
export type { FleetSource, FleetRollup } from './fleet.js';
export type { MeasuredUsage, LabelCoverage } from './measured-profile.js';
export type { GateExplanation } from './gate-explain.js';
export type { CoverageDrift, CoverageField } from './coverage-drift.js';
// The same tokens at another model's rates — arithmetic, not advice, and it
// refuses to price a call the target could not have accepted. See reprice.ts.
// The shape of a call's input — the half of the bill a total could only name.
// See input-shape.ts.
export { createInputShapeTracker, inputShapes } from './input-shape.js';
export type { InputShape, InputShapeOptions, InputShapeTracker } from './input-shape.js';
// The same request sent again a moment later — a retry or a loop, named as
// the pattern it is and never as a certainty. See repeats.ts.
export { createRepeatsTracker, repeatedTurns } from './repeats.js';
// The retry bill of truncation — the "billed again" half of the truncation
// line, measured instead of asserted. See truncation-retry.ts.
export { createTruncationRetryTracker, truncationRetries } from './truncation-retry.js';
export type { TruncationRetry, TruncationRetryOptions, TruncationRetryTracker } from './truncation-retry.js';
export type { RepeatedTurns, RepeatsOptions, RepeatsTracker } from './repeats.js';
// How close each slice's largest call is to its model's context window —
// the failure a bill cannot show until the day the product breaks.
// See context-pressure.ts.
export { contextPressure } from './context-pressure.js';
export type { ContextPressure, ContextPressureOptions } from './context-pressure.js';
export { priceTokensOn, repriceProfile } from './reprice.js';
export type { OverContextSlice, RepriceReport, RepricedSlice } from './reprice.js';
export { createSessionLedgerTracker, singleTurnCacheWrites } from './session-ledger.js';
// What one conversation costs — median and p95, exact. See session-cost.ts.
export { createSessionCostTracker, sessionCostShapes } from './session-cost.js';
export type { SessionCostOptions, SessionCostShape, SessionCostTracker } from './session-cost.js';
export type {
  SessionLedgerOptions,
  SessionLedgerTracker,
  SingleTurnCacheWrites,
} from './session-ledger.js';
export { createOutputShapeTracker, outputShapes } from './output-shape.js';
export type { OutputShape, OutputShapeOptions, OutputShapeTracker } from './output-shape.js';
export type { ConversationGrowth, ConversationOptions, ConversationTracker } from './conversation.js';
export { billLevers } from './levers.js';
export type { BillLevers, BillLeverOptions, LeverId, SliceLevers } from './levers.js';
export { DETECTABLE_LANGUAGES, detectTextLanguage } from './language.js';
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

// SigV4 and the Google service-account flow, both hand-rolled on WebCrypto to
// keep the zero-dependency invariant. Exported so they can be tested directly:
// a signer that is only reachable through a network call is a signer nothing
// checks.
export { amzDates, canonicalRequest, signRequest, signingKey } from './aws-sigv4.js';
export type { SignInput, SignedHeaders } from './aws-sigv4.js';
export { accessToken, pkcs8FromPem, signedJwt } from './gcp-auth.js';
export type { CachedToken, ServiceAccount } from './gcp-auth.js';
export type { OpenRouterResult } from './openrouter.js';
export {
  BASELINE_FILENAME,
  BASELINE_VERSION,
  BaselineError,
  MAX_BASELINE_BYTES,
  breaches,
  compareToBaseline,
  formatBaseline,
  moneyIsComparable,
  parseBaseline,
} from './baseline.js';
export type {
  BaselineBreach,
  BaselineChange,
  BaselineComparison,
  BaselineDocument,
  BaselineThresholds,
} from './baseline.js';
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

// The caching loss that only exists between prompts: a preamble shared by forty
// files and byte-identical in none of them. Reports no dollar figure on purpose
// — see shared-prefix.ts for why the cost model cannot price it.
export { cacheableMinimum, sharedPrefixes } from './shared-prefix.js';
export type {
  PrefixCandidate,
  SharedPrefix,
  SharedPrefixOptions,
} from './shared-prefix.js';

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
  bedrockProvider,
  geminiProvider,
  vertexProvider,
  customProvider,
  providerFromEnv,
  REFINER_SYSTEM_PROMPT,
} from './llm.js';
export type {
  RefineOptions,
  OpenAiCompatibleOptions,
  AnthropicProviderOptions,
  BedrockProviderOptions,
  GeminiProviderOptions,
  VertexProviderOptions,
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
  findMovableSchema,
  findRestatedFormat,
} from './structure.js';
export type {
  Contradiction,
  ContradictionAxis,
  ContradictionSide,
  ExampleAnalysis,
  ExampleBlock,
  MovableSchema,
  RedundantExample,
  RestatedFormat,
} from './structure.js';
export { jaccard, normalizeForCompare } from './similarity.js';
export { OUTPUT_CUES, OUTPUT_CUES_BY_LANGUAGE } from './phrases.js';

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

// Which few-shot examples earn their tokens, measured by leave-one-out. Optional,
// and the most expensive thing here: see prune.ts for the call arithmetic and for
// what the measurement cannot tell you.
export { NothingToPrune, plannedCalls, pruneExamples, withoutExample } from './prune.js';
export type { ExampleContribution, PruneOptions, PruneReport } from './prune.js';

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
export type { ResolvedBudget, SpendConfig, TrazumConfig, WaiveEntry } from './config-schema.js';
export { WAIVABLE_GATES } from './config-schema.js';
