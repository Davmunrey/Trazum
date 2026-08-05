#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';

import {
  DEFAULT_USAGE,
  LOCALES,
  PRICING_LAST_REVIEWED,
  RULES,
  countTokensAnthropic,
  estimateTokens,
  formatUsd,
  getMessages,
  listModels,
  optimize,
  providerFromEnv,
  refineWithLlm,
  reviewExamples,
  withExactTokenCounts,
} from '@trazum/core';
import type {
  ExampleReview,
  Locale,
  OptimizationResult,
  RuleId,
  RuleLevel,
  UsageProfile,
} from '@trazum/core';

import { detectLocale, getCliMessages } from './i18n/index.js';
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
}

function parseArgs(argv: string[], t: CliMessages): Args {
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];
  const takesValue = new Set([
    'level',
    'model',
    'calls',
    'output-tokens',
    'cache-hit-rate',
    'disable',
    'max-tokens',
    'locale',
    'out',
    'o',
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('-') || arg === '-') {
      positional.push(arg);
      continue;
    }
    const name = arg.replace(/^--?/, '');
    if (takesValue.has(name)) {
      const value = argv[++i];
      if (value === undefined) throw new Error(t.errors.optionNeedsValue(name));
      flags.set(name === 'o' ? 'out' : name, value);
    } else {
      flags.set(name, true);
    }
  }

  return { command: positional[0] ?? '', positional: positional.slice(1), flags };
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

function levelFlag(args: Args, t: CliMessages): RuleLevel {
  const level = (args.flags.get('level') ?? 'safe') as RuleLevel;
  if (level !== 'safe' && level !== 'aggressive') {
    throw new Error(t.errors.badLevel(String(level)));
  }
  return level;
}

// --------------------------------------------------------------------------
// Line-by-line diff
// --------------------------------------------------------------------------

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

