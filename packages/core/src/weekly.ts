/**
 * The week in three paragraphs: what it cost, what moved against the week
 * before, and the three changes worth making first.
 *
 * Nothing here is estimated. The bill and the movement are two measured
 * reports, one per week, priced by the same catalogue; the changes are the
 * ranked actions `buildPlan` already derives from the week's own report, and
 * each carries what was measured before it. A saving that has not happened is
 * a projection and says so; `verify` is what measures it afterwards.
 *
 * **A figure in the summary is a figure in the bill.** The summary is text a
 * person reads in an issue and acts on, so every dollar amount and every
 * percentage it prints has to be one the two reports (or the plan made from
 * them) hold. `billFigures` works the allowed set out from the reports
 * themselves, by a route that shares no code with the builder, and
 * `strayFigures` reads a rendered summary and names what is not in it. The CLI
 * refuses to write a summary with a stray figure in it: a wrong number in a
 * weekly note is worse than no note, because nobody re-adds it.
 *
 * Browser-safe like the rest of the core: reports in, one document out. The
 * words belong to whoever renders it, in the reader's language.
 */

import { formatUsd } from './savings.js';
import type { PlanActionKind, PlanAssumption, PlanDocument } from './plan.js';
import type { UsageProfileReport } from './usage.js';

const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

/** How many changes a weekly summary names. Three is the issue's number; more is a list nobody acts on. */
export const WEEKLY_CHANGES = 3;
/** How many models the bill and the movement name before saying how many more there are. */
export const WEEKLY_MODELS = 5;
export const WEEKLY_MOVERS = 3;

/** A window, half-open like every window in the profile: two adjacent weeks share no call. */
export interface WeekWindow {
  sinceMs: number;
  untilMs: number;
  /** The first UTC day inside it, `YYYY-MM-DD`. */
  firstDay: string;
  /** The last UTC day inside it. */
  lastDay: string;
}

const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

const windowOf = (sinceMs: number, untilMs: number): WeekWindow => ({
  sinceMs,
  untilMs,
  firstDay: dayOf(sinceMs),
  lastDay: dayOf(untilMs - 1),
});

/**
 * The week ending at `untilMs` and the week before it.
 *
 * Seven days each, back to back, with no overlap and no gap: the week before
 * ends at the instant this one begins.
 */
export function weekWindows(untilMs: number): { current: WeekWindow; previous: WeekWindow } {
  return {
    current: windowOf(untilMs - WEEK_MS, untilMs),
    previous: windowOf(untilMs - 2 * WEEK_MS, untilMs - WEEK_MS),
  };
}

export interface WeeklyModelRow {
  model: string;
  calls: number;
  usd: number;
}

export interface WeeklyMover {
  model: string;
  previousUsd: number;
  currentUsd: number;
  deltaUsd: number;
}

export interface WeeklyChange {
  rank: number;
  kind: PlanActionKind;
  /** The workload, `UNLABELLED` when the log named none. */
  label: string;
  model: string;
  /** Projected, for route and batch: not measured, and never rendered as if it were. */
  projectedSavingUsd: number | null;
  /** Measured: money already spent on the problem the change fixes. */
  measuredStakeUsd: number | null;
  /** What this workload and model cost this week, measured. Null when the plan did not record it. */
  sliceUsd: number | null;
  sliceCalls: number | null;
  routeTo: string | null;
  /** What the log cannot confirm about this change, as the plan states it. */
  assumes: PlanAssumption[];
}

export interface WeeklySummary {
  current: WeekWindow;
  previous: WeekWindow;
  /** This week's bill: what could be priced, and only that. */
  totalUsd: number;
  calls: number;
  /** Priced models, largest first, at most `WEEKLY_MODELS`; `moreModels` counts the rest. */
  models: WeeklyModelRow[];
  moreModels: number;
  unpricedModels: string[];
  unpricedCalls: number;
  /** Calls with no clock that a windowed report cannot place in any week. */
  undatedExcluded: number;
  /**
   * Against the week before, or null when that week holds no call: a ratio
   * against nothing is not a change, and the summary says there was no week
   * to compare rather than print a number for it.
   */
  comparison: null | {
    previousUsd: number;
    previousCalls: number;
    deltaUsd: number;
    /** Null when the week before cost nothing priced: no percentage of zero. */
    deltaPct: number | null;
    movers: WeeklyMover[];
  };
  /** The first `WEEKLY_CHANGES` actions of the plan, largest money first. */
  changes: WeeklyChange[];
  /** How many actions the plan had in all. */
  changesAvailable: number;
}

const pricedModels = (report: UsageProfileReport): WeeklyModelRow[] =>
  report.byModel
    .filter((row) => !report.unpricedModels.includes(row.model))
    .map((row) => ({ model: row.model, calls: row.breakdown.calls, usd: row.breakdown.totalUsd }));

/**
 * Builds the summary from the week's report, the week before's, and the plan
 * made from this week's.
 */
