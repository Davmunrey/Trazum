import type { CannotTellReason, EvalVerdict, Locale, NotJudgeable, PlanActionKind, PlanAssumption, RuleLevel, VerifyOutcome, WatchGate } from '@trazum/core';

/**
 * The CLI's own message catalogue.
 *
 * The core library has its own catalogue for rule copy and advisories; this
 * one covers the chrome around them — help text, table headers, section
 * titles and error messages. Two catalogues rather than one because the two
 * packages ship independently: the library is usable without ever installing
 * the CLI.
 */

export interface HelpDefaults {
  model: string;
  callsPerMonth: number;
  avgOutputTokens: number;
  cacheHitRate: number;
  locales: readonly string[];
  /**
   * Every contract `--contract` accepts, from the one place that defines them.
   *
   * Retyped into the help text, this list stopped at `cost-answer` and stayed
   * there through two releases that each added a contract — the same shape as
   * the provider enumeration `help-enumerations.test.js` exists to keep out of
   * USAGE, one section further down the same page.
   */
  contracts: readonly string[];
}

export interface CliMessages {
  locale: Locale;
  /** BCP 47 tag used to format numbers. */
  numberLocale: string;

  help(defaults: HelpDefaults, bold: (s: string) => string): string;

  /** The on-disk cache of model answers for `--suggest`. */
  cache: {
    cleared(entries: number, bytes: number, dir: string): string;
    /** Printed after a run that used the cache, so a hit is never silent. */
    used(hits: number, misses: number): string;
  };

  errors: {
    livePricingFailed: (url: string, detail: string) => string;
    optionNeedsValue(name: string): string;
    mustBeNonNegative(name: string, raw: string): string;
    badLevel(received: string): string;
    /** `--from-log`'s refusals: contradiction, missing label, ambiguity, emptiness. */
    allLabelsNeedsLog(): string;
    allLabelsNeedsMap(): string;
    fromLogConflict(flag: string): string;
    fromLogNeedsLabel(available: string): string;
    fromLogAmbiguousLabel(target: string, labels: string): string;
    fromLogLabelEmpty(label: string, available: string): string;
    unknownRuleInDisable(id: string): string;
    unknownCommand(command: string): string;
    unknownFlag(name: string, allowed: string): string;
    unknownFlagDidYouMean(name: string, suggestion: string): string;
    missingInputFile(): string;
    llmNotConfigured(): string;
    applyNeedsSuggest(): string;
    exactTokensNeedsKey(): string;
    /**
     * `provider` is null when the model is not in the price catalogue at all —
     * a different mistake from asking for an exact count on a family Trazum
     * cannot count, and told as a different sentence.
     */
    exactTokensWrongFamily(model: string, provider: string | null): string;
    checkNeedsMaxTokens(): string;
    evalNeedsCases(): string;
    evalNoCases(path: string): string;
    unknownExportFormat(received: string, allowed: string): string;
    diffNeedsTwoFiles(): string;
    cannotNegate(name: string): string;
    noPromptsFound(directory: string, extensions: string): string;
    noBudgetsApply(directory: string, configFile: string): string;
    baselineMissing(path: string): string;
    baselineTooBig(path: string, limit: number): string;
    errorLabel(): string;
  };

  report: {
    inputTokens(): string;
    /**
   * @param offFamily Provider name when the model is not the family the
   * estimator was calibrated on, otherwise null.
   */
    estimated(offFamily: string | null): string;
    exactCount(): string;
    rulesApplied(): string;
    nothingToTrim(): string;
    /** The languages the phrase dictionaries cover, printed when nothing fired. */
    dictionaryCoverage(languages: string): string;
    levelAggressive(): string;
    levelSafe(): string;
    ruleHits(hits: number, tokensSaved: number): string;
    moreChanges(count: number): string;
    llmPass(): string;
    examplesReview(): string;
    examplesReviewNote(provider: string, model: string, count: number): string;
    exampleRedundant(redundant: number[], keep: number): string;
    llmApplied(provider: string, model: string, before: number, after: number): string;
    llmRejected(reason: string): string;
    costWith(modelName: string): string;
    usageLine(calls: string, outputTokens: number, batch: boolean): string;
    /**
     * `--from-log`: the usage line names its provenance. Measured and typed
     * are different claims about the same multiplication, and under the week
     * floor nothing says "month".
     */
    /**
     * `--all-labels`: every mapped prompt against its own measured traffic,
     * ranked by what the change is worth, with both coverage mismatches named.
     */
    allLabelsHeading(count: string): string;
    allLabelsRow(saving: string): string;
    allLabelsRowPeriod(saving: string): string;
    allLabelsFooter(): string;
    allLabelsUnmapped(label: string, usd: string): string;
    allLabelsDead(label: string, path: string): string;
    allLabelsUnreadable(label: string, path: string): string;
    usageLineMeasured(calls: string, days: string, scaled: string, outputTokens: number, batch: boolean): string;
    usageLineMeasuredPeriod(calls: string, days: string | null, outputTokens: number, batch: boolean): string;
    measuredModelShare(model: string, share: string, count: string): string;
    measuredNoOutput(): string;
    perPeriodSaving(saving: string, pct: string): string;
    periodNotScaled(days: string | null): string;
    perMonthSaving(saving: string, pct: string): string;
    beyondShortening(): string;
    biggestLever(): string;
    biggestLeverDetail(title: string, amount: string, times: number | null): string;
    perMonthSuffix(amount: string): string;
    diff(): string;
    tokensOnlyHeading(host: string): string;
    tokensOnlyWhy(host: string): string;
    tokensOnlyAsked(): string;
    tokensSaved(tokens: string): string;
    windowUse(before: string, after: string, model: string, window: string): string;
    /**
     * The prompt is a rounding error against the window.
     *
     * Distinct from `windowUnmoved`: both shares rounding to the same string can
     * mean "this prompt is nothing against a million tokens" or "this prompt is
     * 10% of the window and one token did not move it". The first version used
     * one message for both and told a reader holding 10% of the window that they
     * were under a tenth of a percent.
     */
    windowNegligible(tokens: string, model: string, window: string): string;
    /** A material share the change did not move. */
    windowUnmoved(share: string, model: string, window: string): string;
    /**
     * Where the money actually is, said at the front door.
     *
     * `optimize` is the first command anybody runs and it reports the smallest
     * line item on the bill — measured, about 1%. Everything that moves 40% to
     * 80% lives in `profile`, which needs a usage log, which a new reader does
     * not have and has no reason to go looking for. A tool that learned the
     * truth and only tells it in the command you reach last has not told you.
     */
    beyondThisPrompt(): string;
    /**
     * The same pointer where the host bills by subscription.
     *
     * Deliberately does not list the metered levers. `tokens-only.test.js` refuses
     * any mention of the Batch API on a flat plan — "use a cheaper model" is not
     * weaker advice there, it is not advice — and a closing note that recited them
     * would put money advice in front of the reader that guard exists to protect,
     * however carefully it was hedged.
     */
    beyondThisPromptTokensOnly(): string;
    tokensOnlyCost(): string;
    /**
     * They named a scenario and the host withheld the money anyway.
     *
     * `--cost` stays the one way to ask, because `--calls` is a scenario
     * parameter with a default that several commands take purely to size a
     * finding. But answering somebody who typed `--calls 50000` with "pass
     * --cost if this prompt is bound for a metered API" tells them to do the
     * thing they plainly just tried to do.
     */
    tokensOnlyAskedFor(): string;
    diffTooLarge(lines: number, max: number): string;
    reorderHeading(): string;
    reorderMoved(blocks: number, tokens: string): string;
    reorderPrefix(before: string, after: string): string;
    reorderDeclined(count: number): string;
    reorderDeclinedRef(phrase: string, excerpt: string): string;
    reorderDeclinedAfter(excerpt: string): string;
    reorderDeclinedScript(script: string): string;
    reorderDeclinedMore(count: number): string;
    /** One line to stderr when a redirect suppresses the report. */
    reorderPiped(moved: number, tokens: string, declined: number): string;
    reorderNothing(): string;
    reorderReview(): string;
    suggestHeading(): string;
    suggestOffered(count: number, tokens: string): string;
    suggestApplied(count: number, tokens: string): string;
    suggestNothing(provider: string, model: string): string;
    suggestRejected(count: number): string;
    suggestRemoved(): string;
    suggestHowToApply(): string;
    pricingOverlaid(models: string, lastReviewed: string): string;
    wroteTo(path: string): string;
  };

