#!/usr/bin/env node
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  DEFAULT_USAGE,
  LOCALES,
  PRICING_LAST_REVIEWED,
  RULES,
  comparePrompts,
  countTokensAnthropic,
  getModel,
  estimateTokens,
  formatUsd,
  formatSignedUsd,
  getMessages,
  listModels,
  nearestName,
  optimize,
  providerFromEnv,
  reorderForCache,
  extractPrompts,
  promptId,
  hasMarker,
  SOURCE_EXTENSIONS,
  detectFromSource,
  evaluate,
  refineWithLlm,
  reviewExamples,
  withExactTokenCounts,
} from '@trazum/core';
import type {
  ExampleReview,
  PromptComparison,
  ReorderResult,
  ExtractedPrompt,
  DeclinedPrompt,
  Locale,
  OptimizationResult,
  RuleId,
  RuleLevel,
  UsageProfile,
} from '@trazum/core';
// Everything that reads the filesystem, on its own entry point so the web
// bundle cannot reach it. See packages/core/src/node.ts.
import {
  CONFIG_FILENAME,
  DEFAULT_EXTENSIONS,
  budgetFor,
  catalogueFromOverlay,
  detectHost,
  loadConfig,
  walkPrompts,
} from '@trazum/core/node';
import type { HostEnvironment, PricingCatalogue, TrazumConfig } from '@trazum/core/node';

import { detectLocale, getCliMessages } from './i18n/index.js';
import {
  MAX_SUMMARY_CHARS,
  fitWithin,
  renderCheckMarkdown,
  renderDiffMarkdown,
} from './markdown.js';
import type { CliMessages } from './i18n/index.js';

// --------------------------------------------------------------------------
// Presentation
// --------------------------------------------------------------------------

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  bold: (s: string) => (useColor ? `\u001b[1m${s}\u001b[22m` : s),
  dim: (s: string) => (useColor ? `\u001b[2m${s}\u001b[22m` : s),
  green: (s: string) => (useColor ? `\u001b[32m${s}\u001b[39m` : s),
  red: (s: string) => (useColor ? `\u001b[31m${s}\u001b[39m` : s),
  yellow: (s: string) => (useColor ? `\u001b[33m${s}\u001b[39m` : s),
  cyan: (s: string) => (useColor ? `\u001b[36m${s}\u001b[39m` : s),
};

// --------------------------------------------------------------------------
// Argument parsing
// --------------------------------------------------------------------------

interface Args {
  command: string;
  positional: string[];
  flags: Map<string, string | boolean>;
  /**
   * How a flag was spelled, when that differs from the key it is stored under.
   *
   * Only `--no-x` differs today, and it exists so an error quotes what was
   * actually typed. Telling somebody "unknown option --nonsense" when they
   * wrote `--no-nonsense` sends them looking for a flag they never used.
   */
  asTyped: Map<string, string>;
}

const VALUE_FLAGS = new Set([
  'level',
  'model',
  'calls',
  'output-tokens',
  'cache-hit-rate',
  'disable',
  'max-tokens',
  'cases',
  'concurrency',
  'max-growth',
  'locale',
  'config',
  'markdown-out',
  'pricing',
  'prompt',
  'out',
  'o',
]);

function parseArgs(argv: string[], t: CliMessages): Args {
  const flags = new Map<string, string | boolean>();
  const asTyped = new Map<string, string>();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('-') || arg === '-') {
      positional.push(arg);
      continue;
    }
    const typed = arg.replace(/^--?/, '');
    let name = typed;

    // `--no-batch` stores `batch: false`. This exists because a config file can
    // switch a boolean on, and a setting that cannot be switched back off from
    // the command line is one you have to edit the repository to escape.
    let value: string | boolean = true;
    if (name.startsWith('no-') && !VALUE_FLAGS.has(name)) {
      name = name.slice(3);
      value = false;
      asTyped.set(name, typed);
    }

    if (VALUE_FLAGS.has(name)) {
      if (value === false) throw new Error(t.errors.cannotNegate(name));
      const given = argv[++i];
      if (given === undefined) throw new Error(t.errors.optionNeedsValue(name));
      flags.set(name === 'o' ? 'out' : name, given);
    } else {
      flags.set(name, value);
    }
  }

  return { command: positional[0] ?? '', positional: positional.slice(1), flags, asTyped };
}

/**
 * Reads a boolean flag, honouring `--no-` and a project default.
 *
 * `flags.has(name)` is the wrong test once negation exists: `--no-batch` stores
 * the key with the value `false`, and `has` would report it as set.
 */
function boolFlag(args: Args, name: string, fallback = false): boolean {
  const raw = args.flags.get(name);
  return typeof raw === 'boolean' ? raw : fallback;
}

/**
 * Reads `--locale` before the rest of the parsing, so even a parse error is
 * reported in the language the user asked for.
 */
function localeFromArgv(argv: string[]): Locale {
  const index = argv.indexOf('--locale');
  const flag = index >= 0 ? argv[index + 1] : undefined;
  return detectLocale(flag);
}

function stringFlag(args: Args, name: string): string | undefined {
  const raw = args.flags.get(name);
  return typeof raw === 'string' ? raw : undefined;
}

function numberFlag(args: Args, name: string, fallback: number, t: CliMessages): number {
  const raw = args.flags.get(name);
  if (raw === undefined || typeof raw === 'boolean') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(t.errors.mustBeNonNegative(name, raw));
  }
  return value;
}

/**
 * Resolves the rule level: flag, then config, then `safe`.
 *
 * The layering order is the same for every setting in this file — the command
 * line beats the project, and the project beats the built-in default. A config
 * file that could override an explicit flag would make the flag a suggestion.
 */
function levelFlag(args: Args, config: TrazumConfig, t: CliMessages): RuleLevel {
  const level = (args.flags.get('level') ?? config.level ?? 'safe') as RuleLevel;
  if (level !== 'safe' && level !== 'aggressive') {
    throw new Error(t.errors.badLevel(String(level)));
  }
  return level;
}

/**
 * Usage profile from flags over config over detection over the built-in default.
 *
 * `detected` is what the source file said — an SDK import, a base URL, a quoted
 * model id. It beats the default because reading the code is better than
 * assuming, and loses to config because being told is better than reading.
 */
function usageFrom(
  args: Args,
  config: TrazumConfig,
  t: CliMessages,
  detected?: string,
): UsageProfile {
  const fromConfig = config.usage ?? {};
  const model = stringFlag(args, 'model') ?? fromConfig.model ?? detected ?? DEFAULT_USAGE.model;
  return {
    model,
    callsPerMonth: numberFlag(
      args,
      'calls',
      fromConfig.callsPerMonth ?? DEFAULT_USAGE.callsPerMonth,
      t,
    ),
    avgOutputTokens: numberFlag(
      args,
      'output-tokens',
      fromConfig.avgOutputTokens ?? DEFAULT_USAGE.avgOutputTokens,
      t,
    ),
    cacheHitRate: numberFlag(
      args,
      'cache-hit-rate',
      fromConfig.cacheHitRate ?? DEFAULT_USAGE.cacheHitRate,
      t,
    ),
    batchEligible: boolFlag(args, 'batch', fromConfig.batchEligible ?? false),
  };
}

/**
 * Prices for this run: `--pricing` beats the config's overlay, which beats the
 * bundled catalogue — the same layering as every other setting.
 */
async function pricingFor(
  args: Args,
  loaded: { pricing: PricingCatalogue },
): Promise<PricingCatalogue> {
  const flag = stringFlag(args, 'pricing');
  if (!flag) return loaded.pricing;
  const raw = await readFile(flag, 'utf8');
  return catalogueFromOverlay(raw, flag);
}

/** Rules to disable: the flag replaces the config list rather than adding to it. */
function disabledRules(args: Args, config: TrazumConfig): RuleId[] | undefined {
  const flag = stringFlag(args, 'disable');
  if (flag !== undefined) {
    return flag.split(',').map((id) => id.trim()).filter(Boolean) as RuleId[];
  }
  return config.disable;
}

/**
 * Flags each command accepts. An unrecognised flag used to be accepted
 * silently, which on a gate command means CI passing while the author believes
 * a threshold is set — `--max-growh 5` would have been ignored and the build
 * gone green. Silence is the wrong answer for a typo.
 */
