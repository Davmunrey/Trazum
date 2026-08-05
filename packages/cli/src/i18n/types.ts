import type { Locale } from '@trazum/core';

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
    missingInputFile(): string;
    llmNotConfigured(): string;
    exactTokensNeedsKey(): string;
    checkNeedsMaxTokens(): string;
    errorLabel(): string;
  };

  report: {
    inputTokens(): string;
    estimated(): string;
    exactCount(): string;
    rulesApplied(): string;
    nothingToTrim(): string;
    levelAggressive(): string;
    levelSafe(): string;
    ruleHits(hits: number, tokensSaved: number): string;
    moreChanges(count: number): string;
    llmPass(): string;
    llmApplied(provider: string, model: string, before: number, after: number): string;
    llmRejected(reason: string): string;
    costWith(modelName: string): string;
    usageLine(calls: string, outputTokens: number, batch: boolean): string;
    perMonthSaving(saving: string, pct: string): string;
    beyondShortening(): string;
    perMonthSuffix(amount: string): string;
    diff(): string;
    wroteTo(path: string): string;
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

  check: {
    okLabel(): string;
    failedLabel(): string;
    ok(tokens: string, budget: string): string;
    failed(tokens: string, budget: string): string;
    wouldFit(level: string, optimizedTokens: string): string;
    stillTooBig(optimizedTokens: string): string;
  };
}
