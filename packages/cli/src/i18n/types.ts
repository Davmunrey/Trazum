import type { EvalVerdict, Locale } from '@trazum/core';

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

  errors: {
    optionNeedsValue(name: string): string;
    mustBeNonNegative(name: string, raw: string): string;
    badLevel(received: string): string;
    unknownRuleInDisable(id: string): string;
    unknownCommand(command: string): string;
    unknownFlag(name: string, allowed: string): string;
    unknownFlagDidYouMean(name: string, suggestion: string): string;
    missingInputFile(): string;
    llmNotConfigured(): string;
    exactTokensNeedsKey(): string;
    checkNeedsMaxTokens(): string;
    evalNeedsCases(): string;
    evalNoCases(path: string): string;
    diffNeedsTwoFiles(): string;
    cannotNegate(name: string): string;
    noPromptsFound(directory: string, extensions: string): string;
    noBudgetsApply(directory: string, configFile: string): string;
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
    perMonthSuffix(amount: string): string;
    diff(): string;
    diffTooLarge(lines: number, max: number): string;
    reorderHeading(): string;
    reorderMoved(blocks: number, tokens: string): string;
    reorderPrefix(before: string, after: string): string;
    reorderDeclined(count: number): string;
    reorderDeclinedRef(phrase: string, excerpt: string): string;
    reorderDeclinedAfter(excerpt: string): string;
    reorderDeclinedMore(count: number): string;
    /** One line to stderr when a redirect suppresses the report. */
    reorderPiped(moved: number, tokens: string, declined: number): string;
    reorderNothing(): string;
    reorderReview(): string;
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

  models: {
    title(): string;
    unit(): string;
    reviewedOn(date: string): string;
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

  rules: {
    title(): string;
    disableHint(): string;
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
    diffHeading(before: string, after: string): string;
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
}
