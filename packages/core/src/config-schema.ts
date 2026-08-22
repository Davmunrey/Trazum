import { BASELINE_FILENAME } from './baseline.js';
import type { OutcomeVocabulary } from './outcome.js';
import type { LadderPolicy } from './ladder.js';
import type { OwnersConfig } from './owners.js';
import { mostSpecificMatch } from './glob.js';
import type { PricingCatalogue } from './pricing.js';
import { isLocale } from './i18n/index.js';
import { nearestName } from './nearest.js';
import { RULES } from './rules.js';
import type { Locale } from './i18n/index.js';
import type { RuleId, RuleLevel, UsageProfile } from './types.js';

/**
 * The shape and validation of `trazum.config.json`. No filesystem access — the
 * loader that reads the file lives in `config.ts`, which is only reachable via
 * `@trazum/core/node`. Keeping the schema pure is what lets the browser bundle
 * import the types and key lists without dragging `node:fs` into its graph.
 *
 * The problem this solves is small and real: every command in a repository's CI
 * repeats the same four flags, and the one place they get out of step is the
 * place the numbers stop meaning anything.
 *
 * **Every validation failure here throws.** That is the whole design. A config
 * file is trusted to carry a budget, and the failure mode of a lenient parser
 * is a typo'd key silently ignored, defaults quietly restored, and a green
 * build for a prompt nobody measured. An unreadable config is a loud error; a
 * config that half-applies is a lie.
 */

export const CONFIG_FILENAME = 'trazum.config.json';

/**
 * Largest config file this will read.
 *
 * A config is a couple of dozen lines. This exists so a hostile or accidental
 * multi-megabyte file is refused before `JSON.parse` is handed the whole thing.
 */
export const MAX_CONFIG_BYTES = 64 * 1024;

/** How far up the tree the search for a config file will walk. */
export const MAX_CONFIG_SEARCH_DEPTH = 32;

export interface BaselineConfig {
  /** Path to the baseline file, relative to the config. */
  path: string;
  /**
   * Thresholds. At least one is required — see `parseBaselineConfig` for why a
   * baseline with no threshold is a configuration error rather than a default.
   */
  maxGrowthTokens?: number;
  maxGrowthPct?: number;
}

/**
 * Money budgets, in dollars, for the log-reading side of the tool.
 *
 * A budget for a workload that made no calls is **not** a pass and not a
 * failure: it is a measurement that did not happen, and the report says so
 * rather than reporting green over an absence. That is the same three-state
 * rule the counts, the timestamps and the stop reasons all follow.
 */
export interface WaiveEntry {
  /** One of `WAIVABLE_GATES`, or `byLabel:<label>` for one label's budget. */
  gate: string;
  /** Why, in prose. Required: a silence nobody can audit is not a decision. */
  reason: string;
  /** The day the waiver stops silencing, `YYYY-MM-DD`, judged in UTC at run time. */
  until: string;
}

export interface SpendConfig {
  /** Whole-log budget. `--max-usd` overrides it. */
  maxUsd?: number;
  /**
   * The calendar-month budget, spent against **measured** store records.
   *
   * A separate key from `maxUsd` on purpose, and the reason is worth stating
   * because reusing one would have been so much less code. `maxUsd` gates
   * *this log* — whatever period the file somebody passed happens to cover.
   * This gates *this month*. Same units, different denominators, and one key
   * carrying both is precisely how two surfaces of the same product come to
   * disagree about how much is left: `serve` read `maxUsd` and compared it
   * against the whole store, which could be a year, and reported the result as
   * a budget position with a straight face.
   *
   * Nothing infers one from the other. A repository with a per-log gate and no
   * monthly budget has no monthly position, and the tools say so rather than
   * picking a number that is the right shape.
   */
  monthlyUsd?: number;
  /**
   * Per-day budget — the gate a whole-log total cannot arm. `--max-day-usd`
   * overrides it, and it inherits that flag's refusals: a log with no clock
   * fails rather than passes, because "not measured" is not "under budget".
   */
  maxDayUsd?: number;
  /**
   * Per-conversation budget — the unit an agent product actually blows up
   * in. `--max-session-usd` overrides it; a log with no sessions fails it,
   * for the day budget's reason.
   */
  maxSessionUsd?: number;
  /**
   * What caching may add to the bill before it is a failure.
   *
   * `--max-cache-loss-usd` has gated this since 1.21 and only as a flag,
   * which made it a gate `watch` could not read: a policy that lives in one
   * invocation is a policy nothing else can act on. It inherits the flag's
   * refusal — the worst case is read when the log did not record the write
   * TTL, because a gate reading the flattering half passes the bills it
   * exists to catch.
   */
  maxCacheLossUsd?: number;
  /** Per-label budgets, each gated against that label's own spend. */
  byLabel?: Record<string, number>;
  /**
   * Money budgets per source, in dollars — the fleet's version of `byLabel`.
   * A source is a named service from the top-level `sources` block, and a
   * budget written here fails `profile --by-source` when that service alone
   * crosses it, with the failing service named rather than a total that
   * hides which.
   */
  bySource?: Record<string, number>;
  /**
   * Model substitutions the gateway may make **when a budget is crossed**, by
   * model id, each with the operator's own reason.
   *
   * Absent means refuse rather than swap, and that is the only safe default
   * for a field whose entire risk is being switched on without anybody
   * noticing. Silently answering a different question than the caller asked is
   * the one behaviour this product must never have; a substitution written
   * down, with a reason, by somebody who owns the budget, is a decision.
   *
   * Every substituted call is marked in the record, so no later report can
   * treat it as the call the caller made.
   */
  substitute?: Record<string, { to: string; reason: string }>;
}

