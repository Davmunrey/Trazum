import type { AdvisoryId, Locale } from '@trazum/core';

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
    suggest: string;
    suggestHint: string;
    applySuggestions: string;
    applySuggestionsHint: string;
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

  /** The sign-in control in the header. Absent entirely when auth is off. */
  account: {
    signIn: string;
    signOut: string;
    signingOut: string;
    /** Shown beside the name when the store forgets on restart. */
    ephemeral: string;
    ephemeralHint: string;
  };

  /** The saved-prompts tab. Rendered only for a signed-in reader. */
  library: {
    tab: string;
    lede: string;
    loading: string;
    empty: string;
    saveCurrent: string;
    nothingToSave: string;
    namePrompt: string;
    saveVersion: string;
    saved: string;
    /** A save that changed nothing. Reported as a note, not a failure. */
    unchanged: string;
    showHistory: string;
    hideHistory: string;
    restore: string;
    delete: string;
    confirmDelete(name: string): string;
    meta(tokens: string, versions: number, updated: string): string;
    versionLabel(version: number): string;
    versionTokens(tokens: string, when: string): string;
  };

  /** The shared-comparison page at /c/:token. Read by people with no account. */
  share: {
    sharedBy(login: string, when: string): string;
    footer: string;
    /** The Compare tab's share control. */
    button: string;
    working: string;
    heading: string;
    expiryLabel: string;
    expiry7: string;
    expiry30: string;
    expiry90: string;
    expiryNever: string;
    /** Said before the link is created, not after. */
    warning: string;
    created(url: string): string;
    copy: string;
    copied: string;
    revoke: string;
    existing: string;
    expiresOn(when: string): string;
    neverExpires: string;
  };

  /** The deployment overview at /admin. Absent unless TRAZUM_ADMINS is set. */
  admin: {
    heading: string;
    lede: string;
    /** The disclaimer, rendered above the first number. */
    notSpend: string;
    /** Shown when the admin list matched a renameable login rather than an id. */
    loginWarning: string;
    accounts: string;
    prompts: string;
    prompt: string;
    account: string;
    tokens: string;
    recoverable: string;
    byAccount: string;
    topHeading: string;
    truncated(measured: string, total: string): string;
    footer: string;
  };

  /** The Compare tab: what an edit did to a prompt. */
  compare: {
    tab: string;
    optimiseTab: string;
    lede: string;
    beforeLabel: string;
    beforeHint: string;
    afterLabel: string;
    afterHint: string;
    optimizeBoth: string;
    optimizeBothHint: string;
    submit: string;
    working: string;
    /** The sign convention, stated before any number is shown. */
    convention: string;
    tokens(before: string, after: string): string;
    delta(delta: string, pct: string): string;
    monthly(amount: string, calls: string, model: string): string;
    perCall(amount: string): string;
    unchanged: string;
    advisoriesAppeared: string;
    advisoriesResolved: string;
    rulesNewlyFiring: string;
    rulesNoLongerFiring: string;
    measuringOptimised: string;
    /** Human labels for advisory ids, which have no static title in the core. */
    advisoryLabel: Record<AdvisoryId, string>;
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
    suggestOffered(count: number, tokens: string): string;
    suggestApplied(count: number, tokens: string): string;
    suggestNothing(provider: string, model: string): string;
    suggestRejected(count: number): string;
    suggestRemoved: string;
    suggestNotApplied: string;
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
    missingBefore: string;
    missingAfter: string;
    promptTooLong(limit: string): string;
    unknownRule(id: string): string;
    unknownModel(id: string): string;
    invalidEndpointUrl: string;
    endpointMustBeHttps: string;
    endpointMustBePublic: string;
    endpointNotOffered: string;
    endpointNotAllowed(allowed: readonly string[]): string;
    applyNeedsSuggest: string;
    llmNotConfigured: string;
    unexpected: string;
  };
}
