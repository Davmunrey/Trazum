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
    /** The README badge built from the same link. */
    badge: string;
    badgeHint: string;
    copyBadge: string;
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

  /**
   * The Bill tab: a usage log read entirely in the browser.
   *
   * Nothing in this section may promise less than the CLI's `profile` command
   * states — the doctrine travels with the copy. Ceilings are named as
   * ceilings, an unsettled cache verdict is reported as unsettled, and "not
   * recorded" is never rendered as "did not happen".
   */
  bill: {
    tab: string;
    lede: string;
    /** Stated above the input, before anyone pastes. The whole privacy story. */
    privacy: string;
    dropLabel: string;
    chooseFile: string;
    orPaste: string;
    pasteAriaLabel: string;
    analyze: string;
    /** How to record a log, for a reader arriving with nothing to paste. */
    recipe: string;
    empty: string;
    nothingPriced: string;
    heading: string;
    headline(calls: number, total: string): string;
    partInput: string;
    partCacheRead: string;
    partCacheWrite: string;
    partOutput: string;
    spendColumn: string;
    shareColumn: string;
    tokensColumn: string;
    callsColumn: string;
    cacheHeading: string;
    cacheHit(pct: string): string;
    cacheNever: string;
    cachePaidOff(usd: string): string;
    cacheLost(usd: string): string;
    cacheNoDifference: string;
    cacheUnpriced: string;
    /** The log cannot settle the verdict; both ends are stated, neither as the answer. */
    cacheUnsettled(calls: number, asRecorded: string, atLongTtl: string): string;
    /** The verdict survives the assumption, but the figure is a bound. */
    cacheTtlBound(calls: number, atLongTtl: string): string;
    /** A losing label hidden inside a comfortable total. */
    cacheHiddenLoss(usd: string, labels: string): string;
    leversHeading: string;
    /** `usd` is the slice's combined saving, never its spend — the share describes it. */
    leverSlice(label: string, model: string, usd: string, pct: string): string;
    leverRoute(candidate: string, usd: string): string;
    leverBatch(usd: string): string;
    leverCalls(calls: number, spent: string): string;
    routeVerify: string;
    leverPromptCeiling(usd: string, pct: string): string;
    leversNone: string;
    leversUnlabelled: string;
    historyHeading: string;
    historyGrowth(label: string, model: string, first: string, last: string, turns: string): string;
    historyCeiling(usd: string, pct: string, flat: string, spent: string): string;
    historyNoSessions: string;
    outputHeading: string;
    outputTail(
      label: string,
      model: string,
      callPct: string,
      spendPct: string,
      above: string,
      usd: string,
    ): string;
    outputFlat(label: string, model: string, callPct: string, spendPct: string, usd: string): string;
    /** Bucket ceilings, exact over the histogram — what a max_tokens cap wants. */
    outputPercentiles(p50: string, p95: string): string;
    truncatedHeading: string;
    truncatedWaste(calls: number, usd: string, pct: string): string;
    truncatedNone: string;
    truncatedNotRecorded: string;
    /** The period the log covers — stated, never extrapolated. */
    span(from: string, to: string, days: string): string;
    spanPartial(withTs: number, total: number): string;
    /** The most expensive day against the median day — a spike with a suspect. */
    dayPeak(day: string, usd: string, xMedian: string): string;
    dayPeakLabel(label: string, usd: string): string;
    /** Accessible summary of the per-day bar chart. */
    dayChartLabel(days: number): string;
    /**
     * Whether the cache TTL fits the median gap between turns. Four verdicts
     * plus "could not be measured" — the same three-state discipline as
     * truncation, because "no data" and "fits" are different answers.
     */
    ttlExpires(label: string, model: string, gap: string): string;
    ttlExpiresBoth(label: string, model: string, gap: string): string;
    ttlOverlong(label: string, model: string, gap: string, usd: string): string;
    ttlUnsettled(label: string, model: string, gap: string): string;
    ttlFits(label: string, model: string, gap: string): string;
    ttlUnmeasured: string;
    /**
     * Cache writes by conversations that ended after one turn. Two claims for
     * the same tokens: a fact when the slice recorded zero cache reads, a
     * ceiling named as one otherwise — the provider's cache is keyed by
     * prefix, and the log cannot see whose write a read hit.
     */
    singleTurnConfirmed(label: string, model: string, single: number, sessions: number, usd: string): string;
    singleTurnCeiling(label: string, model: string, single: number, sessions: number, usd: string): string;
    /**
     * The time window — the CLI's --since/--until in the browser, under the
     * CLI's rules: a bare date is that whole UTC day; clockless calls are
     * excluded and counted out loud; a window matching nothing is an error
     * naming what the log covers, never a $0 report.
     */
    windowLabel: string;
    windowSinceAria: string;
    windowUntilAria: string;
    windowClear: string;
    windowHint: string;
    windowLine: string;
    windowUndated(calls: number): string;
    windowMatchesNothing(from: string, to: string): string;
    windowNeedsClock: string;
    windowOrder: string;
    /** The price table's age, said only when past the 45-day threshold. */
    pricesStale(date: string, days: number): string;
    /**
     * What one conversation costs — median against p95, never a mean: one
     * runaway loop hides the ordinary case, which is the figure a per-seat
     * price or a quota is set from.
     */
    sessionCost(
      label: string,
      model: string,
      sessions: number,
      median: string,
      medianTurns: number,
      p95: string,
      max: string,
    ): string;
    sessionCostTail(ratio: string): string;
    byLabelHeading: string;
    byModelHeading: string;
    unlabelled: string;
    moreRows(count: number): string;
    unpriced(models: string, calls: number): string;
    skipped(count: number, lines: string): string;
    /**
     * This bill against a previous log, in the browser. The sign convention —
     * positive means the bill grew — is stated before the first figure, the
     * Compare tab's rule for the Compare tab's reason.
     */
    againstLabel: string;
    againstHint: string;
    againstClear: string;
    againstHeading: string;
    againstConvention: string;
    againstTotals(before: string, after: string, delta: string, pct: string): string;
    againstCalls(before: number, after: number): string;
    againstDriver(delta: string, label: string, before: string, after: string): string;
    againstDriverNew(delta: string, label: string): string;
    againstDriverGone(delta: string, label: string): string;
    againstNothingPriced: string;
    /** Lead-in for the change split by model — where the mix moved. */
    againstByModel: string;
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
