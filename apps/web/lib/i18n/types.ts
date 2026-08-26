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
    /** The drawer's dismiss control, which needs a name for a screen reader. */
    closeMenu: string;
    openMenu: string;
    /** The desktop rail's width toggle, named for what pressing it does. */
    collapseRail: string;
    expandRail: string;
    /**
     * The rail's two nav groups. Labels, not controls: with five modes a
     * collapsible submenu would hide two clicks behind one, so the grouping
     * is typographic — an eyebrow over each cluster — and every mode stays
     * one click away.
     */
    groupWork: string;
    groupMeasure: string;
    /** The external links at the rail's foot, and the group's own name. */
    groupResources: string;
    linkGitHub: string;
    linkNpm: string;
    linkDocs: string;
    /** Appended to an external link's accessible name: it leaves this app. */
    opensExternal: string;
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
    /** Revokes every session the account has, not only this browser's. */
    signOutEverywhere: string;
    signOutEverywhereHint: string;
    /** Shown beside the name when the store forgets on restart. */
    ephemeral: string;
    ephemeralHint: string;
    /** Irreversible, and the copy says what goes rather than implying it. */
    deleteAccount: string;
    deleteConfirm(login: string): string;
    deleteFailed: string;
    /** Names the account menu's trigger, which collapses to a bare avatar. */
    menuLabel(login: string): string;
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
  /**
   * The interview.
   *
   * `slots` is keyed by slot id and held to `@trazum/core`'s catalogue in both
   * directions: a slot nobody can ask fails, and copy for a slot that does not
   * exist fails too. The words are the product in this mode, so a missing one
   * is not a cosmetic gap — it is a question nobody can be asked.
   */
  write: {
    tab: string;
    lede: string;
    /** Stated above the form, before anybody types. */
    privacy: string;
    slots: Readonly<Record<string, { question: string; unlocks: string }>>;
    optional: string;
    decline: string;
    declined: string;
    missing(count: number): string;
    done: string;
    promptHeading: string;
    copy: string;
    copied: string;
    tokens(count: string): string;
    monthly(usd: string): string;
    within(limit: string): string;
    over(limit: string): string;
    noVerdict(reason: 'no-budget' | 'no-model' | 'model-unpriced'): string;
    clean: string;
    notClean(rules: string, tokens: string): string;
    /** The claim this mode refuses to make, said out loud. */
    notPerfect: string;
  };

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
    /**
     * An empty state that names what the report will contain, rather than one
     * that apologises for being empty. Three lines: what nothing has happened
     * yet, what to do, and what you get for doing it.
     */
    emptyTitle: string;
    emptyWillShow: readonly string[];
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
  /**
   * The plan, and the check that a plan came true.
   *
   * Kept out of `bill` because it is a different question: the bill says
   * where the money went, the plan says what to do about it, and the
   * verification says whether it happened. Three surfaces of one loop, and
   * the copy for each stays where a translator can see which is which.
   */
  plan: {
    heading: string;
    nothingToDo: string;
    projected(usd: string): string;
    staked(usd: string): string;
    neverSummed: string;
    action(kind: string, label: string, model: string): string;
    projectedAmount(usd: string): string;
    stakedAmount(usd: string): string;
    noAmount: string;
    routeTo(model: string): string;
    assumes(what: string): string;
    assumeModel(model: string): string;
    assumeKind(kind: string): string;
    check: string;
    andMore(count: number): string;
    save: string;
    saveNote: string;

    verifyHeading: string;
    verifyLede: string;
    chooseePlan: string;
    notAPlan(why: string): string;
    refusalNotJson: string;
    refusalNotAnObject: string;
    refusalSchemaVersion(found: string): string;
    refusalNoActions: string;
    refusalActionMalformed(position: number, because: string): string;
    tally(arrived: number, notArrived: number, cannotTell: number): string;
    emptyPlan: string;
    pricesChanged(planDate: string, currentDate: string): string;
    verifiedAction(kind: string, label: string, model: string, outcome: string): string;
    cannotTell(reason: string): string;
    callsMoved(before: number, after: number): string;
  };

  bill: {
    tab: string;
    lede: string;
    /** Stated above the input, before anyone pastes. The whole privacy story. */
    privacy: string;
    dropLabel: string;
    chooseFile: string;
    /** The folder drop — the 1.70 move: a whole ~/.claude/projects at once. */
    chooseFolder: string;
    dropFolderHint: string;
    transcriptSummary(transcripts: number, calls: number): string;
    transcriptAlsoLogs(logs: number): string;
    transcriptCollapsed(lines: number): string;
    transcriptStreamed(calls: number): string;
    /** The 1.74 arm: a dropped price card widens the catalogue in place. */
    priceCardApplied(touched: number, added: number): string;
    priceCardBad(message: string): string;
    priceCardClear: string;
    /** The 1.71 arm: a dropped OpenTelemetry export, priced in this tab. */
    otelSummary(exports: number, spans: number): string;
    otelSkipped(spans: number): string;
    otelNoCache(spans: number): string;
    transcriptPrivacy: string;
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
    /**
     * `--what-if` in the browser: the same tokens at another model's rates.
     *
     * The assumption is a separate string from the figure so it can be
     * rendered above it — a dollar amount with the caveat underneath reads as
     * a recommendation with small print, and this comparison has never seen a
     * prompt.
     */
    whatIfHeading: string;
    whatIfPick: string;
    whatIfNone: string;
    whatIfAssumption: string;
    whatIfTotal(current: string, target: string, delta: string): string;
    whatIfCheaper: string;
    whatIfDearer: string;
    /**
     * Cache traffic the target's minimum would refuse: the standard repriced
     * figure grants discounted rates to entries that could not form — an
     * error in the flattering direction, corrected beside the figure.
     */
    /** The moved bill batched on the target's rates — never summed with the move. */
    whatIfBatchOnTarget(batched: string, moved: string): string;
    whatIfCacheBeyond(largest: string, min: string, noCache: string): string;
    whatIfSlice(label: string, model: string, current: string, target: string): string;
    whatIfOverContext(label: string, tokens: string, window: string, usd: string): string;
    whatIfAlreadyThere(calls: number, usd: string): string;
    whatIfUnpriced(calls: number, models: string): string;
    whatIfNothingToMove: string;
    historyHeading: string;
    historyGrowth(label: string, model: string, first: string, last: string, turns: string): string;
    historyCeiling(usd: string, pct: string, flat: string, spent: string): string;
    historyNoSessions: string;
    /**
     * How big the calls are — the other half of the bill. Same threshold and
     * same sentences as the CLI: two surfaces summarising one log differently
     * is a second opinion nobody asked for.
     */
    inputShapeHeading: string;
    inputSkewed(label: string, model: string, p50: string, p95: string, ratio: string, usd: string): string;
    inputSkewedAdvice: string;
    inputEven(label: string, model: string, p50: string, p95: string, usd: string): string;
    inputEvenAdvice: string;
    inputHuge(label: string, model: string, calls: number, usd: string): string;
    inputMostlyCached(share: string): string;
    inputFullRate: string;
    /** A doubled bill, said before anything above is believed. */
    duplicateLines(count: number, usd: string): string;
    /**
     * The same request sent again, the ceiling in sight, and the mix moving —
     * the three findings the CLI grew that this tab lacked. Same thresholds,
     * same hedges: two surfaces summarising one log differently is a second
     * opinion nobody asked for.
     */
    repeatsHeading: string;
    repeatsLine(label: string, model: string, repeats: string, checked: string, seconds: string, usd: string): string;
    repeatsNote: string;
    pressureHeading: string;
    pressureLine(label: string, model: string, tokens: string, window: string, share: string): string;
    pressureAdvice: string;
    mixDriftHeading: string;
    mixDriftLine(model: string, firstShare: string, lastShare: string, firstDays: number, lastDays: number, usd: string): string;
    mixDriftNote: string;
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
     * Looking at one workload alone — the CLI's --label, by clicking a row.
     * The banner says the awkward half: shares below are shares of this
     * workload's bill, not of the log.
     */
    /**
     * Which workloads pay for truncated answers, at a rate over calls that
     * recorded a stop reason — never over every call.
     */
    /**
     * The shape of the UTC day, drawn: which hours hold the spend. Names the
     * Batch API as the lever a flat day points at, and never claims the
     * saving — whether a workload can wait is a product decision.
     */
    /**
     * What the log cannot answer yet, from exact counts. Booleans would call
     * twelve labelled records out of forty thousand a labelled log.
     */
    coverageHeading: string;
    needsLabel(seen: string): string;
    needsSession(seen: string): string;
    needsTs(seen: string): string;
    needsStopReason(seen: string): string;
    needsCacheTtl(seen: string): string;
    hourChartLabel: string;
    hoursConcentrated(hours: number): string;
    hoursFlat(hours: number): string;
    truncatedBy(label: string, calls: number, measured: number, rate: string, usd: string): string;
    drillActive(label: string): string;
    drillClear: string;

    /**
     * What one conversation costs — median against p95, never a mean: one
     * runaway loop hides the ordinary case, which is the figure a per-seat
     * price or a quota is set from.
     */
    /**
     * What the comparison stopped being able to see. Dollars render a fixed
     * finding and a blinded log identically; only coverage tells them apart,
     * and the silenced list names which sections to distrust.
     */
    coverageField(field: string): string;
    coverageDrift(field: string, was: string, now: string): string;
    coverageSilenced(field: string): string;
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
    /**
     * The whole log's conversations when the per-slice percentiles refused:
     * a maximum is a fact at any count, and it is the number a
     * per-conversation budget judges.
     */
    sessionSpendOnly(sessions: number, max: string): string;
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

  /**
   * The position card — the CLI's `trazum position` in the Bill tab, the
   * fourth door on one document. Where the CLI catalogue already has the
   * sentence, the web says it word for word: four surfaces summarising one
   * month differently would be a second opinion nobody asked for.
   */
  position: {
    heading: string;
    lede: string;
    /**
     * The ceilings' source is the reader's own trazum.config.json, parsed by
     * the same `parseConfig` the CLI reads it with — no bespoke fields that
     * could accept what the schema refuses.
     */
    configLabel: string;
    configAriaLabel: string;
    read: string;
    clear: string;
    /** A config the schema refuses — the parser's own sentence, verbatim. */
    configError(message: string): string;
    /** A config that validates and configures no ceilings. Not an empty report. */
    noCeilings: string;
    monthHeading(month: string): string;
    scopeMonth: string;
    scopeDay: string;
    scopeLabel(label: string): string;
    within(
      scope: string,
      measured: string,
      limit: string,
      remaining: string,
      days: number,
      elapsed: number,
    ): string;
    over(scope: string, measured: string, limit: string, overBy: string): string;
    cannotTell(scope: string): string;
    /** Division on the past, with its denominator — never a forecast. */
    distance(days: string, rate: string, overDays: number): string;
    unmeasuredHeading: string;
    unmeasured(scope: string, why: string): string;
    why(reason: 'no-clock' | 'no-labels' | 'nothing-recorded' | 'label-unseen'): string;
    cannotSayHeading: string;
    cannotSay: Record<string, string>;
    unpriced(count: number): string;
    source: string;
  };

  /**
   * The 1.72 playground: the CLI's pure subset, runnable in the page. The
   * command names, flags and file names stay verbatim (they are the product);
   * every sentence around them speaks the reader's language.
   */
  playground: {
    tab: string;
    lead: string;
    inputAriaLabel: string;
    helpIntro: string;
    /** One line per playground command, keyed by the command's own name. */
    commandHelp: {
      models: string;
      rules: string;
      optimize: string;
      check: string;
      profile: string;
      position: string;
      diff: string;
      semantic: string;
      'from-otel': string;
      'from-claude-code': string;
    };
    helpLs: string;
    helpCat: string;
    helpClear: string;
    /** The honest gap: the commands that need a terminal, named not hidden. */
    helpCliOnly: string;
    unknown(head: string): string;
    cliOnly(command: string): string;
    usageLine(usage: string): string;
    noSuchFile(name: string): string;
    badConfig(name: string): string;
    modelsHeading: string;
    rulesHeading(count: number): string;
    optimizeTokens(before: number, after: number, pct: number): string;
    optimizeAdvisories(count: number): string;
    optimizeHonest: string;
    checkWithin(tokens: number, budget: number): string;
    checkOver(tokens: number, budget: number): string;
    profileTotal(calls: number, usd: string): string;
    profileMore(count: number): string;
    positionRow(scope: string, measured: string, limit: string, verdict: string): string;
    positionUnpriced(count: number): string;
    diffTokens(before: number, after: number, delta: number): string;
    diffMonthly(usd: string, grew: boolean): string;
    semanticNone: string;
    semanticFound(count: number): string;
    semanticStructuralOnly: string;
    notOtel(name: string): string;
    notTranscript(name: string): string;
    otelSummary(llmSpans: number, otherSpans: number): string;
    otelNoCache(count: number): string;
    transcriptSummary(count: number): string;
    wrote(name: string, count: number): string;
  };

  /**
   * The 1.73 guided tour. Offered, never imposed: a first visit gets a
   * one-line offer, the launcher lives in the rail, and every sentence of the
   * walk lives here — one title and one body per step id in `TOUR_STEPS`.
   */
  tour: {
    launch: string;
    offer: string;
    offerStart: string;
    offerDismiss: string;
    next: string;
    back: string;
    skip: string;
    done: string;
    progress(current: number, total: number): string;
    dialogLabel: string;
    steps: {
      welcome: { title: string; body: string };
      optimise: { title: string; body: string };
      write: { title: string; body: string };
      compare: { title: string; body: string };
      bill: { title: string; body: string };
      playground: { title: string; body: string };
      'playground-profile': { title: string; body: string };
      'playground-optimize': { title: string; body: string };
      cli: { title: string; body: string };
      finish: { title: string; body: string };
    };
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
    /** The interview: an answers object that is not one, or an id nobody asks. */
    answersNotAnObject: string;
    unknownSlot(id: string): string;
    answerNotText(id: string): string;
    answerTooLong(id: string, limit: string): string;
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