  /**
   * The first run.
   *
   * Every string here is either something that was *found* or something that
   * was *declined with what would settle it*. There is deliberately no
   * congratulation copy and no next-steps list: a first run that celebrates
   * itself before showing a number is the shape people have learned to skip.
   */
  init: {
    heading(): string;
    host(name: string): string;
    prompts(count: number): string;
    noPrompts(): string;
    sourcesTruncated(cap: number): string;
    usageFound(kind: string, where: string): string;
    noUsage(): string;
    usageUnreadable(where: string, because: string): string;

    configHeading(): string;
    nothingJustified(): string;
    whyLocale(locale: string): string;
    whyExtensions(extensions: string, files: number): string;
    whyModelMeasured(model: string, sharePct: number): string;
    whyModelSource(model: string, file: string, line: number): string;
    whyCalls(perMonth: number, calls: number, days: number): string;
    whyOutput(average: number, outputTokens: number, calls: number): string;
    whyCache(rate: number, cacheReadTokens: number, inputTokens: number): string;

    noModelEvidence(): string;
    modelConflict(files: string): string;
    modelProviderOnly(provider: string, file: string): string;
    nothingMeasured(): string;
    windowTooShort(days: number, minimum: number): string;
    undatedCalls(undated: number, calls: number): string;
    cacheNotRecorded(): string;
    batchOnlyYouKnow(): string;
    labelsUnprovable(labels: number): string;
    budgetIsPolicy(): string;
    budgetIsPolicyMeasured(usd: string, days: number): string;

    findingHeading(): string;
    noFinding(why: string): string;
    findingCalls(calls: string, label: string, model: string, days: number): string;
    findingSpent(usd: string): string;
    findingRoute(model: string): string;
    findingBatch(): string;
    findingTotal(usd: string, days: number): string;
    findingNext(): string;

    wouldOverwrite(keys: string): string;
    nothingToWrite(): string;
    wouldWrite(path: string): string;
    wrote(path: string): string;
    existingRefused(path: string): string;
    existingUnparseable(path: string): string;
  };

  /**
   * The conformance check.
   *
   * Two halves, and the copy keeps them apart everywhere: problems gate, gaps
   * do not. Choosing not to log sessions is a decision, not a defect.
   */
  /**
   * Where to say something, and the standing fact that this command sends
   * nothing. The second half is not decoration: a tool that offers to help you
   * file a report is exactly the shape of a tool that phones home, and the
   * only way to be believed is to say so where somebody is looking.
   */
  /**
   * The proxy in the path. Every line here is either a promise about what it
   * will not do, or the standing it is judging against — because a component
   * between somebody and their provider is trusted on nothing but what it says
   * plainly at start-up.
   */
  /**
   * The ladder. Every line here exists to stop somebody reading "we route to
   * the cheap model first" as a saving without the number that decides it.
   */
  annual: {
    heading(year: string): string;
    needsYear(): string;
    spent(usd: string, calls: string, months: string): string;
    missing(months: string): string;
    promises(planned: string, arrived: string, notArrived: string, cannotTell: string): string;
    projected(usd: string): string;
    noArrivedFigure(): string;
    outcomes(recorded: string, parsed: string, unrecordedUsd: string): string;
    noOutcomes(): string;
    cannotSayHeading(): string;
    cannotSay(kind: string): string;
    noNewData(): string;
  };

  commitment: {
    heading(floor: string, discount: string, months: string): string;
    needsTerms(): string;
    asIf(): string;
    columns: { month: string; list: string; paid: string; saving: string };
    net(usd: string, months: string): string;
    good(usd: string): string;
    lost(usd: string, months: string): string;
    noShortfall(): string;
    breakEven(usd: string): string;
    spread(low: string, high: string, median: string): string;
    shortTerm(covered: string, term: string): string;
    cannotTell(why: string, needed: string): string;
    neverAForecast(): string;
  };

  owners: {
    heading(): string;
    noOwners(): string;
    columns: { owner: string; spend: string; budget: string; calls: string };
    verdict(kind: string): string;
    unallocated(usd: string, share: string, labels: string): string;
    neverSpread(): string;
    nothingUnallocated(): string;
    sharedHeading(): string;
    sharedRule(label: string, rule: string): string;
    problemsHeading(): string;
    problem(kind: string, detail: string): string;
    notMeasured(owner: string): string;
  };

  semantic: {
    heading(path: string): string;
    willCost(usd: string, input: string, output: string, model: string): string;
    needsYes(): string;
    finding(kind: string, because: string): string;
    span(line: string, text: string): string;
    ceiling(tokens: string): string;
    noCeiling(): string;
    nothingFound(): string;
    rejected(count: string): string;
    rejectedLine(reason: string, span: string): string;
    disposes(): string;
    optIn(): string;
  };

  quality: {
    heading(label: string): string;
    needsLabel(): string;
    needsAt(): string;
    sides(beforeRate: string, afterRate: string, before: string, after: string): string;
    dropped(from: string, to: string, outcomes: string, cost: string): string;
    held(from: string, to: string, outcomes: string): string;
    cannotTell(why: string, need: string): string;
    confounder(kind: string, detail: string): string;
    confoundersHeading(): string;
    notRandomised(): string;
    cannotSee(): string;
    gateFailed(): string;
    gateHeldOpen(): string;
  };

  experiment: {
    heading(a: string, b: string): string;
    needsTwo(): string;
    needsRule(): string;
    arm(name: string, rate: string, successes: string, recorded: string, interval: string): string;
    wins(name: string, low: string, high: string): string;
    notSeparable(why: string, needed: string): string;
    peeked(short: string, declared: string, recorded: string): string;
    honoured(declared: string): string;
    marginalDearer(better: string, usd: string): string;
    marginalCheaper(better: string): string;
    neverPromotes(): string;
  };

  ladder: {
    heading(): string;
    noLadders(): string;
    workload(label: string): string;
    arithmetic(cheap: string, dear: string, breakEven: string): string;
    measured(rate: string, escalations: string, calls: string): string;
    saving(delta: string): string;
    costing(delta: string): string;
    atBreakEven(band: string): string;
    cannotTell(why: string, calls: string): string;
    problem(kind: string, detail: string): string;
    problemsHeading(label: string): string;
    theDoubleSpend(): string;
    notExecuted(): string;
  };

  gateway: {
    badProvider(given: string, known: string): string;
    pricedNotFronted(given: string, known: string): string;
    needsPolicy(policies: string): string;
    listening(where: string, provider: string): string;
    unmeasured(cause: 'stream-broke' | 'no-usage-event' | 'no-usage-in-body', sofar: number): string;
    pointYourSdk(where: string): string;
    credential(): string;
    neverSubstitutes(): string;
    standing(consumed: string, limit: string): string;
    noStanding(): string;
    policy(policy: string): string;
    measured(model: string, label: string | null, input: number, output: number, substituted: boolean): string;
  };

  feedback: {
    heading(): string;
    sendsNothing(): string;
    whereHeading(): string;
    wrongOptimisation(): string;
    bug(): string;
    question(): string;
    security(): string;
    environmentHeading(): string;
    environmentOnly(): string;
    linkHeading(): string;
  };

  conform: {
    noTarget(): string;
    badContract(given: string, known: string): string;
    unrecognised(path: string): string;
    heading(path: string, contract: string): string;
    headingLog(path: string, contract: string, records: number): string;
    conforms(): string;
    problem(at: string, kind: string, detail: string): string;
    moreProblems(count: number): string;
    unavailableHeading(): string;
    unavailable(finding: string, because: string, unlockedBy: string): string;
    unavailableNeverGates(): string;
  };