const GLOBAL_FLAGS = ['help', 'h', 'locale', 'json', 'config', 'pricing'];
const COMMAND_FLAGS: Record<string, string[]> = {
  optimize: [
    'level', 'model', 'calls', 'output-tokens', 'cache-hit-rate', 'batch',
    'disable', 'llm', 'exact-tokens', 'diff', 'reorder', 'out', 'o',
    'tokens-only', 'cost', 'prompt',
  ],
  check: ['max-tokens', 'level', 'exact-tokens', 'markdown-out'],
  eval: ['cases', 'level', 'concurrency'],
  diff: ['level', 'model', 'calls', 'output-tokens', 'batch', 'max-growth', 'optimized', 'markdown-out'],
  models: [],
  where: [],
  rules: [],
};

function rejectUnknownFlags(args: Args, t: CliMessages): void {
  const known = COMMAND_FLAGS[args.command];
  if (!known) return;
  const allowed = [...known, ...GLOBAL_FLAGS];

  for (const name of args.flags.keys()) {
    // `out` is stored under its long name even when given as `-o`, and a
    // negated boolean under its base name, so both validate against the list.
    if (allowed.includes(name)) continue;

    // Quoted as typed, so `--no-nonsense` is not reported as `--nonsense`.
    const spelled = args.asTyped.get(name) ?? name;
    const nearest = nearestName(name, allowed);
    throw new Error(
      nearest
        ? t.errors.unknownFlagDidYouMean(spelled, nearest)
        : t.errors.unknownFlag(spelled, allowed.slice().sort().join(', ')),
    );
  }
}

// --------------------------------------------------------------------------
// Line-by-line diff
// --------------------------------------------------------------------------

/**
 * Largest diff this will attempt, in lines per side.
 *
 * The alignment table is quadratic: at 6,000 lines it is 36 million cells and
 * roughly 288 MB before anything else runs. There is no prompt worth reading a
 * 6,000-line diff of, so past this the diff is declined rather than the process
 * being taken down by someone passing a large file.
 */
const MAX_DIFF_LINES = 2500;

/** Longest common subsequence, used to align the two versions. */
function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

function renderDiff(before: string, after: string, t: CliMessages): string {
  const a = before.split('\n');
  const b = after.split('\n');

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return c.dim(t.report.diffTooLarge(Math.max(a.length, b.length), MAX_DIFF_LINES));
  }

  const table = lcsTable(a, b);
  const lines: string[] = [];

  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push(c.dim(`  ${a[i]}`));
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      lines.push(c.red(`- ${a[i]}`));
      i++;
    } else {
      lines.push(c.green(`+ ${b[j]}`));
      j++;
    }
  }
  while (i < a.length) lines.push(c.red(`- ${a[i++]}`));
  while (j < b.length) lines.push(c.green(`+ ${b[j++]}`));

  return lines.join('\n');
}

// --------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------

/**
 * The provider's name when the estimator was not calibrated for it.
 *
 * `estimateTokens` is a heuristic tuned against Claude's tokenizer, and the
 * ±15% band descends from that. Printing the same band beside a GPT or Kimi
 * figure states a precision nobody has measured for that family — and since the
 * catalogue grew past Anthropic, that is most of it. Returns null when the model
 * is Anthropic's, where the band is at least the claim it was written for.
 */
function offFamilyName(modelId: string): string | null {
  const provider = getModel(modelId).provider;
  if (provider === undefined || provider === 'anthropic') return null;
  return getModel(modelId).displayName;
}

function printReport(
  result: OptimizationResult,
  showDiff: boolean,
  t: CliMessages,
  examplesReview: ExampleReview | null = null,
  reorder: ReorderResult | null = null,
  tokensOnly = false,
  host: HostEnvironment = { id: 'terminal', displayName: 'terminal', billing: 'unknown', evidence: null },
): void {
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const sourceNote =
    result.tokenSource === 'heuristic'
      ? c.dim(t.report.estimated(offFamilyName(result.usage.model)))
      : c.dim(t.report.exactCount());

  console.log();
  console.log(c.bold(t.report.inputTokens()));
  console.log(
    `  ${n(result.tokensBefore)} → ${c.green(n(result.tokensAfter))}   ${c.bold(
      `-${result.reductionPct.toFixed(1)}%`,
    )}${sourceNote}`,
  );

  // Before the rules, because the rearrangement is the bigger change and the
  // one the reader has to make a judgement about.
  //
  // Only when there is something to say. "Nothing could safely move" with no
  // refusals underneath is a heading, a blank line and a shrug — the reader
  // asked for a rearrangement, there was none available, and the token count
  // above already told them nothing changed.
  if (reorder !== null && (reorder.moved.length > 0 || reorder.declined.length > 0)) {
    console.log();
    console.log(c.bold(t.report.reorderHeading()));
    if (reorder.moved.length === 0) {
      console.log(`  ${c.dim(t.report.reorderNothing())}`);
    } else {
      console.log(`  ${t.report.reorderMoved(reorder.moved.length, n(reorder.tokensMoved))}`);
      console.log(
        `  ${c.green(
          t.report.reorderPrefix(n(reorder.prefixTokensBefore), n(reorder.prefixTokensAfter)),
        )}`,
      );
    }
    // Refusals are reported even when the move succeeded: a saving Trazum chose
    // not to take is one the author cannot evaluate unless they are told.
    if (reorder.declined.length > 0) {
      console.log(`  ${c.dim(t.report.reorderDeclined(reorder.declined.length))}`);
      const SHOWN = 3;
      for (const d of reorder.declined.slice(0, SHOWN)) {
        const excerpt = truncate(d.text.trim().replace(/\s+/g, ' '), 48);
        console.log(
          `    ${c.dim(
            d.reason === 'uncovered-script'
              ? t.report.reorderDeclinedScript(d.script ?? '')
              : d.reason === 'backward-reference'
                ? t.report.reorderDeclinedRef(d.phrase ?? '', excerpt)
                : t.report.reorderDeclinedAfter(excerpt),
          )}`,
        );
      }
      // Say that the list was cut. A report that shows three of nine reads as
      // "three" unless it admits otherwise.
      if (reorder.declined.length > SHOWN) {
        console.log(`    ${c.dim(t.report.reorderDeclinedMore(reorder.declined.length - SHOWN))}`);
      }
    }
    if (reorder.moved.length > 0) console.log(`  ${c.yellow(t.report.reorderReview())}`);
  }

  if (result.rules.length > 0) {
    console.log();
    console.log(c.bold(t.report.rulesApplied()));
    for (const rule of result.rules) {
      const tag =
        rule.level === 'aggressive'
          ? c.yellow(t.report.levelAggressive())
          : c.dim(t.report.levelSafe());
      console.log(`  ${tag} ${rule.title} ${c.dim(t.report.ruleHits(rule.hits, rule.tokensSaved))}`);

      // What the rule actually did. Shown under the aggressive level by
      // default because that is the one whose advice is "read the diff", and
      // a diff of everything at once is not something anyone reads.
      const showChanges = showDiff || rule.level === 'aggressive';
      if (showChanges) {
        for (const change of rule.changes) {
          const from = c.red(truncate(change.before, 46));
          const to = change.after ? c.green(truncate(change.after, 30)) : c.dim('—');
          console.log(`      ${from} ${c.dim('→')} ${to}`);
        }
        if (rule.hits > rule.changes.length && rule.changes.length > 0) {
          console.log(c.dim(`      ${t.report.moreChanges(rule.hits - rule.changes.length)}`));
        }
      }
    }
  } else {
    console.log();
    console.log(c.dim(t.report.nothingToTrim()));
  }

  if (result.llm) {
    console.log();
    console.log(c.bold(t.report.llmPass()));
    if (result.llm.applied) {
      console.log(
        `  ${c.green(
          t.report.llmApplied(
            result.llm.provider,
            result.llm.model,
            result.llm.tokensBefore,
            result.llm.tokensAfter,
          ),
        )}`,
      );
    } else {
      console.log(`  ${c.yellow(t.report.llmRejected(result.llm.rejectedReason ?? ''))}`);
    }
  }

  // On a subscription there is no bill to reduce. Everything below this point
  // would be arithmetic about tokens dressed as money, and "$184/month" told to
  // somebody on a flat plan is wrong in the direction that matters most.
  //
  // What replaces it is the thing that *is* scarce there: the context window.
  if (tokensOnly) {
    printTokensOnly(result, host, t, n);
  } else {
    printMoney(result, t, n);
  }

  // On a subscription, an advisory whose entire pitch is money is not weaker
  // advice — it is not advice. "Use a cheaper model" saves nothing on a flat
  // plan, and its detail text quotes dollars per month, so suppressing only the
  // price tag beside the title left the money in the sentence underneath.
  //
  // The rest stay: an overflowing context window still fails the call, a
  // contradiction is still wrong, redundant examples still cost tokens, and
  // caching still buys latency and rate-limit headroom.
  const MONEY_ONLY = new Set([
    'model-downgrade',
    'batch-api',
    'output-dominated',
    'promo-pricing',
    'prompt-caching-not-worth-it',
  ]);
  const advisories = tokensOnly
    ? result.advisories.filter((a) => !MONEY_ONLY.has(a.id))
    : result.advisories;

  if (advisories.length > 0) {
    console.log();
    console.log(c.bold(t.report.beyondShortening()));

    // The amount goes in a column of its own rather than trailing the title.
    // Four advisories worth $506, $422, $170 and nothing are meant to be
    // compared, and comparing them meant reading to the end of four different
    // sentences to find where the numbers were.
    //
    // The advisory itself still applies on a subscription — caching and a
    // smaller model both buy back context and rate-limit headroom. Only the
    // price tag is meaningless, so only the price tag goes.
    const amountOf = (a: (typeof advisories)[number]): string =>
      !tokensOnly && a.estimatedMonthlyUsd !== null ? formatUsd(a.estimatedMonthlyUsd) : '';
    const width = Math.max(0, ...advisories.map((a) => amountOf(a).length));
    // Indent the wrapped detail to the start of the title, so the prose forms
    // one block instead of stepping around the numbers.
    const gutter = ' '.repeat(4 + (width > 0 ? width + 2 : 0));

    for (const advisory of advisories) {
      const marker =
        advisory.severity === 'warning'
          ? c.yellow('!')
          : advisory.severity === 'opportunity'
            ? c.cyan('→')
            : c.dim('·');
      const amount = amountOf(advisory);
      const column = width > 0 ? `${c.green(amount.padStart(width))}  ` : '';
      console.log(`  ${marker} ${column}${c.bold(advisory.title)}`);
      console.log(`${gutter}${c.dim(wrap(advisory.detail, 78 - gutter.length, gutter))}`);
    }

    // What to do first. The rules trimmed $1.25 and the top advisory is worth
    // $506; leaving the reader to notice that by comparing four numbers in four
    // sentences is how the most valuable line in the report gets skipped.
    const best = advisories.find((a) => (a.estimatedMonthlyUsd ?? 0) > 0);
    if (!tokensOnly && best?.estimatedMonthlyUsd) {
      const ruleSaving = result.savings.monthlySavingsUsd;
      const line = t.report.biggestLeverDetail(
        best.title,
        formatUsd(best.estimatedMonthlyUsd),
        ruleSaving > 0 ? Math.round(best.estimatedMonthlyUsd / ruleSaving) : null,
      );
      console.log();
      // Wrapped to the same width as everything else. An unwrapped closing line
      // is the one that runs off a narrow terminal, and it is the line most
      // worth reading.
      console.log(`  ${c.bold(t.report.biggestLever())} ${c.dim(wrap(line, 62, '  '))}`);
    }
  }

  printRest(result, showDiff, t, examplesReview, n);
}