function renderDiff(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
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

function printReport(
  result: OptimizationResult,
  showDiff: boolean,
  t: CliMessages,
  examplesReview: ExampleReview | null = null,
): void {
  const { savings } = result;
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const sourceNote =
    result.tokenSource === 'heuristic' ? c.dim(t.report.estimated()) : c.dim(t.report.exactCount());

  console.log();
  console.log(c.bold(t.report.inputTokens()));
  console.log(
    `  ${n(result.tokensBefore)} → ${c.green(n(result.tokensAfter))}   ${c.bold(
      `-${result.reductionPct.toFixed(1)}%`,
    )}${sourceNote}`,
  );

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

  console.log();
  console.log(c.bold(t.report.costWith(savings.modelDisplayName)));
  console.log(
    `  ${t.report.usageLine(
      n(result.usage.callsPerMonth),
      result.usage.avgOutputTokens,
      result.usage.batchEligible,
    )}`,
  );
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

  if (result.advisories.length > 0) {
    console.log();
    console.log(c.bold(t.report.beyondShortening()));
    for (const advisory of result.advisories) {
      const marker =
        advisory.severity === 'warning'
          ? c.yellow('!')
          : advisory.severity === 'opportunity'
            ? c.cyan('→')
            : c.dim('·');
      const money =
        advisory.estimatedMonthlyUsd !== null
          ? c.green(t.report.perMonthSuffix(formatUsd(advisory.estimatedMonthlyUsd)))
          : '';
      console.log(`  ${marker} ${c.bold(advisory.title)}${money}`);
      console.log(`    ${c.dim(wrap(advisory.detail, 76, '    '))}`);
    }
  }

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
    console.log(renderDiff(result.original, result.optimized));
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

function commandModels(t: CliMessages): void {
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const col = t.models.columns;

  console.log();
  console.log(c.bold(t.models.title()) + c.dim(t.models.unit()));
  console.log(c.dim(t.models.reviewedOn(PRICING_LAST_REVIEWED)));
  console.log();

  const rows = listModels().map((m) => ({
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

async function commandOptimize(args: Args, t: CliMessages, locale: Locale): Promise<void> {
  const prompt = await readInput(args.positional[0], t);
  const level = levelFlag(args, t);

  const model = stringFlag(args, 'model');
  const usage: Partial<UsageProfile> = {
    ...(model ? { model } : {}),
    callsPerMonth: numberFlag(args, 'calls', DEFAULT_USAGE.callsPerMonth, t),
    avgOutputTokens: numberFlag(args, 'output-tokens', DEFAULT_USAGE.avgOutputTokens, t),
    cacheHitRate: numberFlag(args, 'cache-hit-rate', DEFAULT_USAGE.cacheHitRate, t),
    batchEligible: args.flags.has('batch'),
  };

  const disableRaw = stringFlag(args, 'disable');
  const disableRules = (disableRaw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const id of disableRules) {
    if (!RULES.some((r) => r.id === id)) {
      throw new Error(t.errors.unknownRuleInDisable(id));
    }
  }

  let result = optimize(prompt, {
    level,
    usage,
    locale,
    disableRules: disableRules as RuleId[],
  });

  let examplesReview: ExampleReview | null = null;

  if (args.flags.has('llm')) {
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

  if (args.flags.has('exact-tokens')) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(t.errors.exactTokensNeedsKey());
    }
    result = await withExactTokenCounts(
      result,
      countTokensAnthropic({ apiKey, model: result.usage.model }),
    );
  }

  const outPath = stringFlag(args, 'out');
  if (outPath) {
    await writeFile(outPath, result.optimized, 'utf8');
  }

  if (args.flags.has('json')) {
    console.log(
      JSON.stringify(examplesReview ? { ...result, examplesReview } : result, null, 2),
    );
    return;
  }

  if (!process.stdout.isTTY && !outPath) {
    // Redirected to a file or another process: the prompt alone, no chrome.
    process.stdout.write(result.optimized);
    return;
  }

  printReport(result, args.flags.has('diff'), t, examplesReview);
  if (outPath) {
    console.log(c.dim(t.report.wroteTo(outPath)));
    console.log();
  }
}

/**
 * Token budget for CI: fails (exit code 1) when the prompt busts it, so a
 * template that grows unchecked breaks the build, not the bill.
 */
async function commandCheck(args: Args, t: CliMessages, locale: Locale): Promise<void> {
  const prompt = await readInput(args.positional[0], t);
  const n = (value: number): string => value.toLocaleString(t.numberLocale);

  const maxTokens = numberFlag(args, 'max-tokens', -1, t);
  if (maxTokens < 0) {
    throw new Error(t.errors.checkNeedsMaxTokens());
  }

  const level = levelFlag(args, t);

  let count = (text: string): Promise<number> => Promise.resolve(estimateTokens(text));
  let source: 'heuristic' | 'external' = 'heuristic';

  if (args.flags.has('exact-tokens')) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error(t.errors.exactTokensNeedsKey());
    const exact = countTokensAnthropic({ apiKey });
    count = (text) => exact(text);
    source = 'external';
  }

  const tokens = await count(prompt);
  const ok = tokens <= maxTokens;

  // Over budget: work out whether optimising would be enough, so the CI
  // failure carries a concrete next step instead of just a red number.
  let optimizedTokens: number | null = null;
  if (!ok) {
    const optimized = optimize(prompt, { level, locale }).optimized;
    optimizedTokens = await count(optimized);
  }

  if (args.flags.has('json')) {
    console.log(
      JSON.stringify({
        ok,
        tokens,
        maxTokens,
        tokenSource: source,
        optimizedTokens,
        wouldFitOptimized: optimizedTokens !== null ? optimizedTokens <= maxTokens : null,
      }),
    );
  } else if (ok) {
    console.log(`${c.green(t.check.okLabel())} ${t.check.ok(n(tokens), n(maxTokens))}`);
  } else {
    console.error(`${c.red(t.check.failedLabel())} ${t.check.failed(n(tokens), n(maxTokens))}`);
    if (optimizedTokens !== null) {
      console.error(
        optimizedTokens <= maxTokens
          ? t.check.wouldFit(level, n(optimizedTokens))
          : t.check.stillTooBig(n(optimizedTokens)),
      );
    }
  }

  if (!ok) process.exitCode = 1;
}

// --------------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const locale = localeFromArgv(argv);
  const t = getCliMessages(locale);
  const args = parseArgs(argv, t);

  if (args.flags.has('help') || args.flags.has('h') || !args.command) {
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

  switch (args.command) {
    case 'optimize':
      await commandOptimize(args, t, locale);
      break;
    case 'check':
      await commandCheck(args, t, locale);
      break;
    case 'models':
      commandModels(t);
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