  rollup: {
    noTargets(): string;
    noSuchTarget(path: string): string;
    emptyDirectory(path: string): string;
    heading(contributors: number, usd: string, calls: number): string;
    span(from: string, to: string): string;
    noSpan(): string;
    contributorsHeading(): string;
    contributor(name: string, usd: string, calls: number, spanDays: number | null): string;
    claimedSpan(from: string, to: string, contributors: number): string;
    claimedRow(from: string, to: string): string;
    silentRuns(runs: string): string;
    undated(count: number): string;
    rejectedHeading(): string;
    rejected(name: string, because: string): string;
    via(rollup: string): string;
    rejectedVia(name: string, via: string, because: string): string;
    repeated(names: string): string;
    identical(names: string): string;
    identicalUsd(usd: string): string;
    byLabelHeading(): string;
    labelRow(label: string, usd: string, calls: number): string;
    notMergedHeading(): string;
    notMerged(finding: string, because: string): string;
    presentIn(names: string): string;
    cannotSayHeading(): string;
    caveat(code: string): string;
  };

  pulse: {
    heading(): string;
    kind(kind: string): string;
    neverRun(name: string): string;
    age(name: string, when: string, hours: number): string;
    noThreshold(): string;
    within(hours: number): string;
    stale(hours: number): string;
    notAService(): string;
  };

  where: {
    hostHeading(): string;
    subscription(host: string): string;
    noTarget(): string;
    sourceHeading(path: string): string;
    conflict(): string;
    conflictFallback(): string;
    nothingFound(): string;
    providerOnly(): string;
    evidenceLine(line: number, kind: string, detail: string): string;
    pricedAs(): string;
    fromConfig(): string;
    fromDetection(): string;
    fromProviderDefault(provider: string): string;
    fromDefault(): string;
  };

  pricing: {
    liveLoaded: (added: number, refreshed: number, skipped: number) => string;
  };

  models: {
    title(): string;
    unit(): string;
    /** `days` is null when the date is unusable or in the future. */
    reviewedOn(date: string, days: number | null): string;
    columns: {
      model: string;
      input: string;
      output: string;
      context: string;
      cacheMin: string;
    };
    promoNote(): string;
    cacheNote(): string;
    batchNote(): string;
  };

  /** Language names for the coverage note, plus the conjunction that joins them. */
  languages: Record<string, string> & { and: string };

  rules: {
    title(): string;
    disableHint(): string;
  };

  /** `trazum rank` — which prompts to fix first, and why. */
  rank: {
    heading(root: string, count: number): string;
    subheading(model: string, calls: string): string;
    columns: {
      recoverable: string;
      tokensBack: string;
      tokens: string;
      density: string;
      notes: string;
    };
    noteExamples(count: number, tokens: string): string;
    noteFormat(tokens: string): string;
    noteProtected(pct: number): string;
    skipped(count: number): string;
    densityNote(): string;
    recoverableNote(): string;
  };

  /** `trazum blame` — how a prompt's cost moved over its git history. */
  blame: {
    heading(path: string, revisions: number): string;
    notARepository(): string;
    outsideRepository(path: string): string;
    noHistory(path: string): string;
    gitMissing(): string;
    columns: { when: string; tokens: string; change: string; who: string; commit: string };
    /** The line under the table: net movement across the whole history. */
    net(first: string, last: string, delta: string, pct: string): string;
    netCost(amount: string, model: string, calls: string): string;
    biggestRise(): string;
    biggestRiseDetail(tokens: string, author: string, subject: string, sha: string): string;
    addedAt(): string;
    goneAt(): string;
    truncated(shown: number): string;
    followedRename(from: string): string;
    estimateNote(): string;
  };

  /** `trazum doctor` — the survey across a whole workspace. */
  doctor: {
    heading(root: string, prompts: number): string;
    subheading(model: string, calls: string): string;
    pricesReviewed(date: string, days: number | null): string;
    budgetsHeading(): string;
    everyPromptBudgeted(count: number): string;
    unbudgeted(count: number, total: number): string;
    overBudget(count: number): string;
    andMore(count: number): string;
    findingsHeading(): string;
    acrossPrompts(count: number): string;
    findingsNote(): string;
    notAGate(): string;
    sharedPrefixHeading(): string;
    sharedPrefixGroup(count: number, tokens: string, drift: 'whitespace' | 'wording'): string;
    sharedPrefixFix(drift: 'whitespace' | 'wording'): string;
    sharedPrefixNoFigure(): string;
  };

  prune: {
    needsExamples(): string;
    estimate(examples: number, cases: number, calls: number): string;
    needsConsent(): string;
    heading(model: string): string;
    selfAgreement(pct: string): string;
    line(n: number, tokens: number, pct: string): string;
    verdictNeeded(): string;
    verdictRecoverable(): string;
    verdictUnknown(): string;
    recoverable(tokens: number): string;
    caveat(): string;
  };

  eval: {
    nothingToCompare(): string;
    starting(cases: number, calls: number, model: string): string;
    heading(): string;
    selfAgreement(pct: string): string;
    crossAgreement(pct: string): string;
    verdict(kind: EvalVerdict): { label: string; detail: string };
    mostChanged(): string;
    caseAgreement(cross: string, self: string): string;
    callsMade(count: number): string;
    exportWarnings(count: number): string;
    exportWrote(path: string, cases: number, assertions: number): string;
  };

  diff: {
    heading(before: string, after: string): string;
    measuringOptimised(): string;
    monthly(delta: string, calls: string, model: string): string;
    advisoriesAppeared(): string;
    advisoriesResolved(): string;
    rulesNewlyFiring(): string;
    rulesNoLongerFiring(): string;
    overLimit(delta: number, max: number): string;
    /** `--all`: the same gate, per prompt rather than on the total. */
    someOverLimit(count: number, max: number): string;
    allSubheading(prompts: number): string;
    allTotal(delta: string, prompts: number): string;
    signConvention(): string;
    onlyBefore(): string;
    onlyAfter(): string;
    onlyOneSideNote(): string;
  };

  /**
   * Copy for the markdown reports written by `--markdown-out`.
   *
   * A separate section rather than reuse of `check`/`diff`, because the terminal
   * and a pull request are read differently: the terminal reader ran the
   * command and knows what they asked for, the pull-request reader arrived at a
   * comment with no context and needs the sign convention spelled out.
   */
  markdown: {
    checkHeading(target: string): string;
    /** The cost-diff block a pull-request comment leads with. */
    baselineGrew(delta: string, pct: string): string;
    baselineShrank(delta: string, pct: string): string;
    baselineUnchanged(): string;
    baselineOverLimit(limits: string): string;
    baselineLimitTokens(limit: string): string;
    baselineLimitPct(limit: string): string;
    baselineColumnBefore(): string;
    baselineColumnAfter(): string;
    baselineMoney(before: string, after: string, delta: string): string;
    baselineMoneyIncomparable(): string;
    baselineReRecord(command: string, path: string): string;
    diffHeading(before: string, after: string): string;
    rankHeading(root: string, count: number): string;
    blameHeading(path: string): string;
    /** The level the recoverable figures were measured at. */
    rankLevel(level: RuleLevel): string;
    columnFile(): string;
    columnTokens(): string;
    columnBudget(): string;
    columnMetric(): string;
    columnChange(): string;
    allWithin(budgeted: number): string;
    overBudget(failures: number, budgeted: number): string;
    noBudget(): string;
    unbudgetedNote(count: number): string;
    whatWouldHelp(): string;
    wouldFit(level: string, optimizedTokens: string): string;
    stillTooBig(optimizedTokens: string): string;
    truncated(): string;
    footer(source: string, level: string): string;
    pricingOverlaid(count: number, lastReviewed: string): string;
    sourceEstimated(): string;
    sourceExact(): string;
    measuringOptimised(): string;
    metricTokens(before: string, after: string): string;
    metricMonthly(calls: string, model: string): string;
    deltaConvention(): string;
    advisoriesAppeared(): string;
    advisoriesResolved(): string;
    rulesNewlyFiring(): string;
    rulesNoLongerFiring(): string;
    collapsedNote(): string;
    trimNotice(): string;
    commentTitle(): string;
  };