export interface TrazumConfig {
  level?: RuleLevel;
  locale?: Locale;
  disable?: RuleId[];
  usage?: Partial<UsageProfile>;
  /**
   * Token budgets by glob pattern. The most specific matching pattern wins —
   * see `mostSpecificMatch`, which states what "specific" means rather than
   * leaving it to be inferred.
   */
  budgets?: Record<string, number>;
  /**
   * Which prompt file each usage-log label sends, so `profile` can close the
   * loop it opens.
   *
   * `profile` can say "caching loses money on `support-rag`" and nothing more —
   * the log carries counts, not content. With this map it reads the named file
   * and says *why*: where the first placeholder sits, how many stable tokens
   * never reach the cacheable prefix, and whether the model's minimum is met at
   * all. The file is whatever is in the repository today, which may not be what
   * produced the log, and the report says so.
   */
  labels?: Record<string, string>;
  /**
   * Money budgets for `trazum profile`, in dollars.
   *
   * `budgets` gates the tokens a prompt file may hold; this gates the dollars
   * a usage log records — the same difference `check` and `profile` have
   * everywhere else. Written in the repository rather than passed as a flag
   * because a per-workload budget is a policy several people agree on, and a
   * policy that lives in one CI invocation is a policy nobody can read.
   *
   * `maxUsd` is the default for `--max-usd`; `byLabel` gates each named
   * workload against its own limit in the same run. A flag still wins over
   * the config, as everywhere in this tool.
   */
  /**
   * The fleet: named services, each a list of glob patterns over usage-log
   * paths. `profile --by-source` builds one report per source plus a rollup,
   * assigning each file to the most specific matching pattern — the same
   * precedence rule the budget patterns use. A file matching no source is
   * named in the output rather than silently joining no report.
   */
  sources?: Record<string, string[]>;
  spend?: SpendConfig;
  /**
   * Findings as policy: a gate failure the team has looked at and decided to
   * live with, on the record, for a bounded time.
   *
   * All three fields are required, and the expiry is the entire mechanism by
   * which a waiver stays a decision instead of becoming a habit: a waiver
   * with no end date is a finding deleted with extra steps, and a reasonless
   * one is a silence nobody can audit. Waived failures render as waived,
   * never hidden — the bill still counts them; only the exit code is quiet.
   */
  /**
   * How long the local usage store keeps a measurement.
   *
   * Retention is a policy, so it lives in the repository beside the budgets
   * rather than in whichever invocation happened to run the prune. There is
   * deliberately **no default**: deleting measurements on a policy nobody
   * wrote down is not something anybody should get by accident, so `--prune`
   * with neither this nor `--keep` refuses and says so.
   */
  store?: { keepDays?: number };
  waive?: WaiveEntry[];
  /** Default for `trazum diff --max-growth`, in tokens. */
  maxGrowth?: number;
  /**
   * The cost baseline, and how much drift from it is tolerated.
   *
   * This is the difference between a ceiling and a gate. `budgets` asks whether
   * a file fits; this asks whether the repository got worse than it was at the
   * commit somebody recorded. Present in the config means `trazum check` in
   * directory mode reads the baseline and gates on it without a flag — a gate
   * you have to remember to pass an argument to is a gate that runs in the
   * author's terminal and not in CI.
   */
  baseline?: BaselineConfig;
  /**
   * The product's own outcome vocabulary, and which values are successes.
   *
   * **Declared rather than guessed, and the second half is why.** `resolved`,
   * `escalated`, `deflected`, `abandoned` — every product has its own words,
   * and which of them count as success is a product judgement this tool has no
   * standing to make. A tool that decided `escalated` was a failure would be
   * wrong at every company where escalation is the correct, designed outcome
   * for a whole class of request.
   *
   * A value in a log that this never declared is **named as undeclared**
   * rather than bucketed into either side: a typo in an exporter should show up
   * as a typo, not as a shift in the success rate.
   */
  outcomes?: OutcomeVocabulary;
  /**
   * Per-workload escalation ladders: cheap model first, escalate on a recorded
   * failure.
   *
   * Priced honestly rather than sold as a saving. An escalation pays **twice**
   * — the cheap attempt is not refunded — so a ladder only saves below a
   * specific escalation rate, and `trazum ladder` states that rate beside the
   * measured one. A ladder recommended without that number is the same
   * head-arithmetic error `plan` exists to kill.
   *
   * `escalateOn` names recorded outcome values, never inferred conditions.
   * This is a control loop rather than a report: a report built on a guess
   * prints a wrong number, and a control loop built on a guess sends real
   * traffic to a more expensive model on the strength of that guess, forever.
   */
  ladders?: Record<string, LadderPolicy>;
  /**
   * Whose money: label patterns per owner, declared shared splits, and
   * per-owner budgets.
   *
   * **The unallocated is never spread.** Spend matching no owner stays its own
   * line until somebody claims it — splitting it proportionally is the single
   * most common lie in cost reporting, and it makes every team's figure wrong
   * by an amount nobody can see, hitting hardest the team whose instrumentation
   * is cleanest.
   *
   * A shared workload is split by a rule written here, and the rule travels
   * with the report so the argument happens about the rule rather than about
   * the number.
   */
  owners?: OwnersConfig;
  /** File extensions directory mode treats as prompts. */
  extensions?: string[];
  /**
   * Paths directory mode leaves out, as globs relative to the walk root.
   *
   * The companion to `extensions`, and it exists because the extension alone
   * cannot tell a prompt from a test fixture. A repository with a corpus of
   * `.txt` files gets every one of them counted, budgeted and baselined — which
   * is what happened to this project's own repository and is why no baseline of
   * it was ever committed.
   *
   * A directory matched here is not descended into at all.
   */
  ignore?: string[];
  /**
   * Path to a pricing overlay, relative to the config file.
   *
   * Lets a project correct a published price without upgrading the library. The
   * bundled catalogue stays the default; this only layers on top.
   */
  pricing?: string;
}

