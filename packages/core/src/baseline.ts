import type { UsageProfile } from './types.js';

/**
 * The cost baseline: what this repository's prompts cost as of a commit, and
 * what has happened to them since.
 *
 * **Why this exists.** `budgets` in `trazum.config.json` is a ceiling — it
 * answers "does this file fit". It cannot answer "did this change make things
 * worse", and those are different questions with different failure modes. A
 * repository sitting at 95% of every budget passes every gate forever while a
 * pull request quietly adds four hundred tokens across a dozen files. A ceiling
 * catches the absolute; only a baseline catches the drift.
 *
 * **Why the gate is in tokens and the money is only reported.** A dollar figure
 * is derived from three things: the token count, the usage scenario, and the
 * price list. Two of those change for reasons that have nothing to do with the
 * prompts — a repriced model, an edited `callsPerMonth` — so a baseline holding
 * dollars would fail a build the day the catalogue was updated, calling a price
 * change a regression. A gate that cries wolf is a gate somebody deletes.
 *
 * Tokens depend on the text and nothing else. They are what is compared, they
 * are what the threshold is written in, and the monthly figure is recomputed at
 * comparison time and shown next to it — with an explicit note when the scenario
 * or the price list moved, because a dollar delta across a reprice is two
 * different measurements subtracted from each other.
 *
 * No filesystem access here, deliberately: `apps/web` bundles this package for
 * the browser, and one `node:fs` import anywhere in the graph fails that build.
 * Reading and writing the file is the CLI's job.
 */

/**
 * The document version.
 *
 * Written into every baseline and checked on read. A baseline is committed and
 * outlives the version of Trazum that wrote it, so a future shape change has to
 * be able to say "this file is from an older format, re-record it" rather than
 * misreading fields that moved.
 */
export const BASELINE_VERSION = 1;

export const BASELINE_FILENAME = 'trazum.baseline.json';

/**
 * Largest baseline this will read.
 *
 * Bigger than the config limit because this one scales with the repository: a
 * thousand prompts is a thousand entries. Still bounded, so a corrupt or hostile
 * file is refused before `JSON.parse` is handed the whole thing.
 */
export const MAX_BASELINE_BYTES = 4 * 1024 * 1024;

export interface BaselineDocument {
  version: number;
  /** ISO date the baseline was recorded, for the report to cite. */
  recorded: string;
  /**
   * The scenario the monthly figure was computed under. Recorded so a later
   * comparison can say whether the money is comparable, not to gate on.
   */
  scenario: UsageProfile;
  /** `PRICING_LAST_REVIEWED` at the time, for the same reason. */
  pricingReviewed: string;
  totals: { tokens: number; monthlyUsd: number };
  /**
   * Repository-relative path to token count, forward slashes always.
   *
   * Per file rather than one total, because a gate that reports "the repository
   * grew by 400 tokens" without naming the file is a gate people learn to
   * ignore. Sorted on write so re-recording produces a reviewable diff instead
   * of a reordered one.
   */
  files: Record<string, number>;
}

export class BaselineError extends Error {
  constructor(
    message: string,
    readonly source: string,
  ) {
    super(`${source}: ${message}`);
    this.name = 'BaselineError';
  }
}

/**
 * An absolute path in any shape a committed file might carry one.
 *
 * Same regex, and the same reasoning, as `config-schema.ts`: written out rather
 * than delegating to `path.isAbsolute` because that is platform-dependent, and a
 * baseline recorded on Windows must be judged identically on a Linux runner or
 * the gate silently matches nothing.
 */
const IS_ABSOLUTE = /^(?:[/\\]|[A-Za-z]:[/\\])/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function requireWholeCount(value: unknown, label: string, source: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new BaselineError(`"${label}" must be a whole number of 0 or more`, source);
  }
  return value;
}

function requireString(value: unknown, label: string, source: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BaselineError(`"${label}" must be a non-empty string`, source);
  }
  return value;
}

function cacheHitRateOf(value: unknown, source: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new BaselineError('"scenario.cacheHitRate" is a fraction between 0 and 1', source);
  }
  return value;
}

function batchEligibleOf(value: unknown, source: string): boolean {
  if (typeof value !== 'boolean') {
    throw new BaselineError('"scenario.batchEligible" must be true or false', source);
  }
  return value;
}

/**
 * Validates a baseline document.
 *
 * **Every failure throws**, for the reason the config parser gives: this file
 * decides whether a build passes. A lenient read of a malformed baseline is a
 * gate that measured nothing and reported success, which is worse than no gate,
 * because the repository now believes it has one.
 */