  check: {
    okLabel(): string;
    failedLabel(): string;
    embeddedHeading(path: string, count: number): string;
    declinedHeading(count: number): string;
    declinedAt(line: number, detail: string): string;
    ok(tokens: string, budget: string): string;
    failed(tokens: string, budget: string): string;
    wouldFit(level: string, optimizedTokens: string): string;
    stillTooBig(optimizedTokens: string): string;
    directoryHeading(directory: string, files: number): string;
    directorySummary(failures: number, files: number): string;
    noBudget(): string;
    walkTruncated(): string;
    exactCountsCost(files: number): string;
  };

  /**
   * The cost baseline: recording one, and reporting drift from it.
   *
   * Separate from `check` because it answers a different question — "did this
   * get worse" rather than "does this fit" — and both verdicts appear in the
   * same run.
   */
  profile: {
    noTarget(): string;
    heading(): string;
    /**
     * Totals line: calls and the bill they came to.
     *
     * `calls` arrives already agreeing with its noun — "1 call", "2,400 calls".
     * The count and the word have to be built together or one language gets it
     * right and the next does not, and `1 calls` was reachable on an ordinary
     * one-call log.
     */
    spent(calls: string, total: string): string;
    /** A count of calls with its noun, agreeing. */
    calls(count: number): string;
    /** One row of the split, with its share of the bill. */
    part(name: string, usd: string, pct: string, tokens: string): string;
    partInput(): string;
    partCacheRead(): string;
    partCacheWrite(): string;
    partOutput(): string;
    byLabelHeading(): string;
    byModelHeading(): string;
    row(name: string, usd: string, pct: string, calls: string): string;
    unlabelled(): string;
    cacheHit(pct: string): string;
    cacheNever(): string;
    /**
     * Caching added to the bill instead of taking money off it.
     *
     * The finding no other command in this repository can produce, and the only
     * one that can contradict Trazum's own advice: on Anthropic a cache write is
     * billed at 1.25x plain input, or 2x at the 1-hour TTL, so a prefix that
     * changes faster than it is reused costs a premium and returns nothing.
     */
    cacheLost(usd: string, writes: string, reads: string): string;
    cachePaidOff(usd: string): string;
    cacheNoDifference(): string;
    /** Which labels the loss is in, when the total already reports one. */
    cacheLostBy(labels: string): string;
    /**
     * A label bleeding underneath a total that reports no loss.
     *
     * Deliberately says nothing about what the total did. It runs under both
     * `paid-off` and `no-difference`, and the version that opened "Caching pays
     * off overall" printed that claim directly beneath a line saying caching had
     * come out level.
     */
    cacheLostHidden(usd: string, labels: string): string;
    /** Losing labels past the ones named, counted rather than dropped. */
    andMoreLabels(count: number): string;
    /**
     * The log cannot say whether caching paid for itself.
     *
     * An unrecorded cache-write TTL is priced at the cheaper of the two rates, and
     * that moves the verdict rather than only the total: between 0.28 and 1.11
     * reads per write the same calls pay for themselves at 1.25x and lose money at
     * 2x. Reporting the assumed half as an answer takes the flattering side of a
     * question the data does not settle.
     */
    cacheTtlUnsettled(calls: number, asRecorded: string, atLongTtl: string): string;
    /** Same verdict either way, but the figure beside it is a bound. */
    cacheTtlBound(calls: number, atLongTtl: string): string;
    /** Labels that lose money only if their unstated TTL was the long one. */
    cacheTtlUnsettledLabels(labels: string): string;
    /** The finding the whole command exists to produce. */
    biggestPart(name: string, pct: string): string;
    outputDominates(pct: string): string;
    unpriced(models: string, calls: number): string;
    skipped(count: number, lines: string): string;
    empty(): string;
    nothingPriced(): string;
    /**
     * The section the whole command builds towards.
     *
     * Trazum's rules recover about 1% of a bill. Which model a call goes to moves
     * 40% to 80%, and the Batch API moves 50% flat. A report that shows where the
     * money went and then stops is a report that leaves the reader with the
     * smallest lever in their hand.
     */
    leversHeading(): string;
    /**
     * One slice, with what everything on it comes to **together**.
     *
     * The headline is the combined figure and not a sum of the options below it:
     * batching a routed call discounts the cheaper model's price, not the one you
     * left. Printing the options as separate rows produced $12.60 and $10.50
     * against a slice that had spent $21.00.
     */
    leverSlice(label: string, model: string, usd: string, pct: string): string;
    leverRoute(candidate: string, usd: string): string;
    /**
     * The command that settles it.
     *
     * It used to name `trazum eval --model <candidate>`, which does not do what
     * that sentence claims: `eval` runs against whatever `TRAZUM_LLM_MODEL` says
     * and `--model` only prices the report. The instruction sent the reader to a
     * measurement that never touched the candidate model.
     */
    leverRouteVerify(candidate: string): string;
    leverBatch(usd: string): string;
    /** How many calls the slice covers, so the reader can judge the effort. */
    leverCalls(calls: string, spent: string): string;
    /**
     * The ceiling on shortening prompts, printed beside the levers on purpose.
     *
     * A 1% win reported without saying 1% of what is not information. This is the
     * comparison that makes the rest of the report honest about its own value.
     */
    leverPromptCeiling(usd: string, pct: string): string;
    /** Nothing cleared the threshold, which is a real answer. */
    leversNone(): string;
    /**
     * The log carries no labels, so every lever describes a mixture.
     *
     * A classifier and a RAG workload with no label between them merge into one
     * slice, and the report then recommends a single route for two workloads that
     * need different answers. The session case already says "add the field"; this
     * one said nothing, and the row is named `unlabelled` as though that were a
     * workload.
     */
    leversUnlabelled(): string;
    /**
     * What re-sending the conversation costs.
     *
     * On an agent bill this is routinely the largest line, and nothing in this
     * tool could see it: a prompt file shows the system prompt and not the
     * history, and a total shows the sum and not the shape.
     */
    historyHeading(): string;
    historyGrowth(label: string, model: string, first: string, last: string, turns: string): string;
    /** A ceiling, and it says so — part of the growth is the user's own messages. */
    historyCeiling(usd: string, pct: string, flat: string, spent: string): string;
    /** No session field in the log, so the question cannot be asked. */
    historyNoSessions(): string;
    /**
     * Output spend that bought answers cut off mid-generation.
     *
     * The one category of a bill that is waste without a counterpart: a
     * truncated answer was paid for in full, is frequently retried — billed
     * again — and the cut attempt bought nothing. Output is the largest line on
     * most bills, and this is the slice of it nobody sees.
     */
    truncatedWaste(calls: string, usd: string, pct: string): string;
    /** The log carries no stop reason, so the question cannot be asked. */
    truncatedNotRecorded(): string;
    /**
     * This bill against the previous one — how spend actually gets out of hand.
     *
     * Nobody adds five thousand a month in one day; bills grow four percent a
     * week while every snapshot looks reasonable. Comparing two logs is the
     * baseline gate the prompts already had, applied to the money itself.
     * **Positive means the bill grew** — the diff convention, not the savings
     * one — and every figure is between exactly these two files: no periods are
     * assumed, so the call counts print beside the money for the reader to
     * judge comparability.
     */
    againstHeading(): string;
    againstTotals(before: string, after: string, delta: string, pct: string, callsBefore: string, callsAfter: string): string;
    /** One label's contribution to the change. */
    againstDriver(delta: string, label: string, before: string, after: string): string;
    againstDriverNew(delta: string, label: string): string;
    againstDriverGone(delta: string, label: string): string;
    /**
     * Lead-in for the change split by model — where the mix moved. A workload
     * that kept its name and switched models reads as "chat grew" in the
     * label rows; only this section can say the reason is the model.
     */
    againstByModel(): string;
    againstNothingPriced(): string;
    /**
     * Why a label's cache is failing, read from its mapped prompt file.
     *
     * `profile` alone can only say *that* caching loses money on a label — the
     * log carries counts, not content. With `labels` in the config it reads the
     * named file and says why. The file is whatever the repository holds today,
     * which may not be what produced the log, and the sentence says so rather
     * than presenting a fresh file as the history's explanation.
     */
    labelPrefixBelowMinimum(file: string, prefix: string, minimum: string, model: string): string;
    labelPrefixMovable(file: string, movable: string, prefix: string): string;
    labelPrefixHealthy(file: string, prefix: string, minimum: string): string;
    labelFileMissing(label: string, file: string): string;
    /**
     * Where the output spend concentrates — the actionable half of "output
     * dominates". A tail worth hunting and a task whose answers are inherently
     * long produce the same total, and only the shape tells them apart.
     */
    outputShapeHeading(): string;
    /** A tail: a small share of calls holds half the spend. */
    outputTail(label: string, model: string, callPct: string, spendPct: string, above: string, usd: string): string;
    outputTailAdvice(): string;
    /** Flat: the spend is where the calls are, and the length is the task. */
    outputFlat(label: string, model: string, callPct: string, spendPct: string, usd: string): string;
    outputFlatAdvice(): string;
    /**
     * Bucket ceilings, exact over the histogram: the number somebody setting
     * max_tokens actually wants, measured on these calls and promised for
     * nothing.
     */
    outputPercentiles(p50: string, p95: string): string;
    /**
     * How big the calls themselves are — the other half of the bill.
     *
     * Both figures are bucket ceilings, so the ratio between them is coarse
     * by construction; the copy says "about". Loud past four times the
     * median, a presentation threshold stated in the sentence.
     */
    inputShapeHeading(): string;
    inputSkewed(
      label: string,
      model: string,
      p50: string,
      p95: string,
      ratio: string,
      usd: string,
    ): string;
    inputSkewedAdvice(): string;
    inputEven(label: string, model: string, p50: string, p95: string, usd: string): string;
    inputEvenAdvice(): string;
    /** Every call above the widest bucket edge, so no ceiling can be named. */
    inputHuge(label: string, model: string, calls: string, usd: string): string;
    inputMostlyCached(share: string): string;
    /**
     * Consecutive calls in one conversation carrying the same input size,
     * seconds apart — a retry or a loop. Hedged on purpose: this reads counts
     * and cannot see content, so the pattern is stated and the conclusion is
     * left to the reader.
     */
    repeatsHeading(): string;
    repeatsFound(
      label: string,
      model: string,
      repeats: string,
      checked: string,
      seconds: string,
      usd: string,
    ): string;
    repeatsAdvice(): string;
    /**
     * The largest call against the model's context window. Loud from 85%,
     * quiet from 50% — thresholds in the rendering, the ratio in core. No
     * prediction of when the ceiling is crossed, ever: the share is a fact
     * and the trajectory is the reader's to know.
     */
    pressureHeading(): string;
    pressureLine(label: string, model: string, tokens: string, window: string, share: string): string;
    pressureAdvice(): string;
    /**
     * The mix moving inside one log: a model's share of spend in the first
     * half of the days against the last half. Spoken only past fifteen
     * points of movement — a presentation threshold, stated in the sentence
     * — and never as a forecast: where the mix goes next is not in the log.
     */
    mixDriftHeading(): string;
    mixDriftLine(
      model: string,
      firstShare: string,
      lastShare: string,
      firstDays: string,
      lastDays: string,
      lastUsd: string,
    ): string;
    mixDriftNote(): string;
    /**
     * The "billed again" half of truncation, measured: cut answers followed
     * inside the window by another call in the same conversation, priced on
     * both sides, with the checkable denominator. A pattern, not a
     * certainty — the log cannot see content.
     */
    truncationRetryLine(
      label: string,
      model: string,
      retried: string,
      truncated: string,
      seconds: string,
      wasted: string,
      retry: string,
    ): string;
    truncationRetryNote(): string;
    inputFullRate(): string;
    assumedWriteTtl(calls: number): string;
    /**
     * The period the log covers, when its records carry a clock. Stated and
     * never extrapolated: naming the span makes the reader's own monthly
     * arithmetic valid, while a per-month figure from a partial month would be
     * this tool doing the guessing it exists to end.
     */
    spanLine(from: string, to: string, days: string): string;
    /** Appended when only part of the log carries a timestamp. */
    spanPartial(withTs: string, total: string): string;
    /**
     * Whether the cache TTL fits how fast the turns arrive — the mechanism
     * behind a losing cache, and the only place an overlong TTL is visible.
     * Four verdicts plus "could not be measured": the same three-state
     * discipline as truncation, because "no data" and "fits" are different
     * answers.
     */
    ttlFitExpires(label: string, model: string, gap: string): string;
    ttlFitExpiresBoth(label: string, model: string, gap: string): string;
    ttlFitOverlong(label: string, model: string, gap: string, usd: string): string;
    ttlFitUnsettledGap(label: string, model: string, gap: string): string;
    ttlFitFits(label: string, model: string, gap: string): string;
    ttlFitUnmeasured(): string;
    /**
     * The most expensive day against the median day — the shape of the bill
     * over time, which the total hides. The 2x-median threshold that makes it
     * loud is stated in the sentence, never hidden in code.
     */
    dayPeak(day: string, usd: string, xMedian: string): string;
    dayPeakLabel(label: string, usd: string): string;
    /**
     * The money gates. `check` gates tokens before spending; these gate the
     * spend itself, over exactly the log handed in — no period assumed.
     */
    maxUsdOk(total: string, max: string): string;
    maxUsdFailed(total: string, max: string): string;
    maxGrowthUsdFailed(delta: string, max: string): string;
    maxGrowthNeedsAgainst(): string;
    /**
     * The cache gate reads the worst case on purpose: a gate reading the
     * flattering half of an unsettled verdict would pass exactly the bills
     * it exists to catch. Two failure messages, because a settled loss and a
     * ceiling the missing TTL field could settle are different instructions.
     */
    maxCacheLossOk(worst: string, max: string): string;
    maxCacheLossFailed(delta: string, max: string): string;
    maxCacheLossWorstCase(calls: number, worst: string, max: string): string;
    /**
     * The per-day gate — the one a total cannot arm. A month under budget
     * hides the afternoon a loop burned a quarter of it, and the worst single
     * UTC day is the shape that has. A log with no clock cannot be judged by
     * day and fails: "not measured" is not "under budget".
     */
    maxDayOk(day: string, usd: string, max: string): string;
    maxDayFailed(day: string, usd: string, max: string): string;
    maxDayNoClock(): string;
    maxDayUndated(calls: string): string;
    /**
     * The per-conversation gate. The single most expensive conversation is
     * the number a per-conversation policy judges; a log with no sessions
     * fails, and a conversation that started before the log makes the pass
     * a floor — said in the pass message. The session key never appears.
     */
    maxSessionOk(worst: string, max: string, sessions: string): string;
    maxSessionFailed(worst: string, max: string, sessions: string): string;
    maxSessionNoSessions(): string;
    /**
     * The price table behind every dollar in the report, when it is old
     * enough to matter. Unlike a skipped line, staleness does not name its
     * own size — the error is exactly whatever the provider changed.
     */
    pricesStale(date: string, days: number): string;
    /**
     * The spend-per-day table in the markdown rendering — the series the
     * peak sentence summarises. Truncation is counted out loud: silent
     * truncation reads as "covered everything" when it did not.
     */
    dayTableDay(): string;
    dayTableCalls(): string;
    dayTableTop(): string;
    dayTableEarlier(days: number): string;
    /**
     * A gate can only judge the money it can see. When lines were unreadable,
     * models unpriced, or clockless calls left outside a window, the gated
     * figure is a floor — and passing on a floor silently is the flattering
     * omission this repository refuses.
     */
    gateOnFloor(reasons: string): string;
    floorSkipped(lines: number): string;
    floorUnpriced(calls: number): string;
    floorUndated(calls: number): string;
    /**
     * Two logs whose periods intersect: part of the "growth" is the same
     * money on both sides of the subtraction. Only decidable when both logs
     * carry a clock; unknown stays silent rather than reassuring.
     */
    /**
     * What the comparison stopped being able to see. Dollars cannot tell a
     * fixed finding from a field the log stopped recording; only coverage can,
     * so the copy names the threshold and states the distinction.
     */
    /**
     * The comparison gate's refusal: the current log stopped recording a field
     * the previous one carried, so "did not grow" is a claim nobody could
     * check. "Not measured" is not "did not grow", as everywhere here.
     */
    /**
     * Why a gate failed and what would move it, from figures the report already
     * computed. Nothing here recommends: whether the cheaper model can do the
     * work is the reader's to judge, and the copy says so.
     */
    /**
     * Findings as policy. An active waiver silences one gate's exit code, on
     * the record, with the reason and the days left; an expired one silences
     * nothing and says so beside the failure it used to cover.
     */
    waiveActive(gate: string, reason: string, until: string, daysLeft: string): string;
    waiveExpired(gate: string, until: string, reason: string): string;
    /**
     * A use that could not be written down.
     *
     * Printed dim and never as an error: the gate's verdict is unaffected, and
     * a read-only checkout must not turn a passing build red on account of
     * bookkeeping.
     */
    waiveNotRecorded(path: string, because: string): string;
    /**
     * `--markdown-summary`: the short form for a pull-request body or a weekly
     * note. A view over the same report, never a different set of figures.
     */
    summaryNoComparison(): string;
    summaryFooter(): string;
    gateLargest(label: string, model: string, usd: string, share: string): string;
    gateLever(label: string, action: string, saving: string, overage: string, covers: boolean): string;
    /**
     * What the lever actually is. Split from the sentence because a slice with
     * only a batch price has no destination model, and naming the model it is
     * already on as somewhere to move it would be false.
     */
    gateLeverRoute(model: string): string;
    gateLeverBatch(): string;
    gateLeverBoth(model: string): string;
    gateMarginTight(margin: string, room: string): string;
    maxGrowthCoverageLost(fields: string, was: string, now: string): string;
    coverageField(field: string): string;
    /**
     * Which findings a collapsed field took with it. Named rather than left as
     * "some findings": a reader deciding whether to trust this report needs to
     * know exactly which sections are now silence rather than absence.
     */
    coverageSilenced(field: string): string;
    coverageDrift(field: string, was: string, now: string): string;
    coverageDriftWhy(): string;
    againstOverlap(from: string, to: string): string;
    /**
     * What one conversation costs — median against p95, never a mean: one
     * runaway loop would drag a mean up and hide the ordinary case, which is
     * the figure a per-seat price is set from.
     */
    sessionCost(
      label: string,
      model: string,
      sessions: string,
      median: string,
      medianTurns: string,
      p95: string,
      max: string,
    ): string;
    /** Said only when the p95 clears ten times the median — a real tail. */
    sessionCostTail(ratio: string): string;
    /**
     * The whole log's conversations when the per-slice percentiles refused:
     * count and single worst cost, stated because a maximum is a fact at any
     * count while a percentile over four conversations would be the largest
     * of four wearing a percentile's name.
     */
    sessionSpendOnly(sessions: string, max: string): string;
    /**
     * Per-workload budgets from the config. A budgeted label with no calls in
     * the log is "not measured", never a pass: a workload that did not appear
     * is not one that came in under budget.
     */
    labelBudgetOk(label: string, usd: string, max: string): string;
    labelBudgetFailed(label: string, usd: string, max: string): string;
    labelBudgetMissing(label: string): string;
    labelBudgetWindowed(): string;
    /**
     * A directory of rotated logs, read as one. How many files were read is
     * stated: a report over "the logs" that silently skipped one is a total
     * wrong by an unknown amount.
     */
    /**
     * Which workloads pay for truncated answers, and at what rate. The rate
     * is over calls that recorded a stop reason, never over all calls: a
     * workload that logs the field on half its traffic must not be reported
     * as though the unmeasured half completed.
     */
    /**
     * The shape of the UTC day: the fewest hours holding 80% of the spend.
     * Concentrated means somebody is waiting on those calls; flat means
     * background work, which is what the Batch API halves. Names the lever,
     * never claims the saving — whether a workload can wait is a product
     * decision counts cannot make.
     */
    /**
     * What the log cannot answer, and what would fix it. Counts rather than
     * booleans: twelve labelled records out of forty thousand is not a
     * labelled log, and a boolean would call it one. Only missing fields are
     * listed — a paragraph of things that are fine is the paragraph readers
     * learn to skip.
     */
    /**
     * The token budget against what the call actually carried. `budgets`
     * gates a prompt file; the log records the whole call. When the gap is
     * wide the gate is real but tiny, and a green build says nothing about
     * the other 96%.
     */
    /**
     * Lines identical to an earlier one, with a clock to make the claim safe.
     * States the count and the money and stops: whether it is a double export
     * or a busy millisecond is the reader's to know.
     */
    duplicateLines(count: number, usd: string): string;
    budgetVsWire(label: string, file: string, budget: string, perCall: string, share: string): string;
    /** `--csv-shape` naming a table that does not exist. */
    badCsvShape(value: string): string;
    /**
     * `--what-if <model>`: these exact calls at another model's rates.
     *
     * The assumption line prints before the figure on purpose — a dollar
     * amount with the caveat underneath is read as a recommendation with
     * small print, and this comparison knows nothing about whether the
     * cheaper model could do the work.
     */
    whatIfHeading(model: string): string;
    whatIfAssumption(): string;
    whatIfTotal(current: string, target: string, delta: string): string;
    whatIfCheaper(): string;
    whatIfDearer(): string;
    /**
     * Cache traffic the target's minimum would refuse: the standard repriced
     * figure grants discounted rates to entries that could not form, an error
     * in the flattering direction. The no-cache figure is the honest one.
     */
    /**
     * The moved bill with the target's Batch API on top — the routing
     * decision's other half, discounted on the target's rates and never
     * summed with the move.
     */
    whatIfBatchOnTarget(batched: string, moved: string): string;
    whatIfCacheBeyond(largest: string, min: string, noCache: string): string;
    whatIfSlice(label: string, model: string, current: string, target: string): string;
    /** A call the target's context window could not have accepted. */
    whatIfOverContext(label: string, tokens: string, window: string, usd: string): string;
    whatIfAlreadyThere(calls: string, usd: string): string;
    whatIfUnpriced(calls: string, models: string): string;
    whatIfNothingToMove(): string;
    /** `--what-if` naming a model the catalogue does not price. */
    whatIfUnknown(value: string, available: string): string;
    /**
      * A gzipped log that will not decompress. An error naming the file, not
      * a skip: a total quietly missing a day is the failure this refuses.
      */
    badGzip(file: string, detail: string): string;
    /**
     * `--dry-run`: readiness per capability, no bill. The question somebody
     * has before wiring CI, answered without making them read a report to
     * discover a missing field.
     */
    dryRunHeading(): string;
    dryRunParsed(parsed: string, skipped: string): string;
    dryRunUnpriced(models: string): string;
    dryRunTotals(): string;
    dryRunLabels(share: string): string;
    dryRunClock(share: string): string;
    dryRunSessions(share: string): string;
    dryRunStopReason(share: string): string;
    dryRunCacheTtl(ttl: string, writes: string): string;
    dryRunNoCacheTraffic(): string;
    dryRunFooter(): string;
    dryRunNoGates(): string;
    /**
     * `--by-source`: the fleet. One summary per service, the rollup naming
     * the worst offender, cross-source findings a merged bill cannot make,
     * and per-source budgets that fail naming the service.
     */
    bySourceNeedsConfig(): string;
    bySourceNothingMatched(sources: string): string;
    fleetHeading(count: string, total: string, calls: string): string;
    fleetRow(name: string, usd: string, share: string, calls: string, span: string): string;
    fleetSpan(days: string): string;
    fleetNoClock(): string;
    fleetWorst(name: string, usd: string, share: string): string;
    fleetMismatchedSpans(): string;
    fleetSplitBrain(label: string, detail: string): string;
    fleetCacheUnderwater(name: string, usd: string): string;
    fleetUnmatched(file: string): string;
    fleetFooter(): string;
    fleetBudgetOk(name: string, usd: string, max: string): string;
    fleetBudgetFailed(name: string, usd: string, max: string): string;
    fleetBudgetMissing(name: string): string;
    coverageHeading(): string;
    needsLabel(seen: string): string;
    needsSession(seen: string): string;
    needsOutcome(seen: string): string;
    dryRunOutcomes(share: string): string;
    outcomeHeading(): string;
    outcomeRate(rate: string, ofUsd: string): string;
    outcomeNoRate(why: string): string;
    outcomeUnrecorded(share: string, usd: string): string;
    outcomeUndeclared(values: string): string;
    perOutcomeHeading(): string;
    perOutcomeRow(key: string, perCall: string, perOutcome: string, coverage: string): string;
    perOutcomeColumns: { workload: string; perCall: string; perOutcome: string; recorded: string };
    perOutcomeWithheld(why: string, successes: string, coverage: string): string;
    perOutcomeNumerator(): string;
    perOutcomeDisagreement(key: string, callRank: string, outcomeRank: string): string;
    perOutcomeBothOrders(): string;
    outcomeColumns: { outcome: string; calls: string; spend: string };
    verdictSuccess(): string;
    verdictOther(): string;
    verdictUndeclared(): string;
    needsTs(seen: string): string;
    needsStopReason(seen: string): string;
    needsCacheTtl(seen: string): string;
    hoursConcentrated(hours: string, list: string): string;
    hoursFlat(hours: string): string;
    truncatedBy(label: string, calls: string, measured: string, rate: string, usd: string): string;
    /** What the answers that finished actually needed, for setting the cap. */
    truncatedCeiling(p95: string): string;
    readFiles(files: number, directory: string): string;
    noLogsInDirectory(directory: string, extensions: string): string;
    /**
     * The time window — the drill-down in time. Every figure below the line
     * describes a slice, so the line prints before any of them; clockless
     * calls under a window are excluded and *counted out loud*, because
     * dropping them silently would understate the period's bill invisibly.
     */
    windowLine(since: string, until: string): string;
    windowUndated(calls: number): string;
    /** A window over a log with no clock gates nothing, which is an error. */
    /**
     * A relative window is measured against the machine's clock, not the
     * log's — a real difference on an exported log, and one a reader who did
     * not name the dates would otherwise misread.
     */
    windowRelative(): string;
    windowRelativeEmpty(): string;
    windowNeedsClock(): string;
    /** A window matching nothing must not become a passing $0 gate. */
    windowMatchesNothing(from: string, to: string): string;
    sinceAfterUntil(): string;
    badWhen(flag: string, value: string): string;
    /**
     * Cache writes by conversations that ended after one turn. Two sentences
     * for the same tokens: a ceiling when the slice has reads (another
     * conversation sharing the prefix may have read the write — the log
     * cannot see whose write a read hit), a fact when it has none.
     */
    singleTurnCeiling(label: string, model: string, single: string, sessions: string, usd: string): string;
    singleTurnConfirmed(label: string, model: string, single: string, sessions: string, usd: string): string;
  };
  /**
   * `trazum plan <log>` — not a list of findings, a ranked plan of what to do.
   *
   * The report names what it found; the plan ranks what to do about it, with
   * the money composed correctly (route and batch on one slice combined,
   * never summed) and every action carrying what the log cannot confirm.
   * Projected savings and measured stakes are separate columns throughout:
   * "what you would save" and "what you already paid" merged into one number
   * is a number that is neither.
   */
  plan: {
    noTarget(): string;
    /** The log priced nothing — a plan over zero calls would be advice about nothing. */
    nothingPriced(): string;
    heading(actions: string, total: string): string;
    totals(projected: string, staked: string): string;
    /** No timestamps: the figures are per this log, not per any period. */
    noClock(): string;
    projected(usd: string): string;
    staked(usd: string): string;
    /** One action line: what to do, to which workload, on which model. */
    action(kind: PlanActionKind, label: string, model: string): string;
    routeTo(model: string): string;
    /** One assumption the log cannot confirm, localized from its typed form. */
    assume(assumption: PlanAssumption): string;
    /** The command that can check the assumption, when one exists. */
    check(command: string): string;
    /** Actions below --min-usd, counted out loud rather than dropped silently. */
    filtered(count: string, minUsd: string, worth: string): string;
    footer(): string;
    /** The plan saved as dated JSON — what 1.39's verify will hold it to. */
    wrote(path: string): string;
  };

