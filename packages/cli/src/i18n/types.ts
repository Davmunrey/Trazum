import type { EvalVerdict, Locale, RuleLevel } from '@trazum/core';

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
    unknownRuleInDisable(id: string): string;
    unknownCommand(command: string): string;
    unknownFlag(name: string, allowed: string): string;
    unknownFlagDidYouMean(name: string, suggestion: string): string;
    missingInputFile(): string;
    llmNotConfigured(): string;
    applyNeedsSuggest(): string;
    exactTokensNeedsKey(): string;
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
    budgetVsWire(label: string, file: string, budget: string, perCall: string, share: string): string;
    /** `--csv-shape` naming a table that does not exist. */
    badCsvShape(value: string): string;
    coverageHeading(): string;
    needsLabel(seen: string): string;
    needsSession(seen: string): string;
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