export function parseBaseline(raw: string, source = BASELINE_FILENAME): BaselineDocument {
  let document: unknown;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new BaselineError(`not valid JSON — ${detail}`, source);
  }

  if (!isPlainObject(document)) {
    throw new BaselineError('the top level must be an object', source);
  }

  const version = document.version;
  if (version !== BASELINE_VERSION) {
    throw new BaselineError(
      `is version ${JSON.stringify(version)}, and this Trazum reads version ${BASELINE_VERSION}. ` +
        're-record it with "trazum baseline"',
      source,
    );
  }

  if (!isPlainObject(document.totals)) {
    throw new BaselineError('"totals" must be an object', source);
  }
  if (!isPlainObject(document.files)) {
    throw new BaselineError('"files" must be an object of path to token count', source);
  }
  if (!isPlainObject(document.scenario)) {
    throw new BaselineError('"scenario" must be an object', source);
  }

  const files: Record<string, number> = {};
  for (const [path, tokens] of Object.entries(document.files)) {
    if (path.length === 0) throw new BaselineError('"files" has an empty path', source);
    if (IS_ABSOLUTE.test(path) || path.includes('..')) {
      throw new BaselineError(
        `"files" path ${JSON.stringify(path)} must be relative to the project`,
        source,
      );
    }
    files[path] = requireWholeCount(tokens, `files["${path}"]`, source);
  }

  const totalUsd = document.totals.monthlyUsd;
  if (typeof totalUsd !== 'number' || !Number.isFinite(totalUsd) || totalUsd < 0) {
    throw new BaselineError('"totals.monthlyUsd" must be a number of 0 or more', source);
  }

  const recorded = requireWholeCount(document.totals.tokens, 'totals.tokens', source);
  const summed = Object.values(files).reduce((a, b) => a + b, 0);
  if (recorded !== summed) {
    // A hand-edited total is the one corruption that looks completely normal:
    // the file parses, the gate runs, and it compares against a number nobody
    // measured. Cheap to check, so it is checked.
    throw new BaselineError(
      `"totals.tokens" is ${recorded} but the per-file counts sum to ${summed}`,
      source,
    );
  }

  const scenario = document.scenario as Record<string, unknown>;
  return {
    version: BASELINE_VERSION,
    recorded: requireString(document.recorded, 'recorded', source),
    pricingReviewed: requireString(document.pricingReviewed, 'pricingReviewed', source),
    scenario: {
      model: requireString(scenario.model, 'scenario.model', source),
      callsPerMonth: requireWholeCount(scenario.callsPerMonth, 'scenario.callsPerMonth', source),
      avgOutputTokens: requireWholeCount(
        scenario.avgOutputTokens,
        'scenario.avgOutputTokens',
        source,
      ),
      cacheHitRate: cacheHitRateOf(scenario.cacheHitRate, source),
      batchEligible: batchEligibleOf(scenario.batchEligible, source),
    },
    totals: { tokens: recorded, monthlyUsd: totalUsd },
    files,
  };
}

/**
 * The document as text, ready to commit.
 *
 * Keys are emitted in a fixed order and file paths sorted, so re-recording an
 * unchanged repository produces a byte-identical file. A baseline that reshuffles
 * itself on every write turns every pull request into an unreviewable diff, and
 * the first thing anyone does with an unreviewable diff is stop reading it.
 */
export function formatBaseline(document: BaselineDocument): string {
  const files: Record<string, number> = {};
  for (const path of Object.keys(document.files).sort()) files[path] = document.files[path]!;

  return `${JSON.stringify(
    {
      version: BASELINE_VERSION,
      recorded: document.recorded,
      scenario: {
        model: document.scenario.model,
        callsPerMonth: document.scenario.callsPerMonth,
        avgOutputTokens: document.scenario.avgOutputTokens,
        cacheHitRate: document.scenario.cacheHitRate,
        batchEligible: document.scenario.batchEligible,
      },
      pricingReviewed: document.pricingReviewed,
      totals: document.totals,
      files,
    },
    null,
    2,
  )}\n`;
}

export interface BaselineChange {
  path: string;
  before: number;
  after: number;
  /** `after - before`, so positive is growth — the direction that costs money. */
  delta: number;
}

export interface BaselineComparison {
  grown: BaselineChange[];
  shrunk: BaselineChange[];
  /**
   * Present now, absent from the baseline.
   *
   * Counted toward the total, which is the whole reason this field exists: a new
   * prompt is new cost, and a comparison over only the files present in both
   * would let a five-thousand-token addition through every threshold.
   */
  added: BaselineChange[];
  /** In the baseline, gone from the tree. Never a regression — it is a saving. */
  removed: BaselineChange[];
  tokensBefore: number;
  tokensAfter: number;
  delta: number;
  /** Growth as a percentage of the baseline, or 0 when the baseline was empty. */
  deltaPct: number;
}