  /**
   * `trazum serve` — the answer given before the call is sent.
   *
   * The copy states the two things a reader must not have to infer: that this
   * listens on loopback and nowhere else, and that the measured half is read
   * once rather than being current to the second.
   */
  serve: {
    listening(where: string): string;
    /** Why there is no --host, and why that is not an omission. */
    loopbackOnly(): string;
    measuredFrom(usd: string): string;
    nothingMeasured(dir: string): string;
    noBudget(): string;
    /**
     * The period is only partly measured — said out loud, because a position
     * standing on three days out of thirty must not read as a comfortable
     * ninety per cent remaining.
     */
    partialCoverage(measuredDays: number, elapsedDays: number, period: string): string;
    badPort(value: string): string;
  };

  /**
   * `trazum watch` — the gates, evaluated as the money moves.
   *
   * The copy here carries the rule that makes an alert at 3am trustworthy: a
   * crossing is measured, never projected, and a period too short to judge is
   * said to be rather than passed.
   */
  watch: {
    /** Watching with no threshold configured is a green light nobody earned. */
    noThresholds(): string;
    nothingToWatch(dir: string): string;
    intervalTooTight(): string;
    badWebhook(reason: 'invalid-url' | 'credentials-in-url' | 'insecure-scheme'): string;
    /** A measured crossing. `day` names the afternoon when the gate is a day gate. */
    crossed(gate: WatchGate, measured: string, limit: string, day: string | null): string;
    /** Still over the limit, and already reported — quiet, but not clean. */
    stillOver(gate: WatchGate, measured: string, limit: string, day: string | null): string;
    /** Neither a pass nor a failure: this cannot be judged yet, and why. */
    notJudgeable(gate: WatchGate, reason: NotJudgeable, covered: string | null): string;
    /** The stretch nobody was watching, named rather than implied away. */
    gap(from: string, to: string): string;
    allWithin(gates: string): string;
    webhookFailed(status: string): string;
    watching(minutes: string): string;
  };