/** The cost section, for anyone billed by the token. */
function printMoney(result: OptimizationResult, t: CliMessages, n: (v: number) => string): void {
  const { savings } = result;
  console.log();
  console.log(c.bold(t.report.costWith(savings.modelDisplayName)));
  console.log(
    `  ${t.report.usageLine(
      n(result.usage.callsPerMonth),
      result.usage.avgOutputTokens,
      result.usage.batchEligible,
    )}`,
  );
  // Said, not assumed. Once prices can be overlaid locally, a figure from the
  // bundled catalogue and a figure from somebody's JSON file look identical, and
  // the reader has to be able to tell which one they are about to budget against.
  const touched = [
    ...result.pricingSource.overriddenModels,
    ...result.pricingSource.addedModels,
  ];
  if (touched.length > 0) {
    console.log(
      `  ${c.yellow(t.report.pricingOverlaid(touched.join(', '), result.pricingSource.lastReviewed))}`,
    );
  }
  console.log(
    `  ${formatUsd(savings.perMonth.before.totalUsd)} → ` +
      `${c.green(formatUsd(savings.perMonth.after.totalUsd))}   ` +
      c.bold(
        t.report.perMonthSaving(
          formatUsd(savings.monthlySavingsUsd),
          savings.monthlySavingsPct.toFixed(1),
        ),
      ),
  );

}

/**
 * What the saving buys when there is no bill: room.
 *
 * The context window is the scarce thing inside an agent — every token the
 * system prompt holds is one the conversation cannot. That is a real saving and
 * a measurable one, and it is the honest answer to "what did I gain" on a plan
 * that costs the same either way.
 */
function printTokensOnly(
  result: OptimizationResult,
  host: HostEnvironment,
  t: CliMessages,
  n: (v: number) => string,
): void {
  const model = getModel(result.usage.model);
  const saved = result.tokensBefore - result.tokensAfter;

  console.log();
  console.log(c.bold(t.report.tokensOnlyHeading(host.displayName)));
  // Only claim the host bills by subscription when it does. Forced with the
  // flag on GitHub Actions, the first version said "GitHub Actions bills by
  // subscription", which is simply false.
  console.log(
    `  ${
      host.billing === 'subscription'
        ? t.report.tokensOnlyWhy(host.displayName)
        : t.report.tokensOnlyAsked()
    }`,
  );
  console.log();
  console.log(`  ${c.green(t.report.tokensSaved(n(saved)))}`);

  // Share of the window, which is what a saved token is actually worth here.
  const share = (tokens: number): string =>
    `${((tokens / model.contextWindow) * 100).toFixed(1)}%`;
  console.log(
    `  ${c.dim(
      t.report.windowUse(
        share(result.tokensBefore),
        share(result.tokensAfter),
        model.displayName,
        n(model.contextWindow),
      ),
    )}`,
  );
  console.log(`  ${c.dim(t.report.tokensOnlyCost())}`);
}

function printRest(
  result: OptimizationResult,
  showDiff: boolean,
  t: CliMessages,
  examplesReview: ExampleReview | null,
  n: (v: number) => string,
): void {
  if (examplesReview && examplesReview.groups.length > 0) {
    console.log();
    console.log(c.bold(t.report.examplesReview()));
    console.log(
      c.dim(
        `  ${t.report.examplesReviewNote(
          examplesReview.provider,
          examplesReview.model,
          examplesReview.exampleCount,
        )}`,
      ),
    );
    for (const group of examplesReview.groups) {
      console.log(
        `  ${c.yellow(t.report.exampleRedundant(group.redundant, group.keep))}` +
          c.dim(` (~${group.tokens} tokens)`),
      );
      if (group.reason) console.log(`    ${c.dim(group.reason)}`);
    }
  }

  if (showDiff) {
    console.log();
    console.log(c.bold(t.report.diff()));
    console.log(renderDiff(result.original, result.optimized, t));
  }

  console.log();
}