/**
 * Every key the config accepts. Exported so the CLI's help can be tested
 * against it rather than against a second hand-maintained list — a setting the
 * help never mentions is one only the changelog knows about.
 */
export const CONFIG_KEYS = [
  'level',
  'locale',
  'disable',
  'usage',
  'budgets',
  'labels',
  'spend',
  'sources',
  'store',
  'waive',
  'maxGrowth',
  'baseline',
  'extensions',
  'ignore',
  'pricing',
  'outcomes',
  'ladders',
  'owners',
] as const;

export const CONFIG_BASELINE_KEYS = ['path', 'maxGrowthTokens', 'maxGrowthPct'] as const;

export const CONFIG_SPEND_KEYS = ['maxUsd', 'monthlyUsd', 'maxDayUsd', 'maxSessionUsd', 'maxCacheLossUsd', 'byLabel', 'bySource', 'substitute'] as const;

export const CONFIG_WAIVE_KEYS = ['gate', 'reason', 'until'] as const;

export const CONFIG_STORE_KEYS = ['keepDays'] as const;

export const CONFIG_OUTCOME_KEYS = ['values', 'success'] as const;

export const CONFIG_LADDER_KEYS = ['tiers', 'escalateOn'] as const;

export const CONFIG_OWNERS_KEYS = ['patterns', 'shared', 'budgets'] as const;

/**
 * The gates a waiver can silence. The list is closed on purpose: a waiver
 * naming a gate that does not exist is a decision about nothing, and the
 * error names what does exist. `byLabel:<label>` waives one label's budget.
 */
export const WAIVABLE_GATES = [
  'maxUsd',
  'maxDayUsd',
  'maxSessionUsd',
  'maxCacheLossUsd',
  'maxGrowthUsd',
] as const;

export const CONFIG_USAGE_KEYS = [
  'model',
  'callsPerMonth',
  'avgOutputTokens',
  'cacheHitRate',
  'batchEligible',
] as const;

const TOP_LEVEL_KEYS = CONFIG_KEYS;
const USAGE_KEYS = CONFIG_USAGE_KEYS;

/** Extensions directory mode reads when the config does not say otherwise. */
export const DEFAULT_EXTENSIONS = ['.txt', '.md', '.prompt', '.tmpl'];

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly source: string,
  ) {
    super(`${source}: ${message}`);
    this.name = 'ConfigError';
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Rejects a key the schema does not have, naming the nearest one that it does.
 *
 * This is the same failure as an unrecognised CLI flag, and it gets the same
 * treatment for the same reason: `"maxtokens"` where the schema says `budgets`
 * is a budget that is never read, and silence about it means CI stays green.
 */
function rejectUnknownKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  source: string,
  path: string,
): void {
  for (const key of Object.keys(object)) {
    if (allowed.includes(key)) continue;
    const nearest = nearestName(key, allowed);
    throw new ConfigError(
      nearest
        ? `unknown key "${path}${key}" — did you mean "${nearest}"?`
        : `unknown key "${path}${key}". Known keys: ${allowed.join(', ')}`,
      source,
    );
  }
}

function requireNonNegativeNumber(value: unknown, label: string, source: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new ConfigError(`"${label}" must be a number of 0 or more`, source);
  }
  return value;
}

function parseUsage(raw: unknown, source: string): Partial<UsageProfile> {
  if (!isPlainObject(raw)) throw new ConfigError('"usage" must be an object', source);
  rejectUnknownKeys(raw, USAGE_KEYS, source, 'usage.');

  const usage: Partial<UsageProfile> = {};

  if (raw.model !== undefined) {
    if (typeof raw.model !== 'string' || raw.model.trim() === '') {
      throw new ConfigError('"usage.model" must be a non-empty string', source);
    }
    // Deliberately NOT checked against the catalogue here. A `pricing` overlay can
    // introduce a model, and the path to that overlay is a key of this very
    // document — so the parser cannot know the catalogue yet. The membership check
    // happens in `loadConfig`, once the overlay has been resolved, which is the
    // only place with enough information to be right about it.
    usage.model = raw.model;
  }
  if (raw.callsPerMonth !== undefined) {
    usage.callsPerMonth = requireNonNegativeNumber(raw.callsPerMonth, 'usage.callsPerMonth', source);
  }
  if (raw.avgOutputTokens !== undefined) {
    usage.avgOutputTokens = requireNonNegativeNumber(
      raw.avgOutputTokens,
      'usage.avgOutputTokens',
      source,
    );
  }
  if (raw.cacheHitRate !== undefined) {
    const rate = requireNonNegativeNumber(raw.cacheHitRate, 'usage.cacheHitRate', source);
    if (rate > 1) {
      throw new ConfigError('"usage.cacheHitRate" is a fraction between 0 and 1', source);
    }
    usage.cacheHitRate = rate;
  }
  if (raw.batchEligible !== undefined) {
    if (typeof raw.batchEligible !== 'boolean') {
      throw new ConfigError('"usage.batchEligible" must be true or false', source);
    }
    usage.batchEligible = raw.batchEligible;
  }

  return usage;
}