  /**
   * `trazum store` — the measurements kept on disk.
   *
   * The one part of this product that deletes something, so its copy is
   * written to make that visible: what is held, what a prune would take, and
   * a refusal when no retention policy exists to prune against.
   */
  store: {
    /** Records appended by a pull that asked to keep them. */
    appended(count: string, dir: string): string;
    empty(dir: string): string;
    heading(records: string, usd: string, from: string, to: string): string;
    providerRow(provider: string, records: string, span: string, models: string): string;
    /** What the store holds — and what it never holds. */
    holds(files: string): string;
    /** Records the store could not tell apart, kept whole rather than merged. */
    possiblyDouble(count: string): string;
    unknownVersion(count: string): string;
    unreadable(file: string, line: string): string;
    retention(days: string): string;
    noRetention(): string;
    /** Deleting on a policy nobody wrote down is refused, never defaulted. */
    pruneNeedsPolicy(): string;
    pruneDryRun(count: string, days: string, span: string | null, usd: string): string;
    pruned(count: string, days: string, span: string | null, usd: string, kept: string): string;
    /** The live budget — the one number `serve` and the MCP guard also read. */
    budgetHeading(period: string): string;
    budgetStanding(consumed: string, limit: string, share: string, measuredDays: string, periodDays: string): string;
    /** The shape of the burn, named. Never a date — see `budgetNeverForecast`. */
    budgetShape(shape: string, elapsedPct: number, coverage: string): string;
    budgetNeverForecast(): string;
    budgetNothingMeasured(elapsedDays: number): string;
    budgetPartial(measuredDays: number, elapsedDays: number, days: string): string;
    budgetScopesUnmeasured(count: number): string;
  };

