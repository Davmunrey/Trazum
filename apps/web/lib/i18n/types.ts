import type { Locale } from '@trazum/core';

/**
 * The web app's message dictionary.
 *
 * Covers this app's own chrome only. Rule copy and advisories come back from
 * the core already localised, in the locale the request asked for, so they are
 * deliberately absent here — one string, one home.
 */
export interface WebMessages {
  locale: Locale;
  /** BCP 47 tag used to format numbers and dates. */
  numberLocale: string;
  /** Name of this language in its own language, for the switcher. */
  endonym: string;

  meta: {
    title: string;
    tagline: string;
    description: string;
    /** OpenGraph locale, e.g. `en_US`. */
    ogLocale: string;
  };

  page: {
    lede: string;
    /** Text before the inline `--exact-tokens` code element. */
    footerLead(pricingReviewed: string): string;
    /** Text after it. */
    footerTail: string;
    localeSwitchLabel: string;
  };

  input: {
    promptHeading: string;
    promptAriaLabel: string;
    scenarioHeading: string;
    model: string;
    ruleLevel: string;
    levelSafe: string;
    levelAggressive: string;
    callsPerMonth: string;
    avgOutputTokens: string;
    cacheHitRate: string;
    batchLabel: string;
    optimize: string;
    optimizing: string;
    reorderLabel: string;
    reorderHint: string;
  };

  llm: {
    summary: string;
    enable: string;
    endpointFormat: string;
    formatOpenAi: string;
    formatAnthropic: string;
    baseUrl: string;
    baseUrlPlaceholder: string;
    baseUrlServerDefault: string;
    baseUrlNotOffered: string;
    model: string;
    modelPlaceholder: string;
    apiKey: string;
    apiKeyOnServer: string;
    apiKeyPlaceholder: string;
    keyNote: string;
    safetyNote: string;
  };

  history: {
    heading: string;
    clear: string;
    noText: string;
    perMonth(amount: string): string;
    restoreTitle: string;
    tooLongTitle: string;
    privacyNote: string;
  };

  results: {
    empty: string;
    heading: string;
    inputTokens(before: string, after: string): string;
    perMonth(amount: string): string;
    costCaption(before: string, after: string, model: string, calls: string): string;
    promoSuffix: string;
    llmApplied(provider: string, model: string, before: number, after: number): string;
    llmRejected(reason: string): string;
    optimizedHeading: string;
    diffHeading: string;
    showDiff: string;
    showResult: string;
    copy: string;
    copied: string;
    diffTooLong: string;
    rulesHeading: string;
    ruleHits(hits: number, tokensSaved: number): string;
    moreChanges(count: number): string;
    badgeSafe: string;
    badgeAggressive: string;
    advisoriesHeading: string;
    advisoryPerMonth(amount: string): string;
    reorderMoved(blocks: number, tokens: string): string;
    reorderPrefix(before: string, after: string): string;
    reorderNothing: string;
    reorderReview: string;
    reorderDeclinedRef(phrase: string, excerpt: string): string;
    reorderDeclinedAfter(excerpt: string): string;
    reorderDeclinedScript(script: string): string;
    reorderDeclinedMore(count: number): string;
  };

  errors: {
    requestFailed: string;
    unreachable: string;
  };

  api: {
    rateLimited: string;
    invalidJson: string;
    missingPrompt: string;
    promptTooLong(limit: string): string;
    unknownRule(id: string): string;
    unknownModel(id: string): string;
    invalidEndpointUrl: string;
    endpointMustBeHttps: string;
    endpointMustBePublic: string;
    endpointNotOffered: string;
    endpointNotAllowed(allowed: readonly string[]): string;
    llmNotConfigured: string;
    unexpected: string;
  };
}