/**
 * An absolute path, in any of the shapes a config file might carry one.
 *
 * Written out rather than delegating to `path.isAbsolute` for two reasons. It
 * keeps `node:path` out of this module — the browser bundle imports it, and a
 * Node builtin anywhere in that graph fails the web build. And `isAbsolute` is
 * platform-dependent: on Linux it reads `C:\prompts` as relative, so a pattern
 * written on Windows would pass validation on a Linux CI runner and then match
 * nothing. A config should be judged the same way everywhere it is checked.
 */
const IS_ABSOLUTE = /^(?:[/\\]|[A-Za-z]:[/\\])/;

function parseLabels(raw: unknown, source: string): Record<string, string> {
  if (!isPlainObject(raw)) throw new ConfigError('"labels" must be an object', source);

  const labels: Record<string, string> = {};
  for (const [label, value] of Object.entries(raw)) {
    if (label.length === 0) {
      throw new ConfigError('"labels" has an empty label', source);
    }
    if (typeof value !== 'string' || value.length === 0) {
      throw new ConfigError(`labels["${label}"] must be a file path`, source);
    }
    // Same boundary as budgets, for the same reason: an absolute path or one
    // that climbs out with ".." points outside the project, and both are
    // mistakes worth naming rather than files worth reading.
    if (IS_ABSOLUTE.test(value) || value.includes('..')) {
      throw new ConfigError(
        `labels["${label}"] must be a relative path inside the project`,
        source,
      );
    }
    labels[label] = value;
  }
  return labels;
}

function parseBudgets(raw: unknown, source: string): Record<string, number> {
  if (!isPlainObject(raw)) throw new ConfigError('"budgets" must be an object', source);

  const budgets: Record<string, number> = {};
  for (const [pattern, value] of Object.entries(raw)) {
    if (pattern.length === 0) {
      throw new ConfigError('"budgets" has an empty pattern', source);
    }
    if (IS_ABSOLUTE.test(pattern) || pattern.includes('..')) {
      // Budgets key files inside the repository. An absolute pattern, or one
      // that climbs out with "..", either matches nothing or matches something
      // outside the project — both are mistakes worth naming.
      throw new ConfigError(
        `budget pattern "${pattern}" must be a relative path inside the project`,
        source,
      );
    }
    const tokens = requireNonNegativeNumber(value, `budgets["${pattern}"]`, source);
    if (!Number.isInteger(tokens)) {
      throw new ConfigError(`budgets["${pattern}"] must be a whole number of tokens`, source);
    }
    budgets[pattern] = tokens;
  }
  return budgets;
}

/**
 * Validates the `spend` block.
 *
 * Dollars, not tokens, so non-integers are legitimate — $0.50 is a budget
 * somebody means. Negative is not: a budget below zero can only fail, which
 * makes it a mistake dressed as a policy. An empty label is rejected for the
 * reason the empty string is the unlabelled bucket's sentinel: a config that
 * meant "calls with no label" should say so through a real key, not through a
 * value that collides with an internal one.
 */
function parseSpend(raw: unknown, source: string): SpendConfig {
  if (!isPlainObject(raw)) throw new ConfigError('"spend" must be an object', source);
  rejectUnknownKeys(raw, CONFIG_SPEND_KEYS, source, 'spend.');

  const spend: SpendConfig = {};
  if (raw.maxUsd !== undefined) {
    spend.maxUsd = requireNonNegativeNumber(raw.maxUsd, 'spend.maxUsd', source);
  }
  if (raw.monthlyUsd !== undefined) {
    spend.monthlyUsd = requireNonNegativeNumber(raw.monthlyUsd, 'spend.monthlyUsd', source);
  }
  if (raw.maxCacheLossUsd !== undefined) {
    spend.maxCacheLossUsd = requireNonNegativeNumber(raw.maxCacheLossUsd, 'spend.maxCacheLossUsd', source);
  }
  if (raw.maxDayUsd !== undefined) {
    spend.maxDayUsd = requireNonNegativeNumber(raw.maxDayUsd, 'spend.maxDayUsd', source);
  }
  if (raw.maxSessionUsd !== undefined) {
    spend.maxSessionUsd = requireNonNegativeNumber(raw.maxSessionUsd, 'spend.maxSessionUsd', source);
  }
  if (raw.bySource !== undefined) {
    if (!isPlainObject(raw.bySource)) {
      throw new ConfigError('"spend.bySource" must be an object', source);
    }
    const bySource: Record<string, number> = {};
    for (const [name, value] of Object.entries(raw.bySource)) {
      if (name.trim().length === 0) {
        throw new ConfigError('"spend.bySource" has an empty source name', source);
      }
      bySource[name] = requireNonNegativeNumber(value, `spend.bySource["${name}"]`, source);
    }
    spend.bySource = bySource;
  }
  if (raw.substitute !== undefined) {
    if (!isPlainObject(raw.substitute)) {
      throw new ConfigError('"spend.substitute" must be an object', source);
    }
    const substitute: Record<string, { to: string; reason: string }> = {};
    for (const [from, value] of Object.entries(raw.substitute)) {
      if (!isPlainObject(value)) {
        throw new ConfigError(`"spend.substitute["${from}"]" must be an object`, source);
      }
      const to = (value as Record<string, unknown>).to;
      const reason = (value as Record<string, unknown>).reason;
      if (typeof to !== 'string' || to.trim() === '') {
        throw new ConfigError(`"spend.substitute["${from}"].to" is required and must be a model id`, source);
      }
      // Required, and for the same reason a waiver's is: a substitution
      // nobody wrote a reason for is a silent answer-swap with extra steps,
      // and the person reading the report six weeks later needs the sentence.
      if (typeof reason !== 'string' || reason.trim() === '') {
        throw new ConfigError(
          `"spend.substitute["${from}"].reason" is required. A substitution with no stated reason is a caller being answered a different question, and nobody able to say why.`,
          source,
        );
      }
      substitute[from] = { to, reason };
    }
    spend.substitute = substitute;
  }
  if (raw.byLabel !== undefined) {
    if (!isPlainObject(raw.byLabel)) {
      throw new ConfigError('"spend.byLabel" must be an object', source);
    }
    const byLabel: Record<string, number> = {};
    for (const [label, value] of Object.entries(raw.byLabel)) {
      if (label.trim().length === 0) {
        throw new ConfigError('"spend.byLabel" has an empty label', source);
      }
      byLabel[label] = requireNonNegativeNumber(value, `spend.byLabel["${label}"]`, source);
    }
    spend.byLabel = byLabel;
  }
  return spend;
}