  /**
   * `trazum connect` — the bill, read from the provider.
   *
   * A usage API serves sums, so the report is restricted on purpose and says
   * which findings this source cannot support. The credential copy matters as
   * much as the figures: Trazum borrows a key from the environment and never
   * stores it, and the messages here are where a user learns that.
   */
  connect: {
    noTarget(providers: string): string;
    unknownProvider(id: string, providers: string): string;
    pricedNoConnector(id: string, providers: string): string;
    /** What would be called, with no key needed and nothing sent. */
    dryRun(provider: string, from: string, to: string, envVars: string, keyKind: string): string;
    /** `calls` is null on a source that serves no request count. */
    heading(provider: string, from: string, to: string, usd: string, calls: string | null): string;
    modelRow(model: string, usd: string, share: string, calls: string | null): string;
    /** A window the provider billed nothing in — not an error, and not a zero to hide. */
    nothingBilled(): string;
    cachePaid(saved: string): string;
    cacheLost(added: string): string;
    /** The write TTL was not stated, so the verdict moves under the other rate. */
    cacheUnsettled(): string;
    /** This source serves token sums and no request count. */
    noCallCount(provider: string): string;
    unpriced(model: string, tokens: string): string;
    /** Something the pull did not get, named rather than silently missing. */
    gap(detail: string): string;
    unavailable(findings: string): string;
    wrote(path: string): string;
    footer(): string;
  };