export function buildWeeklySummary(
  current: UsageProfileReport,
  previous: UsageProfileReport,
  plan: PlanDocument,
  windows: { current: WeekWindow; previous: WeekWindow },
): WeeklySummary {
  const models = pricedModels(current);

  let comparison: WeeklySummary['comparison'] = null;
  if (previous.total.calls > 0) {
    const before = new Map(pricedModels(previous).map((row) => [row.model, row.usd]));
    const now = new Map(models.map((row) => [row.model, row.usd]));
    const movers: WeeklyMover[] = [...new Set([...before.keys(), ...now.keys()])]
      .map((model) => {
        const previousUsd = before.get(model) ?? 0;
        const currentUsd = now.get(model) ?? 0;
        return { model, previousUsd, currentUsd, deltaUsd: currentUsd - previousUsd };
      })
      .filter((row) => row.deltaUsd !== 0)
      .sort((a, b) => Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd) || a.model.localeCompare(b.model))
      .slice(0, WEEKLY_MOVERS);
    const previousUsd = previous.total.totalUsd;
    const deltaUsd = current.total.totalUsd - previousUsd;
    comparison = {
      previousUsd,
      previousCalls: previous.total.calls,
      deltaUsd,
      deltaPct: previousUsd > 0 ? (deltaUsd / previousUsd) * 100 : null,
      movers,
    };
  }

  const changes: WeeklyChange[] = plan.actions.slice(0, WEEKLY_CHANGES).map((action, index) => ({
    rank: index + 1,
    kind: action.kind,
    label: action.label,
    model: action.model,
    projectedSavingUsd: action.savingUsd,
    measuredStakeUsd: action.stakeUsd,
    sliceUsd: action.detail.baseline?.usd ?? null,
    sliceCalls: action.detail.baseline?.calls ?? null,
    routeTo: action.detail.routeTo?.displayName ?? null,
    assumes: [...action.assumes],
  }));

  return {
    current: windows.current,
    previous: windows.previous,
    totalUsd: current.total.totalUsd,
    calls: current.total.calls,
    models: models.slice(0, WEEKLY_MODELS),
    moreModels: Math.max(0, models.length - WEEKLY_MODELS),
    unpricedModels: [...current.unpricedModels],
    unpricedCalls: current.unpriced.calls,
    undatedExcluded: current.timeWindow?.undatedExcluded ?? 0,
    comparison,
    changes,
    changesAvailable: plan.actions.length,
  };
}

/** The figures a summary may print, as the strings it prints them as. */
export interface BillFigures {
  /** Every dollar amount, as `formatUsd` writes it and without a sign. */
  usd: ReadonlySet<string>;
  /** Every percentage, one decimal, without a sign and without the `%`. */
  pct: ReadonlySet<string>;
}

/**
 * What the reports hold, worked out from the reports.
 *
 * It reads the two reports and the plan directly and shares nothing with
 * `buildWeeklySummary`, so a figure the builder gets wrong (a total scaled, a
 * delta taken the wrong way round, a saving summed across actions that
 * overlap) is not in this set and is named by `strayFigures`.
 */
export function billFigures(
  current: UsageProfileReport,
  previous: UsageProfileReport,
  plan: PlanDocument,
): BillFigures {
  const usd = new Set<string>(['$0']);
  const pct = new Set<string>();
  const add = (value: number | null | undefined): void => {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    usd.add(formatUsd(Math.abs(value)));
  };

  add(current.total.totalUsd);
  add(previous.total.totalUsd);
  add(current.total.totalUsd - previous.total.totalUsd);
  const rows = (report: UsageProfileReport) => new Map(report.byModel.map((row) => [row.model, row.breakdown.totalUsd]));
  const now = rows(current);
  const before = rows(previous);
  for (const model of new Set([...now.keys(), ...before.keys()])) {
    const a = now.get(model) ?? 0;
    const b = before.get(model) ?? 0;
    add(a);
    add(b);
    add(a - b);
  }
  for (const action of plan.actions) {
    add(action.savingUsd);
    add(action.stakeUsd);
    add(action.detail.baseline?.usd);
  }
  if (previous.total.totalUsd > 0) {
    const change = ((current.total.totalUsd - previous.total.totalUsd) / previous.total.totalUsd) * 100;
    pct.add(Math.abs(change).toFixed(1));
  }
  return { usd, pct };
}

/**
 * Prose a reader sees as prose is checked; what names a workload, a model or a
 * command is not. Those are written between backticks, and a label such as
 * `50% off` is the author's word, not a figure Trazum computed.
 */
const withoutCode = (text: string): string => text.replace(/`[^`\n]*`/g, '');

/**
 * The dollar amounts and percentages in a rendered summary that no report
 * holds. Empty when every one is accounted for.
 */
export function strayFigures(markdown: string, figures: BillFigures): string[] {
  const prose = withoutCode(markdown);
  const stray: string[] = [];
  for (const [amount] of prose.matchAll(/\$\d[\d,]*(?:\.\d+)?/g)) {
    if (!figures.usd.has(amount)) stray.push(amount);
  }
  for (const [, number] of prose.matchAll(/(\d+(?:\.\d+)?)%/g)) {
    if (number !== undefined && !figures.pct.has(number)) stray.push(`${number}%`);
  }
  return [...new Set(stray)];
}

/** The identifier a weekly summary carries so a re-run replaces it rather than adding a second. */
export function weeklyMarker(lastDay: string): string {
  return `<!-- trazum-weekly:${lastDay} -->`;
}