/**
 * Validates the `sources` block: named services, each a non-empty list of
 * glob patterns. Patterns are not checked against a filesystem here — a
 * config file is validated wherever it is read, browser included, and which
 * files exist is the CLI's question at run time.
 */
function parseSources(raw: unknown, source: string): Record<string, string[]> {
  if (!isPlainObject(raw)) throw new ConfigError('"sources" must be an object', source);
  const sources: Record<string, string[]> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (name.trim().length === 0) {
      throw new ConfigError('"sources" has an empty source name', source);
    }
    if (!Array.isArray(value) || value.length === 0) {
      throw new ConfigError(`"sources.${name}" must be a non-empty array of glob patterns`, source);
    }
    for (const pattern of value) {
      if (typeof pattern !== 'string' || pattern.trim().length === 0) {
        throw new ConfigError(`"sources.${name}" has an empty pattern`, source);
      }
    }
    sources[name] = value as string[];
  }
  return sources;
}

/**
 * Validates the `waive` list.
 *
 * Every field is required, and the refusals are the design: a waiver with no
 * expiry is a finding deleted with extra steps, a reasonless one is a silence
 * nobody can audit, and one naming an unknown gate is a decision about
 * nothing. The expiry is *not* checked against today here — a config file is
 * timeless, and whether a waiver is expired is judged where the gate runs.
 */
/**
 * `store.keepDays` — retention, in whole days.
 *
 * A fraction of a day is refused rather than rounded: retention decides what
 * gets deleted, and a policy the tool rounded on the operator's behalf is a
 * policy nobody agreed to.
 */
/**
 * `outcomes` — the product's own vocabulary, and which of it is success.
 *
 * The validation here is unusually strict for this file, and deliberately: an
 * outcome vocabulary is the input to every rate this product will ever print,
 * and a typo in it is a silent, permanent distortion of a number people make
 * decisions on.
 */
/**
 * `ladders` — per-workload escalation policies.
 *
 * Only shape is checked here. Whether the tiers go cheapest-first, whether the
 * escalation values exist in the vocabulary, and whether one of them is
 * declared a *success* are all checked by `validateLadder`, which needs the
 * price catalogue and the vocabulary that this function does not have.
 */
/**
 * `owners` — whose budget each workload lands on.
 *
 * Shape only. Whether a shared split sums to one, names an owner that exists,
 * or has a single owner is checked by `validateOwners`, which reports all of
 * it at once rather than failing on the first — a chargeback config fixed one
 * error per run is one somebody abandons halfway and then never trusts.
 */
function parseOwners(entry: unknown, source: string): OwnersConfig {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new ConfigError(
      `"owners" in ${source} must be an object with "patterns", for example {"patterns": {"payments": ["billing-*"]}}.`,
      source,
    );
  }
  const raw = entry as Record<string, unknown>;
  rejectUnknownKeys(raw, CONFIG_OWNERS_KEYS, source, 'owners.');

  if (raw.patterns === undefined) {
    throw new ConfigError(`"owners.patterns" in ${source} is required.`, source);
  }
  if (typeof raw.patterns !== 'object' || raw.patterns === null || Array.isArray(raw.patterns)) {
    throw new ConfigError(`"owners.patterns" in ${source} must be an object keyed by owner.`, source);
  }
  const patterns: Record<string, string[]> = {};
  for (const [owner, globs] of Object.entries(raw.patterns as Record<string, unknown>)) {
    if (
      !Array.isArray(globs) ||
      globs.length === 0 ||
      globs.some((glob) => typeof glob !== 'string' || glob.trim() === '')
    ) {
      throw new ConfigError(
        `"owners.patterns["${owner}"]" in ${source} must be a non-empty array of label patterns.`,
        source,
      );
    }
    patterns[owner] = globs as string[];
  }

  const config: OwnersConfig = { patterns };

  if (raw.shared !== undefined) {
    if (typeof raw.shared !== 'object' || raw.shared === null || Array.isArray(raw.shared)) {
      throw new ConfigError(`"owners.shared" in ${source} must be an object keyed by label.`, source);
    }
    const shared: Record<string, Record<string, number>> = {};
    for (const [label, split] of Object.entries(raw.shared as Record<string, unknown>)) {
      if (typeof split !== 'object' || split === null || Array.isArray(split)) {
        throw new ConfigError(`"owners.shared["${label}"]" in ${source} must be an object of owner to share.`, source);
      }
      const parsed: Record<string, number> = {};
      for (const [owner, share] of Object.entries(split as Record<string, unknown>)) {
        if (typeof share !== 'number' || !Number.isFinite(share)) {
          throw new ConfigError(
            `"owners.shared["${label}"]["${owner}"]" in ${source} must be a number between 0 and 1.`,
            source,
          );
        }
        parsed[owner] = share;
      }
      shared[label] = parsed;
    }
    config.shared = shared;
  }

  if (raw.budgets !== undefined) {
    if (typeof raw.budgets !== 'object' || raw.budgets === null || Array.isArray(raw.budgets)) {
      throw new ConfigError(`"owners.budgets" in ${source} must be an object of owner to dollars.`, source);
    }
    const budgets: Record<string, number> = {};
    for (const [owner, usd] of Object.entries(raw.budgets as Record<string, unknown>)) {
      if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0) {
        throw new ConfigError(`"owners.budgets["${owner}"]" in ${source} must be a positive number of dollars.`, source);
      }
      budgets[owner] = usd;
    }
    config.budgets = budgets;
  }

  return config;
}