/**
 * Compares a set of current token counts against a baseline.
 *
 * Pure arithmetic over two maps. It takes counts rather than file contents so
 * the caller decides what a prompt is — directory mode, extracted markers, a
 * hand-picked list — and this stays the one place the comparison is defined.
 */
export function compareToBaseline(
  baseline: BaselineDocument,
  current: Record<string, number>,
): BaselineComparison {
  const grown: BaselineChange[] = [];
  const shrunk: BaselineChange[] = [];
  const added: BaselineChange[] = [];
  const removed: BaselineChange[] = [];

  for (const path of Object.keys(current).sort()) {
    const after = current[path]!;
    const before = baseline.files[path];
    if (before === undefined) {
      added.push({ path, before: 0, after, delta: after });
    } else if (after > before) {
      grown.push({ path, before, after, delta: after - before });
    } else if (after < before) {
      shrunk.push({ path, before, after, delta: after - before });
    }
  }

  for (const path of Object.keys(baseline.files).sort()) {
    if (current[path] === undefined) {
      const before = baseline.files[path]!;
      removed.push({ path, before, after: 0, delta: -before });
    }
  }

  const tokensBefore = baseline.totals.tokens;
  const tokensAfter = Object.values(current).reduce((a, b) => a + b, 0);
  const delta = tokensAfter - tokensBefore;

  return {
    grown,
    shrunk,
    added,
    removed,
    tokensBefore,
    tokensAfter,
    delta,
    deltaPct: tokensBefore === 0 ? 0 : (delta / tokensBefore) * 100,
  };
}

export interface BaselineThresholds {
  /** Absolute token growth allowed. */
  maxGrowthTokens?: number;
  /** Growth allowed as a percentage of the baseline total. */
  maxGrowthPct?: number;
}

/** Why a comparison failed. Structured, so the CLI owns the wording. */
export type BaselineBreach =
  | { kind: 'tokens'; limit: number; actual: number }
  | { kind: 'pct'; limit: number; actual: number };

/**
 * Whether a comparison breaches its thresholds.
 *
 * Both thresholds are checked and **either one failing fails the gate** — they
 * are not alternatives to pick between. A percentage alone lets a small
 * repository absorb a large absolute addition; an absolute number alone means a
 * large repository never trips. Whichever is exceeded is reported, so the output
 * names the limit that was actually crossed rather than a generic failure.
 *
 * Shrinking never fails. There is no such thing as a prompt that got too cheap.
 */
export function breaches(
  comparison: BaselineComparison,
  thresholds: BaselineThresholds,
): BaselineBreach[] {
  const found: BaselineBreach[] = [];
  if (comparison.delta <= 0) return found;

  if (thresholds.maxGrowthTokens !== undefined && comparison.delta > thresholds.maxGrowthTokens) {
    found.push({ kind: 'tokens', limit: thresholds.maxGrowthTokens, actual: comparison.delta });
  }
  if (thresholds.maxGrowthPct !== undefined && comparison.deltaPct > thresholds.maxGrowthPct) {
    found.push({ kind: 'pct', limit: thresholds.maxGrowthPct, actual: comparison.deltaPct });
  }
  return found;
}

/**
 * Whether the baseline's money is comparable to today's.
 *
 * Tokens are always comparable — they depend on the text and nothing else, which
 * is why the gate is written in them. The monthly figure is not: a repriced model
 * or an edited scenario changes it without a single prompt moving. When either
 * has shifted the report says so instead of subtracting two different
 * measurements and presenting the difference as a saving.
 */
export function moneyIsComparable(
  baseline: BaselineDocument,
  scenario: UsageProfile,
  pricingReviewed: string,
): { comparable: boolean; scenarioChanged: boolean; pricingChanged: boolean } {
  const scenarioChanged =
    baseline.scenario.model !== scenario.model ||
    baseline.scenario.callsPerMonth !== scenario.callsPerMonth ||
    baseline.scenario.avgOutputTokens !== scenario.avgOutputTokens ||
    baseline.scenario.cacheHitRate !== scenario.cacheHitRate ||
    baseline.scenario.batchEligible !== scenario.batchEligible;
  const pricingChanged = baseline.pricingReviewed !== pricingReviewed;

  return { comparable: !scenarioChanged && !pricingChanged, scenarioChanged, pricingChanged };
}