/** Shortens a snippet for the change list, keeping it on one line. */
function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}\u2026`;
}

/** Wraps a paragraph to a given width. */
function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join(`\n${indent}`);
}

// --------------------------------------------------------------------------
// Subcommands
// --------------------------------------------------------------------------

/**
 * A provider's stand-in model, for when the code names who but not which.
 *
 * The same capability as the global default, so the figure is comparable with
 * what Trazum would have printed anyway, and the cheapest at that capability so
 * the guess errs downwards — overstating somebody's bill on a model they never
 * chose is the worse direction to be wrong in.
 */
function defaultModelFor(provider: string, pricing: PricingCatalogue): string | null {
  // Nearest capability, not an exact match. Matching exactly returned nothing
  // for OpenAI and DeepSeek — neither has a `large` model, so the code fell
  // through to the global default and printed "goes to openai / priced as
  // Claude Opus 5" anyway. A ladder with different rungs is the normal case,
  // not an edge one.
  const RANK: Record<string, number> = { small: 0, mid: 1, large: 2, frontier: 3 };
  const want = RANK[getModel(DEFAULT_USAGE.model).capability] ?? 2;

  const candidates = pricing.models.filter(
    (m) => m.provider === provider && m.recommendable !== false,
  );

  const best = candidates.reduce<(typeof candidates)[number] | null>((chosen, m) => {
    if (chosen === null) return m;
    const distance = Math.abs((RANK[m.capability] ?? 2) - want);
    const chosenDistance = Math.abs((RANK[chosen.capability] ?? 2) - want);
    if (distance !== chosenDistance) return distance < chosenDistance ? m : chosen;
    // Same distance: the cheaper one, so the guess errs downwards. Overstating
    // somebody's bill on a model they never chose is the worse way to be wrong.
    return m.inputPerMTok < chosen.inputPerMTok ? m : chosen;
  }, null);

  return best?.id ?? null;
}

/**
 * Reads a source file as the prompts it holds, rather than as one big prompt.
 *
 * Returns null for anything that is not a source file, which is the ordinary
 * case: a `.txt` or `.md` prompt goes through untouched.
 *
 * For a source file it **refuses rather than guesses**. Optimising TypeScript
 * as if it were prose does not produce a worse prompt, it produces broken code
 * — `import OpenAI` came back as `Import OpenAI` from the capitalisation rule —
 * and `-o` would write that over the file. A refusal with the marker syntax in
 * it costs the reader one comment; the alternative cost them a compile.
 */
function sourceFileOf(
  target: string,
  raw: string,
  pricing: PricingCatalogue,
  wanted: string | undefined,
): { text: string; model?: string } | null {
  const isSource = SOURCE_EXTENSIONS.some((ext) => target.toLowerCase().endsWith(ext));
  if (!isSource) return null;

  // The catalogue in effect rather than the bundled one: an overlay can add a
  // model, and a detection that cannot see it would fall back for no reason.
  const detection = detectFromSource(raw, { models: pricing.models });
  // An import names who, never which — so a file that plainly calls OpenAI was
  // still being priced against Claude Opus 5. The provider's own stand-in is a
  // guess about which of their models rather than about whose, which is the
  // difference that matters. `trazum where` says which it picked and why.
  const model =
    detection.model ??
    (detection.provider !== null ? (defaultModelFor(detection.provider, pricing) ?? undefined) : undefined);

  if (!hasMarker(raw)) {
    throw new Error(t_sourceNeedsMarker(target));
  }

  const { prompts, declined } = extractPrompts(raw);
  if (prompts.length === 0) {
    const why = declined[0];
    throw new Error(
      why
        ? `${target}: the marker on line ${why.line} could not be read — ${why.detail}`
        : `${target}: nothing was extracted from the markers in this file.`,
    );
  }

  // One prompt is unambiguous. Several need naming, because optimising "the
  // first one" silently is how the wrong prompt ends up rewritten.
  const chosen =
    wanted !== undefined
      ? prompts.find((p) => p.name === wanted || promptId(target, p) === wanted)
      : prompts.length === 1
        ? prompts[0]
        : undefined;

  if (!chosen) {
    const names = prompts.map((p) => promptId(target, p)).join('\n  ');
    throw new Error(
      wanted !== undefined
        ? `${target} has no marked prompt called "${wanted}". It holds:\n  ${names}`
        : `${target} holds ${prompts.length} marked prompts. Name one with --prompt:\n  ${names}`,
    );
  }

  return { text: chosen.text, ...(model ? { model } : {}) };
}

/** Kept as a function so the sentence is in one place rather than two. */
const t_sourceNeedsMarker = (target: string): string =>
  `${target} looks like source, not a prompt. Optimising it would rewrite your code — ` +
  'mark the prompt with a `// trazum:prompt` comment above the literal, or pass the ' +
  'prompt itself in a .txt file.';

/**
 * Says which provider a prompt is actually sent to, and how it knows.
 *
 * Trazum priced one vendor, so the default cost nothing. Pricing seven made it a
 * wrong number: a file calling OpenAI was billed against Claude Opus 5 without
 * comment. This reads what the code already says instead.
 *
 * Every answer names the line it came from. A detection this command cannot
 * justify is a guess, and the number that follows from it would be a guess too.
 */
async function commandWhere(
  args: Args,
  config: TrazumConfig,
  pricing: PricingCatalogue,
  t: CliMessages,
): Promise<void> {
  const host = detectHost();

  console.log();
  console.log(c.bold(t.where.hostHeading()));
  console.log(
    `  ${host.displayName}${host.evidence ? c.dim(` (${host.evidence})`) : ''}`,
  );
  // The reason this is worth printing at all. Inside a flat plan the monthly
  // figure Trazum computes is arithmetic about tokens, not money anybody gets
  // back, and saying so is more useful than saying nothing.
  if (host.billing === 'subscription') {
    console.log(`  ${c.yellow(t.where.subscription(host.displayName))}`);
  }

  const target = args.positional[0];
  if (target === undefined) {
    console.log();
    console.log(c.dim(t.where.noTarget()));
    console.log();
    return;
  }

  const source = await readFile(target, 'utf8');
  const detection = detectFromSource(source, { models: pricing.models });

  console.log();
  console.log(c.bold(t.where.sourceHeading(target)));

  if (detection.conflicts.length > 0) {
    // Two answers is not a weaker version of one answer. Naming both and
    // declining is the only honest output here.
    console.log(`  ${c.red(t.where.conflict())}`);
    for (const e of detection.evidence.slice(0, 4)) {
      console.log(`    ${c.dim(t.where.evidenceLine(e.line ?? 0, e.kind, e.detail))}`);
    }
    console.log(`  ${c.dim(t.where.conflictFallback())}`);
  } else if (detection.provider === null) {
    console.log(`  ${c.dim(t.where.nothingFound())}`);
  } else {
    const model = detection.model ? getModel(detection.model) : null;
    console.log(
      `  ${detection.provider}${model ? ` · ${model.displayName}` : c.dim(t.where.providerOnly())}`,
    );
    for (const e of detection.evidence.slice(0, 3)) {
      console.log(`    ${c.dim(t.where.evidenceLine(e.line ?? 0, e.kind, e.detail))}`);
    }
  }

  // What would actually be used, which is the question behind the question.
  // Flags beat config, config beats detection, detection beats the default —
  // and a reader deciding whether to pass --model needs to see which won.
  //
  // Knowing the provider but not the model is the common case: an import names
  // who, never which. Falling through to the built-in default there would print
  // "goes to openai" and "priced as Claude Opus 5" three lines apart, which is
  // the wrong number this command exists to catch, produced by the command
  // itself. A provider's own default is a guess, but it is a guess about which
  // of their models rather than about whose.
  const configured = config.usage?.model;
  const detected =
    detection.model ??
    (detection.provider !== null ? defaultModelFor(detection.provider, pricing) : null);

  const effective = configured ?? detected ?? DEFAULT_USAGE.model;
  const reason = configured
    ? t.where.fromConfig()
    : detection.model
      ? t.where.fromDetection()
      : detected
        ? t.where.fromProviderDefault(detection.provider ?? '')
        : t.where.fromDefault();

  console.log();
  console.log(c.bold(t.where.pricedAs()));
  console.log(`  ${getModel(effective).displayName} ${c.dim(reason)}`);
  console.log();
}

function commandModels(t: CliMessages, pricing: PricingCatalogue): void {
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const col = t.models.columns;

  console.log();
  console.log(c.bold(t.models.title()) + c.dim(t.models.unit()));
  console.log(c.dim(t.models.reviewedOn(pricing.lastReviewed)));
  console.log();

  const rows = pricing.models.map((m) => ({
    id: m.id,
    input: m.promo ? `${m.promo.inputPerMTok} (→${m.inputPerMTok})` : String(m.inputPerMTok),
    output: m.promo ? `${m.promo.outputPerMTok} (→${m.outputPerMTok})` : String(m.outputPerMTok),
    context: `${n(m.contextWindow / 1000)}K`,
    cache: n(m.cacheMinTokens),
  }));
  const widths = {
    id: Math.max(...rows.map((r) => r.id.length), col.model.length),
    input: Math.max(...rows.map((r) => r.input.length), col.input.length),
    output: Math.max(...rows.map((r) => r.output.length), col.output.length),
    context: Math.max(...rows.map((r) => r.context.length), col.context.length),
    cache: Math.max(...rows.map((r) => r.cache.length), col.cacheMin.length),
  };

  console.log(
    c.bold(
      `  ${col.model.padEnd(widths.id)}  ${col.input.padStart(widths.input)}  ` +
        `${col.output.padStart(widths.output)}  ${col.context.padStart(widths.context)}  ` +
        `${col.cacheMin.padStart(widths.cache)}`,
    ),
  );
  for (const row of rows) {
    console.log(
      `  ${row.id.padEnd(widths.id)}  ${row.input.padStart(widths.input)}  ` +
        `${row.output.padStart(widths.output)}  ${row.context.padStart(widths.context)}  ` +
        `${row.cache.padStart(widths.cache)}`,
    );
  }

  console.log();
  console.log(c.dim(t.models.promoNote()));
  console.log(c.dim(t.models.cacheNote()));
  console.log(c.dim(t.models.batchNote()));
  console.log();
}

