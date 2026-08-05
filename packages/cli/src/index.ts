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
  evaluate,
  refineWithLlm,
  reviewExamples,
  withExactTokenCounts,
} from '@trazum/core';
import type {
  ExampleReview,
  PromptComparison,
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
  loadConfig,
  walkPrompts,
} from '@trazum/core/node';
import type { TrazumConfig } from '@trazum/core/node';

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

/** Usage profile from flags over config over the built-in defaults. */
function usageFrom(args: Args, config: TrazumConfig, t: CliMessages): UsageProfile {
  const fromConfig = config.usage ?? {};
  const model = stringFlag(args, 'model') ?? fromConfig.model ?? DEFAULT_USAGE.model;
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
const GLOBAL_FLAGS = ['help', 'h', 'locale', 'json', 'config'];
const COMMAND_FLAGS: Record<string, string[]> = {
  optimize: [
    'level', 'model', 'calls', 'output-tokens', 'cache-hit-rate', 'batch',
    'disable', 'llm', 'exact-tokens', 'diff', 'out', 'o',
  ],
  check: ['max-tokens', 'level', 'exact-tokens', 'markdown-out'],
  eval: ['cases', 'level', 'concurrency'],
  diff: ['level', 'model', 'calls', 'output-tokens', 'batch', 'max-growth', 'optimized', 'markdown-out'],
  models: [],
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

async function commandOptimize(
  args: Args,
  config: TrazumConfig,
  t: CliMessages,
  locale: Locale,
): Promise<void> {
  const prompt = await readInput(args.positional[0], t);
  const level = levelFlag(args, config, t);
  const usage = usageFrom(args, config, t);

  const disableRules = disabledRules(args, config) ?? [];
  for (const id of disableRules) {
    if (!RULES.some((r) => r.id === id)) {
      throw new Error(t.errors.unknownRuleInDisable(id));
    }
  }

  let result = optimize(prompt, {
    level,
    usage,
    locale,
    disableRules,
  });

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
    );
  }

  const outPath = stringFlag(args, 'out');
  if (outPath) {
    await writeFile(outPath, result.optimized, 'utf8');
  }

  if (boolFlag(args, 'json')) {
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

  printReport(result, boolFlag(args, 'diff'), t, examplesReview);
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
): Promise<FileVerdict> {
  const tokens = await counter.count(text);
  const maxTokens = budget?.maxTokens ?? null;

  // Over budget: work out whether optimising would be enough, so the CI failure
  // carries a concrete next step instead of just a red number. Only for the
  // files that failed — optimising all of them would triple the work of a
  // directory run that is fine.
  let optimizedTokens: number | null = null;
  if (maxTokens !== null && tokens > maxTokens) {
    optimizedTokens = await counter.count(optimize(text, { level, locale }).optimized);
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
    await checkDirectory(target!, args, flagBudget, config, counter, level, t, locale);
    return;
  }

  const prompt = await readInput(target, t);
  const n = (value: number): string => value.toLocaleString(t.numberLocale);

  // A single file falls back to the config budget for its own path, so
  // `trazum check prompts/system.txt` works with no flag once budgets exist.
  const configBudget = target ? budgetFor(target, config.budgets) : null;
  const maxTokens = flagBudget >= 0 ? flagBudget : (configBudget?.maxTokens ?? -1);
  if (maxTokens < 0) throw new Error(t.errors.checkNeedsMaxTokens());

  const verdict = await judgeFile(
    target ?? '-',
    prompt,
    { maxTokens, pattern: flagBudget >= 0 ? null : (configBudget?.pattern ?? null) },
    counter,
    level,
    locale,
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
async function checkDirectory(
  root: string,
  args: Args,
  flagBudget: number,
  config: TrazumConfig,
  counter: Counter,
  level: RuleLevel,
  t: CliMessages,
  locale: Locale,
): Promise<void> {
  const n = (value: number): string => value.toLocaleString(t.numberLocale);
  const { files, truncated } = await walkPrompts(root, { extensions: config.extensions });

  if (files.length === 0) {
    const extensions = (config.extensions ?? DEFAULT_EXTENSIONS).join(' ');
    throw new Error(t.errors.noPromptsFound(root, extensions));
  }

  // --exact-tokens over a directory is one API round trip per file, and another
  // for each file that fails. `eval` prints its call count before spending
  // anything for the same reason: a command that looks hung gets killed, and
  // then nobody trusts it again.
  if (counter.source === 'external' && !boolFlag(args, 'json')) {
    console.log(c.dim(t.check.exactCountsCost(files.length)));
  }

  const verdicts: FileVerdict[] = [];
  for (const relativePath of files) {
    const text = await readFile(join(root, relativePath), 'utf8');
    // Budgets are keyed on paths as written in the repository, so a pattern like
    // `prompts/**` has to be matched against the path including the root the
    // user passed — not against the name relative to it.
    const keyed = joinPosix(root, relativePath);
    const fromConfig = budgetFor(keyed, config.budgets);
    const budget =
      fromConfig ?? (flagBudget >= 0 ? { maxTokens: flagBudget, pattern: null } : null);
    verdicts.push(await judgeFile(keyed, text, budget, counter, level, locale));
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
          ok: failures.length === 0,
          root,
          tokenSource: counter.source,
          truncated,
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
    if (failures.length > 0) process.exitCode = 1;
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

  console.log();
  const summary = t.check.directorySummary(failures.length, verdicts.length);
  console.log(`  ${failures.length > 0 ? c.red(summary) : c.green(summary)}`);
  if (truncated) console.log(`  ${c.yellow(t.check.walkTruncated())}`);
  console.log();

  if (failures.length > 0) process.exitCode = 1;
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
  const { config } = await loadConfig({ explicit: stringFlag(args, 'config') });

  // The config only gets to choose the locale when nothing more explicit did.
  if (config.locale && !stringFlag(args, 'locale')) {
    locale = detectLocale(undefined, process.env, config.locale);
    t = getCliMessages(locale);
  }

  switch (args.command) {
    case 'optimize':
      await commandOptimize(args, config, t, locale);
      break;
    case 'check':
      await commandCheck(args, config, t, locale);
      break;
    case 'eval':
      await commandEval(args, config, t, locale);
      break;
    case 'diff':
      await commandDiff(args, config, t, locale);
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