function parseLadders(entry: unknown, source: string): Record<string, LadderPolicy> {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new ConfigError(
      `"ladders" in ${source} must be an object keyed by label, for example {"support": {"tiers": ["claude-haiku-4-5", "claude-opus-5"], "escalateOn": ["escalated"]}}.`,
      source,
    );
  }
  const ladders: Record<string, LadderPolicy> = {};
  for (const [label, raw] of Object.entries(entry as Record<string, unknown>)) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new ConfigError(`"ladders["${label}"]" in ${source} must be an object.`, source);
    }
    const policy = raw as Record<string, unknown>;
    rejectUnknownKeys(policy, CONFIG_LADDER_KEYS, source, `ladders["${label}"].`);
    const list = (value: unknown, key: string): string[] => {
      if (
        !Array.isArray(value) ||
        value.length === 0 ||
        value.some((item) => typeof item !== 'string' || item.trim() === '')
      ) {
        throw new ConfigError(
          `"ladders["${label}"].${key}" in ${source} must be a non-empty array of strings.`,
          source,
        );
      }
      return value as string[];
    };
    if (policy.tiers === undefined) {
      throw new ConfigError(`"ladders["${label}"].tiers" in ${source} is required.`, source);
    }
    /**
     * Required, and not defaulted to "anything that is not a success".
     *
     * That default is tempting and wrong: it would make every non-success
     * value an escalation trigger, so adding a new outcome value to the
     * vocabulary would silently start sending traffic to a more expensive
     * model. A control loop must not change behaviour because somebody
     * documented a new word.
     */
    if (policy.escalateOn === undefined) {
      throw new ConfigError(
        `"ladders["${label}"].escalateOn" in ${source} is required. Name the recorded outcome values that should escalate — defaulting to "anything that is not a success" would mean adding a word to your vocabulary silently starts sending traffic to a more expensive model.`,
        source,
      );
    }
    ladders[label] = {
      tiers: list(policy.tiers, 'tiers'),
      escalateOn: list(policy.escalateOn, 'escalateOn'),
    };
  }
  return ladders;
}

function parseOutcomes(entry: unknown, source: string): OutcomeVocabulary {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    throw new ConfigError(
      `"outcomes" in ${source} must be an object, for example {"values": ["resolved", "escalated"], "success": ["resolved"]}.`,
      source,
    );
  }
  const raw = entry as Record<string, unknown>;
  rejectUnknownKeys(raw, CONFIG_OUTCOME_KEYS, source, 'outcomes.');

  const stringList = (value: unknown, key: string): string[] => {
    if (
      !Array.isArray(value) ||
      value.some((item) => typeof item !== 'string' || item.trim() === '')
    ) {
      throw new ConfigError(
        `"outcomes.${key}" in ${source} must be an array of non-empty strings.`,
        source,
      );
    }
    return value as string[];
  };

  if (raw.values === undefined) {
    throw new ConfigError(`"outcomes.values" in ${source} is required.`, source);
  }
  const values = stringList(raw.values, 'values');
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    throw new ConfigError(
      `"outcomes.values" in ${source} lists ${JSON.stringify(duplicates[0])} more than once.`,
      source,
    );
  }

  /**
   * **Required, and allowed to be empty.**
   *
   * Required because which values mean success is the entire product judgement
   * this tool refuses to make on somebody's behalf — a tool that decided
   * `escalated` was a failure would be wrong at every company where escalation
   * is the correct, designed outcome for a class of request. Leaving it
   * optional would send that question straight back here, to be answered by a
   * default nobody chose.
   *
   * Allowed to be empty because a product that records only failures has
   * declared something real. The report then says it cannot state a rate,
   * rather than inventing one.
   */
  if (raw.success === undefined) {
    throw new ConfigError(
      `"outcomes.success" in ${source} is required. Which of your outcome values count as success is a judgement about your product rather than about your bill, and this tool has no standing to make it. Use [] if none of them are.`,
      source,
    );
  }
  const success = stringList(raw.success, 'success');
  const undeclared = success.filter((value) => !values.includes(value));
  if (undeclared.length > 0) {
    throw new ConfigError(
      `"outcomes.success" in ${source} names ${undeclared.map((v) => JSON.stringify(v)).join(', ')}, which "outcomes.values" does not declare.`,
      source,
    );
  }

  return { values, success };
}