function commandRules(t: CliMessages, locale: Locale): void {
  // Rule copy lives in the core catalogue, so `trazum rules` and the report
  // never drift apart.
  const copy = getMessages(locale).rules;

  console.log();
  console.log(c.bold(t.rules.title()));
  console.log(c.dim(t.rules.disableHint()));
  console.log();
  for (const rule of RULES) {
    const tag =
      rule.level === 'aggressive'
        ? c.yellow(t.report.levelAggressive())
        : c.dim(t.report.levelSafe());
    console.log(`  ${tag} ${c.bold(rule.id)} — ${copy[rule.id].title}`);
    console.log(`    ${c.dim(wrap(copy[rule.id].rationale, 74, '    '))}`);
    console.log();
  }
}

async function readInput(source: string | undefined, t: CliMessages): Promise<string> {
  if (!source) {
    throw new Error(t.errors.missingInputFile());
  }
  if (source === '-') {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
  }
  return readFile(source, 'utf8');
}

async function commandOptimize(
  args: Args,
  config: TrazumConfig,
  pricing: PricingCatalogue,
  t: CliMessages,
  locale: Locale,
): Promise<void> {
  const target = args.positional[0];
  const raw = await readInput(target, t);
  const level = levelFlag(args, config, t);

  // A source file is not a prompt.
  //
  // Handed `src/prompts.ts`, this used to optimise the whole file — imports,
  // `const client = new OpenAI();`, all of it — count the code as tokens the
  // model would pay for, and then **rewrite the source**: the capitalisation
  // rule turned `import OpenAI` into `Import OpenAI`, which does not compile.
  // Writing that back over somebody's file is the worst thing in this
  // repository's history, and it was the default behaviour.
  const source =
    target !== undefined && target !== '-'
      ? sourceFileOf(target, raw, pricing, stringFlag(args, 'prompt'))
      : null;
  const original = source ? source.text : raw;

  // Detection sits between config and defaults, as everywhere: a flag beats
  // config, config beats what the code says, and what the code says beats a
  // built-in default that has no idea which provider you use.
  const usage = usageFrom(args, config, t, source?.model);

  const disableRules = disabledRules(args, config) ?? [];
  for (const id of disableRules) {
    if (!RULES.some((r) => r.id === id)) {
      throw new Error(t.errors.unknownRuleInDisable(id));
    }
  }

  // Reordering runs BEFORE the rules, and is opt-in.
  //
  // Before, because a rule that deletes a sentence changes which blocks exist;
  // reordering first means the rearrangement is decided on the prompt the author
  // wrote, which is the one they will review it against.
  //
  // Opt-in, and not part of `aggressive`, because every other transformation
  // here deletes text whose absence is local while this one moves text, and
  // order carries meaning. `aggressive` promises "read the diff"; this needs
  // "decide whether the order mattered", which is a different question.
  const reorder = boolFlag(args, 'reorder') ? reorderForCache(original, {
    // A prefix below the model's cacheable minimum caches nothing at all, so a
    // rearrangement that does not get it over the line buys nothing and there is
    // no reason to hand the author a diff for it.
    minPrefixTokens: getModel(usage.model).cacheMinTokens,
  }) : null;
  const prompt = reorder?.text ?? original;

  let result = optimize(prompt, {
    level,
    usage,
    locale,
    disableRules,
    pricing,
  });

  // The diff has to show the move. Optimising the reordered text means
  // `result.original` is the rearrangement, so a diff against it would show only
  // the deletions — and hide the one change the report just told you to review.
  if (reorder !== null && reorder.moved.length > 0) {
    result = { ...result, original };
  }

  let examplesReview: ExampleReview | null = null;

  if (boolFlag(args, 'llm')) {
    const provider = providerFromEnv();
    if (!provider) {
      throw new Error(t.errors.llmNotConfigured());
    }
    result = await refineWithLlm(result, provider, { locale });

    // A second call, and only when there is something for it to judge:
    // `reviewExamples` returns null below two examples rather than paying for
    // a foregone answer. This is the paraphrase case the deterministic
    // detector refuses to guess at.
    examplesReview = await reviewExamples(result.optimized, provider);
  }

  if (boolFlag(args, 'exact-tokens')) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(t.errors.exactTokensNeedsKey());
    }
    result = await withExactTokenCounts(
      result,
      countTokensAnthropic({ apiKey, model: result.usage.model }),
      pricing,
    );
  }

  const outPath = stringFlag(args, 'out');
  if (outPath) {
    await writeFile(outPath, result.optimized, 'utf8');
  }

  if (boolFlag(args, 'json')) {
    // `reorder` goes in whenever the flag was passed, including when nothing
    // moved. A consumer reading `optimized` is reading text the author did not
    // write in that order, and it must not have to infer that from the diff.
    console.log(
      JSON.stringify(
        {
          ...result,
          ...(examplesReview ? { examplesReview } : {}),
          ...(reorder ? { reorder } : {}),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (!process.stdout.isTTY && !outPath) {
    // Redirected to a file or another process: the prompt alone, no chrome.
    process.stdout.write(result.optimized);
    // Except that a rearrangement is not chrome. Everything else this command
    // does is a deletion the diff will show; `--reorder` moves text, and piping
    // it made both the move and the refusals invisible — which is the one thing
    // this module promises not to do. One line, on stderr, so the pipe carries
    // the prompt and nothing else.
    if (reorder !== null) {
      console.error(
        t.report.reorderPiped(
          reorder.moved.length,
          reorder.tokensMoved.toLocaleString(t.numberLocale),
          reorder.declined.length,
        ),
      );
    }
    return;
  }

  // Tokens-only when the host bills by subscription: there is no bill to
  // reduce, so a monthly figure would be arithmetic about tokens dressed as
  // money. Either flag overrides it, because the host says where *Trazum* runs
  // and not where the prompt goes — somebody editing a production prompt inside
  // Cursor wants the dollars, and they should not have to leave the editor to
  // see them.
  const host = detectHost();
  const tokensOnly = boolFlag(args, 'cost')
    ? false
    : boolFlag(args, 'tokens-only') || host.billing === 'subscription';

  printReport(result, boolFlag(args, 'diff'), t, examplesReview, reorder, tokensOnly, host);
  if (outPath) {
    console.log(c.dim(t.report.wroteTo(outPath)));
    console.log();
  }
}

/** A token counter, plus where its numbers came from. */
interface Counter {
  count: (text: string) => Promise<number>;
  source: 'heuristic' | 'external';
}

function counterFor(args: Args, t: CliMessages): Counter {
  if (!boolFlag(args, 'exact-tokens')) {
    return { count: (text) => Promise.resolve(estimateTokens(text)), source: 'heuristic' };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error(t.errors.exactTokensNeedsKey());
  const exact = countTokensAnthropic({ apiKey });
  return { count: (text) => exact(text), source: 'external' };
}

interface FileVerdict {
  path: string;
  tokens: number;
  /** null when no budget covers this file. */
  maxTokens: number | null;
  /** The config pattern the budget came from, so a surprise can be traced. */
  pattern: string | null;
  /** null unless the file is over budget and we worked out the alternative. */
  optimizedTokens: number | null;
}

async function judgeFile(
  path: string,
  text: string,
  budget: { maxTokens: number; pattern: string | null } | null,
  counter: Counter,
  level: RuleLevel,
  locale: Locale,
  pricing: PricingCatalogue,
): Promise<FileVerdict> {
  const tokens = await counter.count(text);
  const maxTokens = budget?.maxTokens ?? null;

  // Over budget: work out whether optimising would be enough, so the CI failure
  // carries a concrete next step instead of just a red number. Only for the
  // files that failed — optimising all of them would triple the work of a
  // directory run that is fine.
  let optimizedTokens: number | null = null;
  if (maxTokens !== null && tokens > maxTokens) {
    optimizedTokens = await counter.count(optimize(text, { level, locale, pricing }).optimized);
  }

  return { path, tokens, maxTokens, pattern: budget?.pattern ?? null, optimizedTokens };
}

const isOverBudget = (v: FileVerdict): boolean => v.maxTokens !== null && v.tokens > v.maxTokens;

/**
 * Token budget for CI: fails (exit code 1) when a prompt busts its budget, so a
 * template that grows unchecked breaks the build, not the bill.
 *
 * Given a directory it checks every prompt inside it against the budgets in
 * `trazum.config.json`, which is what makes a repository of prompts governable
 * as a whole rather than one CI step per file.
 */
async function commandCheck(
  args: Args,
  config: TrazumConfig,
  pricing: PricingCatalogue,
  t: CliMessages,
  locale: Locale,
): Promise<void> {
  const target = args.positional[0];
  const level = levelFlag(args, config, t);
  const counter = counterFor(args, t);

  // A flag beats the config, as everywhere else. -1 means "not given".
  const flagBudget = numberFlag(args, 'max-tokens', -1, t);

  const asDirectory = target !== undefined && target !== '-' ? await isDirectory(target) : false;

  if (asDirectory) {
    await checkDirectory(target!, args, flagBudget, config, counter, level, t, locale, pricing);
    return;
  }

  const prompt = await readInput(target, t);
  const n = (value: number): string => value.toLocaleString(t.numberLocale);

  // A single file falls back to the config budget for its own path, so
  // `trazum check prompts/system.txt` works with no flag once budgets exist.
  const configBudget = target ? budgetFor(target, config.budgets) : null;
  const maxTokens = flagBudget >= 0 ? flagBudget : (configBudget?.maxTokens ?? -1);
  if (maxTokens < 0) throw new Error(t.errors.checkNeedsMaxTokens());

  // A source file carrying markers is not one prompt, it is several. Budgeting
  // the whole file would measure the code around them, which is not what the
  // author asked to govern.
  const embedded = target && target !== '-' && hasMarker(prompt) ? extractPrompts(prompt) : null;
  if (embedded !== null && (embedded.prompts.length > 0 || embedded.declined.length > 0)) {
    await checkEmbedded(
      target!,
      embedded,
      { maxTokens, pattern: flagBudget >= 0 ? null : (configBudget?.pattern ?? null) },
      args,
      counter,
      level,
      t,
      locale,
      pricing,
    );
    return;
  }

  const verdict = await judgeFile(
    target ?? '-',
    prompt,
    { maxTokens, pattern: flagBudget >= 0 ? null : (configBudget?.pattern ?? null) },
    counter,
    level,
    locale,
    pricing,
  );
  const ok = !isOverBudget(verdict);

  // Written before anything can exit, and independently of --json, because the
  // whole point of the file is to survive a run that failed.
  await writeMarkdown(args, () =>
    renderCheckMarkdown({
      target: target ?? '-',
      verdicts: [verdict],
      level,
      tokenSource: counter.source,
      truncated: false,
      t,
    }),
  );

  if (boolFlag(args, 'json')) {
    console.log(
      JSON.stringify({
        ok,
        tokens: verdict.tokens,
        maxTokens,
        budgetPattern: verdict.pattern,
        tokenSource: counter.source,
        optimizedTokens: verdict.optimizedTokens,
        wouldFitOptimized:
          verdict.optimizedTokens !== null ? verdict.optimizedTokens <= maxTokens : null,
      }),
    );
  } else if (ok) {
    console.log(`${c.green(t.check.okLabel())} ${t.check.ok(n(verdict.tokens), n(maxTokens))}`);
  } else {
    console.error(
      `${c.red(t.check.failedLabel())} ${t.check.failed(n(verdict.tokens), n(maxTokens))}`,
    );
    if (verdict.optimizedTokens !== null) {
      console.error(
        verdict.optimizedTokens <= maxTokens
          ? t.check.wouldFit(level, n(verdict.optimizedTokens))
          : t.check.stillTooBig(n(verdict.optimizedTokens)),
      );
    }
  }

  if (!ok) process.exitCode = 1;
}

async function isDirectory(path: string): Promise<boolean> {
  return stat(path)
    .then((info) => info.isDirectory())
    .catch(() => false);
}

/**
 * Writes the markdown report, if one was asked for.
 *
 * Takes a thunk so a run without `--markdown-out` never pays to render it, and
 * is called before any `process.exitCode` is set: a report that only appears
 * when the check passed is a report nobody needs.
 *
 * A failure to write is reported and swallowed. The exit code belongs to the
 * budget, not to the reporting — a full disk on a CI runner must not turn a
 * passing check into a failing build, and it must certainly not turn a failing
 * one into a confusing one.
 */
async function writeMarkdown(args: Args, render: () => string): Promise<void> {
  const path = stringFlag(args, 'markdown-out');
  if (!path) return;

  try {
    const body = fitWithin(
      render(),
      MAX_SUMMARY_CHARS,
      '\n_Trimmed: the report is larger than a step summary can hold._',
    );
    await writeFile(path, `${body}\n`, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(c.yellow(`Could not write ${path}: ${message}`));
  }
}

/**
 * Checks every prompt under a directory.
 *
 * Two decisions worth naming. **A file with no budget is listed, not hidden**:
 * silently skipping it would let a prompt sit outside every pattern for months
 * while the report says everything is fine. And **finding no budget at all is
 * an error**, because "checked 40 files, 0 failures" from a run that measured
 * nothing is the most misleading output this tool could produce.
 */
/**
 * Budgets each prompt marked inside a source file.
 *
 * The budget applies per prompt, not to the file: a file holding four prompts is
 * four things to govern, and summing them would fail a build because somebody
 * added a fifth short one.
 *
 * Declined markers are reported before the verdicts and are **a failure**, not a
 * note. The author marked a prompt to have it governed; if Trazum cannot read it
 * then it is not governed, and a green build saying otherwise is the same lie as
 * "0 failures" from a run that measured nothing.
 */
async function checkEmbedded(
  path: string,
  extraction: { prompts: ExtractedPrompt[]; declined: DeclinedPrompt[] },
  budget: { maxTokens: number; pattern: string | null },
  args: Args,
  counter: Counter,
  level: RuleLevel,
  t: CliMessages,
  locale: Locale,
  pricing: PricingCatalogue,
): Promise<void> {
  const n = (value: number): string => value.toLocaleString(t.numberLocale);

  const verdicts: FileVerdict[] = [];
  for (const prompt of extraction.prompts) {
    verdicts.push(
      await judgeFile(promptId(path, prompt), prompt.text, budget, counter, level, locale, pricing),
    );
  }

  const failures = verdicts.filter(isOverBudget);
  const ok = failures.length === 0 && extraction.declined.length === 0;

  await writeMarkdown(args, () =>
    renderCheckMarkdown({
      target: path,
      verdicts,
      level,
      tokenSource: counter.source,
      truncated: false,
      t,
    }),
  );

  if (boolFlag(args, 'json')) {
    console.log(
      JSON.stringify(
        {
          ok,
          target: path,
          embedded: true,
          prompts: verdicts.map((v) => ({
            id: v.path,
            tokens: v.tokens,
            maxTokens: v.maxTokens,
            ok: !isOverBudget(v),
          })),
          declined: extraction.declined,
        },
        null,
        2,
      ),
    );
    if (!ok) process.exitCode = 1;
    return;
  }

  console.log();
  console.log(c.bold(t.check.embeddedHeading(path, extraction.prompts.length)));

  for (const verdict of verdicts) {
    const over = isOverBudget(verdict);
    const label = over ? c.red(t.check.failedLabel()) : c.green(t.check.okLabel());
    console.log(
      `  ${label} ${verdict.path} — ${n(verdict.tokens)}` +
        (verdict.maxTokens === null ? '' : ` / ${n(verdict.maxTokens)}`),
    );
  }

  if (extraction.declined.length > 0) {
    console.log();
    console.log(c.red(t.check.declinedHeading(extraction.declined.length)));
    for (const declined of extraction.declined) {
      console.log(`  ${c.dim(t.check.declinedAt(declined.line, declined.detail))}`);
    }
  }

  console.log();
  if (!ok) process.exitCode = 1;
}

async function checkDirectory(
  root: string,
  args: Args,
  flagBudget: number,
  config: TrazumConfig,
  counter: Counter,
  level: RuleLevel,
  t: CliMessages,
  locale: Locale,
  pricing: PricingCatalogue,
): Promise<void> {
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  // Source files are walked alongside prompt files rather than opted into.
  // Requiring config to discover a marker somebody just wrote is how `eval` came
  // to be fully implemented and completely undiscoverable; an unmarked source
  // file costs one `includes()` and is dropped.
  const extensions = config.extensions ?? [...DEFAULT_EXTENSIONS, ...SOURCE_EXTENSIONS];
  const { files, truncated } = await walkPrompts(root, { extensions });

  if (files.length === 0) {
    throw new Error(t.errors.noPromptsFound(root, extensions.join(' ')));
  }

  // --exact-tokens over a directory is one API round trip per file, and another
  // for each file that fails. `eval` prints its call count before spending
  // anything for the same reason: a command that looks hung gets killed, and
  // then nobody trusts it again.
  if (counter.source === 'external' && !boolFlag(args, 'json')) {
    console.log(c.dim(t.check.exactCountsCost(files.length)));
  }

  const verdicts: FileVerdict[] = [];
  const declined: Array<{ path: string; line: number; detail: string }> = [];

  for (const relativePath of files) {
    const text = await readFile(join(root, relativePath), 'utf8');
    // Budgets are keyed on paths as written in the repository, so a pattern like
    // `prompts/**` has to be matched against the path including the root the
    // user passed — not against the name relative to it.
    const keyed = joinPosix(root, relativePath);
    const fromConfig = budgetFor(keyed, config.budgets);
    const budget =
      fromConfig ?? (flagBudget >= 0 ? { maxTokens: flagBudget, pattern: null } : null);

    const isSource = SOURCE_EXTENSIONS.some((ext) => relativePath.toLowerCase().endsWith(ext));
    if (isSource) {
      // A source file is only a prompt file if it says so. One that does not is
      // dropped silently — it was never something the author asked to govern,
      // and listing it as unbudgeted would bury the files that are.
      if (!hasMarker(text)) continue;
      const extraction = extractPrompts(text);
      for (const prompt of extraction.prompts) {
        const id = promptId(keyed, prompt);
        const own = budgetFor(id, config.budgets) ?? budget;
        verdicts.push(await judgeFile(id, prompt.text, own, counter, level, locale, pricing));
      }
      for (const entry of extraction.declined) {
        declined.push({ path: keyed, line: entry.line, detail: entry.detail });
      }
      continue;
    }

    verdicts.push(await judgeFile(keyed, text, budget, counter, level, locale, pricing));
  }

  if (verdicts.length === 0 && declined.length === 0) {
    throw new Error(t.errors.noPromptsFound(root, extensions.join(' ')));
  }

  if (verdicts.every((v) => v.maxTokens === null)) {
    throw new Error(t.errors.noBudgetsApply(root, CONFIG_FILENAME));
  }

  const failures = verdicts.filter(isOverBudget);

  await writeMarkdown(args, () =>
    renderCheckMarkdown({
      target: root,
      verdicts,
      level,
      tokenSource: counter.source,
      truncated,
      t,
    }),
  );

  if (boolFlag(args, 'json')) {
    console.log(
      JSON.stringify(
        {
          ok: failures.length === 0 && declined.length === 0,
          root,
          tokenSource: counter.source,
          truncated,
          declined,
          files: verdicts.map((v) => ({
            path: v.path,
            tokens: v.tokens,
            maxTokens: v.maxTokens,
            budgetPattern: v.pattern,
            ok: !isOverBudget(v),
            optimizedTokens: v.optimizedTokens,
            wouldFitOptimized:
              v.optimizedTokens !== null && v.maxTokens !== null
                ? v.optimizedTokens <= v.maxTokens
                : null,
          })),
        },
        null,
        2,
      ),
    );
    if (failures.length > 0 || declined.length > 0) process.exitCode = 1;
    return;
  }

  // Every column is sized from the whole set before anything is printed, so the
  // paths line up down the page whatever the locale calls OK and FAILED, and
  // whether or not a row has a budget. A ragged table is one nobody scans.
  const labelWidth = Math.max(t.check.okLabel().length, t.check.failedLabel().length) + 2;
  const tokenWidth = Math.max(...verdicts.map((v) => n(v.tokens).length));
  const budgetWidth = Math.max(
    0,
    ...verdicts.map((v) => (v.maxTokens === null ? 0 : n(v.maxTokens).length)),
  );

  console.log();
  console.log(c.bold(t.check.directoryHeading(root, verdicts.length)));
  console.log();

  for (const verdict of verdicts) {
    const tokens = n(verdict.tokens).padStart(tokenWidth);

    if (verdict.maxTokens === null) {
      // Blanks where " / <budget>" would be, so the path column does not shift.
      console.log(
        `  ${c.dim('—'.padEnd(labelWidth))}${tokens}${' '.repeat(3 + budgetWidth)}   ` +
          `${verdict.path} ${c.dim(t.check.noBudget())}`,
      );
      continue;
    }

    const over = isOverBudget(verdict);
    const plain = over ? t.check.failedLabel() : t.check.okLabel();
    const label = (over ? c.red(plain) : c.green(plain)) + ' '.repeat(labelWidth - plain.length);
    const budget = n(verdict.maxTokens).padEnd(budgetWidth);
    console.log(`  ${label}${tokens} / ${budget}   ${verdict.path}`);

    if (over && verdict.optimizedTokens !== null) {
      console.log(
        `  ${' '.repeat(labelWidth)}${c.dim(
          verdict.optimizedTokens <= verdict.maxTokens
            ? t.check.wouldFit(level, n(verdict.optimizedTokens))
            : t.check.stillTooBig(n(verdict.optimizedTokens)),
        )}`,
      );
    }
  }

  // A marker Trazum could not read is a failure, not a footnote. The author
  // marked that prompt to have it governed; it is not being governed, and a
  // green summary alongside would be the same lie as "0 failures" from a run
  // that measured nothing.
  if (declined.length > 0) {
    console.log();
    console.log(c.red(t.check.declinedHeading(declined.length)));
    for (const entry of declined) {
      console.log(`  ${c.dim(`${entry.path} ${t.check.declinedAt(entry.line, entry.detail)}`)}`);
    }
  }

  console.log();
  const summary = t.check.directorySummary(failures.length, verdicts.length);
  const bad = failures.length > 0 || declined.length > 0;
  console.log(`  ${bad ? c.red(summary) : c.green(summary)}`);
  if (truncated) console.log(`  ${c.yellow(t.check.walkTruncated())}`);
  console.log();

  if (bad) process.exitCode = 1;
}

/** Joins two path fragments for display and glob matching, always with `/`. */
function joinPosix(root: string, relativePath: string): string {
  const trimmed = root.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  if (trimmed === '' || trimmed === '.') return relativePath;
  return `${trimmed}/${relativePath}`;
}


/**
 * Runs both prompt versions over a set of inputs and reports whether the
 * optimisation changed the answers.
 *
 * This is the only command that spends real money, and it spends it three
 * times per case: the original twice to measure the model's own variance, the
 * optimised once. The doubled original is what makes the answer mean anything
 * — without it, "diverged on 3 of 10" could be better than the original
 * manages against itself. The cost is printed before any call goes out.
 */
async function commandEval(
  args: Args,
  config: TrazumConfig,
  t: CliMessages,
  locale: Locale,
): Promise<void> {
  const prompt = await readInput(args.positional[0], t);
  const level = levelFlag(args, config, t);

  const casesPath = stringFlag(args, 'cases');
  if (!casesPath) throw new Error(t.errors.evalNeedsCases());

  const inputs = parseCases(await readFile(casesPath, 'utf8'));
  if (inputs.length === 0) throw new Error(t.errors.evalNoCases(casesPath));

  const provider = providerFromEnv();
  if (!provider) throw new Error(t.errors.llmNotConfigured());

  const optimized = optimize(prompt, { level, locale }).optimized;
  if (optimized === prompt) {
    console.log(c.yellow(t.eval.nothingToCompare()));
    return;
  }

  console.log();
  console.log(c.dim(t.eval.starting(inputs.length, inputs.length * 3, provider.model)));

  const report = await evaluate(prompt, optimized, inputs, provider, {
    concurrency: numberFlag(args, 'concurrency', 3, t),
  });

  if (boolFlag(args, 'json')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const pct = (value: number): string => `${(value * 100).toFixed(0)}%`;
  console.log();
  console.log(c.bold(t.eval.heading()));
  console.log(`  ${t.eval.selfAgreement(pct(report.selfAgreement))}`);
  console.log(`  ${t.eval.crossAgreement(pct(report.crossAgreement))}`);
  console.log();

  const verdict = t.eval.verdict(report.verdict);
  const paint =
    report.verdict === 'diverges'
      ? c.red
      : report.verdict === 'inconclusive'
        ? c.yellow
        : c.green;
  console.log(`  ${paint(verdict.label)}`);
  console.log(`    ${c.dim(wrap(verdict.detail, 74, '    '))}`);

  // The worst cases first: if anything broke, it is what the reader came for.
  const worst = [...report.cases]
    .sort((a, b) => a.crossSimilarity - b.crossSimilarity)
    .slice(0, 3)
    .filter((entry) => entry.crossSimilarity < 0.999);

  if (worst.length > 0) {
    console.log();
    console.log(c.bold(t.eval.mostChanged()));
    for (const entry of worst) {
      console.log(`  ${c.dim(truncate(entry.input, 62))}`);
      console.log(
        `    ${t.eval.caseAgreement(pct(entry.crossSimilarity), pct(entry.selfSimilarity))}`,
      );
    }
  }

  console.log();
  console.log(c.dim(`  ${t.eval.callsMade(report.callsMade)}`));
  console.log();

  if (report.verdict === 'diverges') process.exitCode = 1;
}

/** One case per line, or a JSON array of strings. Blank lines and # comments ignored. */
function parseCases(raw: string): string[] {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === 'string');
      }
    } catch {
      // Fall through to line mode: a file that merely starts with "[" is more
      // likely a prompt than a broken JSON document.
    }
  }
  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}


/**
 * Compares two versions of a prompt. Built for a pull request: it reports by
 * default and only fails the build when a growth limit was explicitly asked
 * for, because a tool that fails a build nobody armed gets removed from the
 * pipeline rather than fixed.
 */
async function commandDiff(
  args: Args,
  config: TrazumConfig,
  pricing: PricingCatalogue,
  t: CliMessages,
  locale: Locale,
): Promise<void> {
  const [beforePath, afterPath] = args.positional;
  if (!beforePath || !afterPath) throw new Error(t.errors.diffNeedsTwoFiles());

  const [before, after] = await Promise.all([
    readInput(beforePath, t),
    readInput(afterPath, t),
  ]);

  const comparison = comparePrompts(before, after, {
    level: levelFlag(args, config, t),
    locale,
    optimizeBoth: boolFlag(args, 'optimized'),
    usage: usageFrom(args, config, t),
    pricing,
  });

  await writeMarkdown(args, () =>
    renderDiffMarkdown({
      comparison,
      beforePath,
      afterPath,
      optimized: boolFlag(args, 'optimized'),
      locale,
      t,
    }),
  );

  if (boolFlag(args, 'json')) {
    console.log(JSON.stringify(comparison, null, 2));
  } else {
    printComparison(comparison, beforePath, afterPath, boolFlag(args, 'optimized'), t);
  }

  // The gate stays opt-in, and a config file counts as opting in: a repository
  // that wrote down `"maxGrowth": 25` has armed it as deliberately as a flag
  // would. What has not changed is that *absent* both, growth alone exits 0.
  const limit =
    typeof args.flags.get('max-growth') === 'string'
      ? numberFlag(args, 'max-growth', 0, t)
      : config.maxGrowth;

  if (limit !== undefined && comparison.tokenDelta > limit) {
    console.error(`\n${c.red(t.diff.overLimit(comparison.tokenDelta, limit))}`);
    process.exitCode = 1;
  }
}

function printComparison(
  comparison: PromptComparison,
  beforePath: string,
  afterPath: string,
  optimized: boolean,
  t: CliMessages,
): void {
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const grew = comparison.tokenDelta > 0;
  const paint = grew ? c.red : comparison.tokenDelta < 0 ? c.green : c.dim;
  const signed = (value: number): string => `${value > 0 ? '+' : ''}${n(value)}`;

  console.log();
  console.log(c.bold(t.diff.heading(beforePath, afterPath)));
  if (optimized) console.log(c.dim(`  ${t.diff.measuringOptimised()}`));
  console.log();
  console.log(
    `  ${n(comparison.tokensBefore)} → ${n(comparison.tokensAfter)} tokens   ` +
      paint(`${signed(comparison.tokenDelta)} (${signed(Math.round(comparison.deltaPct))}%)`),
  );
  console.log(
    `  ${t.diff.monthly(
      formatSignedUsd(comparison.monthlyDeltaUsd),
      n(comparison.usage.callsPerMonth),
      getModel(comparison.usage.model).displayName,
    )}`,
  );

  const { rules, advisories } = comparison;
  const copy = getMessages(t.locale).rules;

  if (advisories.appeared.length > 0) {
    console.log();
    console.log(c.yellow(`  ${t.diff.advisoriesAppeared()}`));
    for (const id of advisories.appeared) console.log(`    ! ${id}`);
  }
  if (advisories.resolved.length > 0) {
    console.log();
    console.log(c.green(`  ${t.diff.advisoriesResolved()}`));
    for (const id of advisories.resolved) console.log(`    ✓ ${id}`);
  }
  if (rules.newlyFiring.length > 0) {
    console.log();
    console.log(`  ${t.diff.rulesNewlyFiring()}`);
    for (const id of rules.newlyFiring) console.log(`    ${c.dim(copy[id].title)}`);
  }
  if (rules.noLongerFiring.length > 0) {
    console.log();
    console.log(`  ${t.diff.rulesNoLongerFiring()}`);
    for (const id of rules.noLongerFiring) console.log(`    ${c.dim(copy[id].title)}`);
  }

  console.log();
}

// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let locale = localeFromArgv(argv);
  let t = getCliMessages(locale);
  const args = parseArgs(argv, t);

  if (boolFlag(args, 'help') || boolFlag(args, 'h') || !args.command) {
    console.log(
      t.help(
        {
          model: DEFAULT_USAGE.model,
          callsPerMonth: DEFAULT_USAGE.callsPerMonth,
          avgOutputTokens: DEFAULT_USAGE.avgOutputTokens,
          cacheHitRate: DEFAULT_USAGE.cacheHitRate,
          locales: LOCALES,
        },
        c.bold,
      ),
    );
    return;
  }

  rejectUnknownFlags(args, t);

  // Loaded before dispatch so every command sees the same settings, and after
  // flag validation so a typo is reported before any file is touched. An
  // invalid config throws here rather than quietly reverting to defaults —
  // "defaults" for a budget means "no budget", which means a green build.
  const loaded = await loadConfig({ explicit: stringFlag(args, 'config') });
  const { config } = loaded;
  const pricing = await pricingFor(args, loaded);

  // The config only gets to choose the locale when nothing more explicit did.
  if (config.locale && !stringFlag(args, 'locale')) {
    locale = detectLocale(undefined, process.env, config.locale);
    t = getCliMessages(locale);
  }

  switch (args.command) {
    case 'optimize':
      await commandOptimize(args, config, pricing, t, locale);
      break;
    case 'check':
      await commandCheck(args, config, pricing, t, locale);
      break;
    case 'eval':
      await commandEval(args, config, t, locale);
      break;
    case 'diff':
      await commandDiff(args, config, pricing, t, locale);
      break;
    case 'models':
      commandModels(t, pricing);
      break;
    case 'where':
      await commandWhere(args, config, pricing, t);
      break;
    case 'rules':
      commandRules(t, locale);
      break;
    default:
      throw new Error(t.errors.unknownCommand(args.command));
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const t = getCliMessages(localeFromArgv(process.argv.slice(2)));
  console.error(`\n${c.red(t.errors.errorLabel())}: ${message}\n`);
  process.exitCode = 1;
});