  /**
   * `trazum history` — many reports over many periods, as one series.
   *
   * Shapes are named as consecutive movement, never a fitted line, and no
   * series becomes a forecast: where the line goes next stays the reader's.
   */
  history: {
    noTarget(): string;
    /** Under three dated reports there is no series — only the comparison --against already does. */
    needsThree(count: string): string;
    heading(periods: string, from: string, to: string): string;
    /** `calls` is null on a source that serves no request count. */
    periodRow(name: string, usd: string, calls: string | null, days: string): string;
    runLabel(label: string, periods: string, sinceName: string, from: string, to: string): string;
    runModel(model: string, periods: string, sinceName: string, from: string, to: string): string;
    runCache(periods: string, sinceName: string, from: string, to: string): string;
    /** The same action in plan after plan: a decision nobody is executing. */
    repeated(kind: PlanActionKind, label: string, model: string, appearances: string, first: string | null, last: string | null): string;
    /** A store source carries no labels, so the label series is absent, not empty. */
    storeNoLabels(): string;
    undated(name: string): string;
    unmeasured(days: number, from: string, to: string, after: string, before: string): string;
    unmeasuredTotal(days: number): string;
    overlap(a: string, b: string, days: number): string;
    runHole(days: number): string;
    unrecognized(name: string): string;
    footer(): string;
    /** The waiver record — what this team has been living with, and for how long. */
    waiverHeading(): string;
    waiverSince(day: string, uses: number): string;
    waiverNoneRecorded(): string;
    waiverHabit(gate: string, uses: number, days: number, firstDay: string, lastDay: string): string;
    waiverVerdict(verdict: string): string;
    waiverReasonNow(reason: string): string;
    waiverReasonsChanged(count: number): string;
    waiverExpiriesMoved(from: string, to: string, count: number): string;
    waiverNoLongerConfigured(): string;
    waiverNeverUsed(gates: string): string;
    waiverUnreadable(count: number, path: string): string;
    waiverStartsHere(): string;
  };

  /**
   * `trazum verify` — the plan held to the log that came after it.
   *
   * Three outcomes and never two: arrived, did not arrive, cannot be told.
   * The third is the honest one, and the one every other tool renders as
   * the first. Differences carry the world's measured movement, and a plan
   * priced under another catalogue says so rather than blaming a team for
   * a saving that arithmetic revoked.
   */
  verify: {
    noTarget(): string;
    needsAgainst(): string;
    /** Not a plan document: wrong shape, wrong version, or not JSON at all. */
    /**
     * `why` is the typed reason from `parsePlanDocument`, rendered so the
     * refusal names what is wrong rather than only that something is. A file
     * that is valid JSON and not a plan and a plan with one bad action are
     * different problems with different fixes.
     */
    badPlan(path: string, why: string): string;
    /** The typed refusal from `parsePlanDocument`, in one clause. */
    planRefusal(
      why:
        | { kind: 'not-json' }
        | { kind: 'not-an-object' }
        | { kind: 'wrong-schema-version'; found: unknown }
        | { kind: 'actions-not-a-list' }
        | { kind: 'action-malformed'; index: number; because: string },
    ): string;
    heading(actions: string, planDate: string | null): string;
    counts(arrived: string, notArrived: string, cannotTell: string): string;
    /** Two price lists are two measurements; every dollar line inherits this. */
    pricesChanged(planReviewed: string, nowReviewed: string): string;
    action(kind: PlanActionKind, label: string, model: string, outcome: VerifyOutcome): string;
    reason(reason: CannotTellReason): string;
    routeObserved(dearestModel: string, onTargetUsd: string, onOldUsd: string): string;
    /** Tokens do not say which tier billed them; named, never assumed arrived. */
    batchUnobservable(): string;
    truncationObserved(retryBillUsd: string): string;
    cacheObserved(deltaUsd: string, outcome: VerifyOutcome): string;
    /** The world's movement, measured: never a verdict, always both numbers. */
    attribution(callsBefore: string, callsAfter: string, outBefore: string, outAfter: string): string;
    gateFailed(failures: string, total: string): string;
    gateOk(): string;
    footer(): string;
  };

  /**
   * `trazum route` — the loop the levers section could only point at.
   *
   * `profile` prices a route exactly and can say nothing about whether the cheaper
   * model still does the job. This runs that measurement: same prompt, two models,
   * judged against the expensive model's own run-to-run variance. It is what turns
   * "here is $16.80 you might save" into "here is $16.80, measured".
   */
  route: {
    noTarget(): string;
    needsPrompt(): string;
    noRoute(): string;
    /**
     * `--label` named something no call carries — almost always a typo.
     *
     * The generic answer here was "no route clears 1% of the bill: these calls
     * are already on the cheapest model of their family" — false on both counts
     * when the log had a 60% route under a different name. A wrong label gets
     * the labels that exist, not a verdict about ones that do not.
     */
    labelNotFound(label: string, available: string): string;
    /** The slice picked, and what taking it is worth. */
    picked(label: string, model: string, candidate: string, usd: string, pct: string): string;
    /** What the measurement will cost, before a single call is made. */
    willSpend(calls: number, model: string, candidate: string): string;
    dryRun(): string;
    running(cases: number): string;
    /** The verdict, against the original model's own variance. */
    agreement(cross: string, self: string): string;
    holds(usd: string): string;
    diverges(usd: string): string;
    inconclusive(): string;
    /** Never a recommendation on its own — the money is only half the answer. */
    yours(): string;
    /**
     * The slice carries no label, so the figure may cover calls this prompt is not.
     *
     * Measuring one prompt and attributing the verdict to a bucket holding two
     * workloads is a figure describing something other than what was measured —
     * the fault this repository keeps finding in itself, in a new place.
     */
    unlabelledSlice(): string;
  };

  baseline: {
    recorded(path: string, files: string, tokens: string): string;
    recordedMoney(monthly: string, model: string, calls: string): string;
    heading(): string;
    unchanged(tokens: string): string;
    grew(delta: string, pct: string, tokens: string): string;
    shrank(delta: string, pct: string, tokens: string): string;
    entry(path: string, before: string, after: string, delta: string): string;
    addedHeading(count: number): string;
    removedHeading(count: number): string;
    grownHeading(count: number): string;
    breachTokens(actual: string, limit: string): string;
    breachPct(actual: string, limit: string): string;
    reRecord(path: string): string;
    money(before: string, after: string, delta: string): string;
    moneyIncomparableScenario(): string;
    moneyIncomparablePricing(was: string, now: string): string;
  };
}