function parseStore(raw: unknown, source: string): { keepDays?: number } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`"store" in ${source} must be an object, for example {"keepDays": 90}.`);
  }
  const entry = raw as Record<string, unknown>;
  rejectUnknownKeys(entry, CONFIG_STORE_KEYS, source, 'store.');
  const out: { keepDays?: number } = {};
  if (entry.keepDays !== undefined) {
    const days = entry.keepDays;
    if (typeof days !== 'number' || !Number.isInteger(days) || days <= 0) {
      throw new Error(
        `"store.keepDays" in ${source} must be a whole number of days above zero, and it is ${JSON.stringify(days)}.`,
      );
    }
    out.keepDays = days;
  }
  return out;
}

function parseWaive(raw: unknown, source: string): WaiveEntry[] {
  if (!Array.isArray(raw)) throw new ConfigError('"waive" must be an array', source);
  return raw.map((entry, index) => {
    const at = `waive[${index}]`;
    if (!isPlainObject(entry)) throw new ConfigError(`"${at}" must be an object`, source);
    rejectUnknownKeys(entry, CONFIG_WAIVE_KEYS, source, `${at}.`);

    const gate = entry.gate;
    if (typeof gate !== 'string' || gate.trim().length === 0) {
      throw new ConfigError(`"${at}.gate" is required`, source);
    }
    const known =
      (WAIVABLE_GATES as readonly string[]).includes(gate) ||
      (gate.startsWith('byLabel:') && gate.length > 'byLabel:'.length);
    if (!known) {
      throw new ConfigError(
        `"${at}.gate" names no gate: "${gate}". Waivable: ${WAIVABLE_GATES.join(', ')}, or byLabel:<label>.`,
        source,
      );
    }
    const reason = entry.reason;
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      throw new ConfigError(
        `"${at}.reason" is required, in prose. A silence nobody can audit is not a decision.`,
        source,
      );
    }
    const until = entry.until;
    if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until) || !Number.isFinite(Date.parse(`${until}T00:00:00Z`))) {
      throw new ConfigError(
        `"${at}.until" is required and must be a date like 2026-09-15. A waiver with no end date is a finding deleted with extra steps.`,
        source,
      );
    }
    return { gate, reason: reason.trim(), until };
  });
}

/**
 * Validates the `baseline` block.
 *
 * **A baseline with no threshold is an error, not a default.** Either default is
 * wrong in a way that is silent: zero tolerance turns every honest addition into
 * a failed build and gets the whole block deleted within a week, and a generous
 * default is a gate that passes things nobody agreed to let through. The number
 * is a policy decision, so the policy has to be written down.
 *
 * `path` defaults, because there is one sensible answer and repeating it in every
 * config is noise.
 */
function parseBaselineConfig(raw: unknown, source: string): BaselineConfig {
  if (!isPlainObject(raw)) throw new ConfigError('"baseline" must be an object', source);
  rejectUnknownKeys(raw, CONFIG_BASELINE_KEYS, source, 'baseline.');

  const baseline: BaselineConfig = { path: BASELINE_FILENAME };

  if (raw.path !== undefined) {
    if (typeof raw.path !== 'string' || raw.path.trim() === '') {
      throw new ConfigError('"baseline.path" must be a path to a baseline file', source);
    }
    if (IS_ABSOLUTE.test(raw.path) || raw.path.includes('..')) {
      throw new ConfigError(
        `"baseline.path" must be a relative path inside the project (got "${raw.path}")`,
        source,
      );
    }
    baseline.path = raw.path;
  }

  if (raw.maxGrowthTokens !== undefined) {
    const tokens = requireNonNegativeNumber(
      raw.maxGrowthTokens,
      'baseline.maxGrowthTokens',
      source,
    );
    if (!Number.isInteger(tokens)) {
      throw new ConfigError('"baseline.maxGrowthTokens" must be a whole number of tokens', source);
    }
    baseline.maxGrowthTokens = tokens;
  }

  if (raw.maxGrowthPct !== undefined) {
    baseline.maxGrowthPct = requireNonNegativeNumber(
      raw.maxGrowthPct,
      'baseline.maxGrowthPct',
      source,
    );
  }

  if (baseline.maxGrowthTokens === undefined && baseline.maxGrowthPct === undefined) {
    throw new ConfigError(
      '"baseline" needs at least one of "maxGrowthTokens" or "maxGrowthPct" — ' +
        'a baseline with no threshold cannot fail, and a gate that cannot fail is not a gate',
      source,
    );
  }

  return baseline;
}

/**
 * Checks a config's `usage.model` against a resolved catalogue.
 *
 * Separate from `parseConfig` because it needs the catalogue, and the catalogue
 * may be defined by the very document being parsed — `pricing` is a config key.
 * `loadConfig` calls this once the overlay is in hand, so a typo'd model is still
 * a loud error, just one raised at the point where "unknown model" can be
 * answered truthfully.
 */
export function validateConfigModel(
  config: TrazumConfig,
  catalogue: PricingCatalogue,
  source: string,
): void {
  const model = config.usage?.model;
  if (model === undefined || catalogue.byId.has(model)) return;

  const ids = catalogue.models.map((m) => m.id);
  const nearest = nearestName(model, ids);
  throw new ConfigError(
    nearest
      ? `"usage.model" names no such model: "${model}" — did you mean "${nearest}"?`
      : `"usage.model" names no such model: "${model}". Available: ${ids.join(', ')}`,
    source,
  );
}

/**
 * Validates a config document.
 *
 * `source` names the file in every error, because a config error found while
 * running `trazum check` in a monorepo is useless without knowing which of
 * several config files it came from.
 */
export function parseConfig(raw: string, source = CONFIG_FILENAME): TrazumConfig {
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`not valid JSON — ${detail}`, source);
  }

  if (!isPlainObject(document)) {
    throw new ConfigError('the top level must be an object', source);
  }
  rejectUnknownKeys(document, TOP_LEVEL_KEYS, source, '');

  const config: TrazumConfig = {};

  if (document.level !== undefined) {
    if (document.level !== 'safe' && document.level !== 'aggressive') {
      throw new ConfigError('"level" must be "safe" or "aggressive"', source);
    }
    config.level = document.level;
  }

  if (document.locale !== undefined) {
    if (typeof document.locale !== 'string' || !isLocale(document.locale)) {
      throw new ConfigError(`"locale" is not a locale Trazum ships: ${String(document.locale)}`, source);
    }
    config.locale = document.locale;
  }

  if (document.disable !== undefined) {
    if (!Array.isArray(document.disable)) {
      throw new ConfigError('"disable" must be an array of rule ids', source);
    }
    const ids = RULES.map((rule) => rule.id);
    config.disable = document.disable.map((value) => {
      if (typeof value !== 'string' || !ids.includes(value as RuleId)) {
        const nearest = typeof value === 'string' ? nearestName(value, ids) : null;
        throw new ConfigError(
          nearest
            ? `"disable" names no such rule: "${String(value)}" — did you mean "${nearest}"?`
            : `"disable" names no such rule: "${String(value)}". Run "trazum rules" for the list.`,
          source,
        );
      }
      return value as RuleId;
    });
  }

  if (document.usage !== undefined) config.usage = parseUsage(document.usage, source);
  if (document.budgets !== undefined) config.budgets = parseBudgets(document.budgets, source);
  if (document.labels !== undefined) config.labels = parseLabels(document.labels, source);
  if (document.spend !== undefined) config.spend = parseSpend(document.spend, source);
  if (document.sources !== undefined) config.sources = parseSources(document.sources, source);
  if (document.store !== undefined) config.store = parseStore(document.store, source);
  if (document.waive !== undefined) config.waive = parseWaive(document.waive, source);
  if (document.ladders !== undefined) config.ladders = parseLadders(document.ladders, source);
  if (document.owners !== undefined) config.owners = parseOwners(document.owners, source);
  if (document.outcomes !== undefined) {
    config.outcomes = parseOutcomes(document.outcomes, source);
  }
  if (document.baseline !== undefined) {
    config.baseline = parseBaselineConfig(document.baseline, source);
  }

  if (document.maxGrowth !== undefined) {
    config.maxGrowth = requireNonNegativeNumber(document.maxGrowth, 'maxGrowth', source);
  }

  if (document.pricing !== undefined) {
    if (typeof document.pricing !== 'string' || document.pricing.trim() === '') {
      throw new ConfigError('"pricing" must be a path to a pricing overlay file', source);
    }
    if (IS_ABSOLUTE.test(document.pricing) || document.pricing.includes('..')) {
      throw new ConfigError(
        `"pricing" must be a relative path inside the project (got "${document.pricing}")`,
        source,
      );
    }
    config.pricing = document.pricing;
  }

  if (document.extensions !== undefined) {
    if (!Array.isArray(document.extensions) || document.extensions.length === 0) {
      throw new ConfigError('"extensions" must be a non-empty array of strings', source);
    }
    config.extensions = document.extensions.map((value) => {
      if (typeof value !== 'string' || value.length < 2 || !value.startsWith('.')) {
        throw new ConfigError(
          `"extensions" entries look like ".txt"; got ${JSON.stringify(value)}`,
          source,
        );
      }
      return value.toLowerCase();
    });
  }

  if (document.ignore !== undefined) {
    if (!Array.isArray(document.ignore)) {
      throw new ConfigError('"ignore" must be an array of path patterns', source);
    }
    config.ignore = document.ignore.map((value) => {
      if (typeof value !== 'string' || value.length === 0) {
        throw new ConfigError(
          `"ignore" entries are path patterns like "**/fixtures/**"; got ${JSON.stringify(value)}`,
          source,
        );
      }
      if (IS_ABSOLUTE.test(value) || value.includes('..')) {
        // Same rule as a budget pattern, for the same reason: a pattern that
        // climbs out of the project either matches nothing or matches somebody
        // else's files, and both are mistakes worth naming rather than
        // silently honouring.
        throw new ConfigError(
          `ignore pattern "${value}" must be a relative path inside the project`,
          source,
        );
      }
      return value;
    });
  }

  return config;
}

export interface ResolvedBudget {
  /** The pattern the budget came from, so a surprising number can be traced. */
  pattern: string;
  maxTokens: number;
}

/**
 * The budget that applies to a path, or null when no pattern matches.
 *
 * Returning the pattern alongside the number is the point: a file failing
 * against a budget the reader cannot locate in their config is a bug report.
 */
export function budgetFor(
  path: string,
  budgets: Record<string, number> | undefined,
): ResolvedBudget | null {
  if (!budgets) return null;
  const pattern = mostSpecificMatch(Object.keys(budgets), path);
  return pattern === null ? null : { pattern, maxTokens: budgets[pattern]! };
}
