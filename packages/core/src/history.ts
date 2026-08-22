/**
 * The long run: many reports over many periods, as one series.
 *
 * Every comparison in Trazum is between two logs, and a product's cost
 * problem is rarely visible in two — it is visible in twenty. This module
 * takes *stored reports* (the `--json` documents a team already keeps) and
 * builds the series no pairwise comparison can see: the workload that grew a
 * little every week, the model share that has been climbing since a date,
 * the cache hit rate decaying slowly enough that no single week's report
 * called it a finding.
 *
 * **Still no forecasts.** Twenty points make a trend visible; they do not
 * make next month knowable. The series is stated, the shape is named as
 * consecutive movement — never a line fitted through the points — and where
 * it goes next remains the reader's to judge, the same refusal
 * `modelMixDrift` has carried since 1.27.
 *
 * **Derived from stored reports, not re-parsed logs**, so a year of `--json`
 * output is enough and the raw logs can be thrown away — which is what the
 * privacy story requires anyway. Browser-safe: documents in, series out.
 */

import { UNLABELLED } from './usage.js';
import type { PlanActionKind, PlanDocument } from './plan.js';

/** The slice of a stored profile document this module actually reads. */
export interface StoredReport {
  /** Where it came from — a file name, shown so a finding can be traced. */
  name: string;
  span: { fromMs: number; toMs: number } | null;
  totalUsd: number;
  /**
   * null when the source serves no request count — a bucketed usage API. Zero
   * would read as "no traffic" against real spend, which is the reading this
   * product refuses everywhere it can occur.
   */
  calls: number | null;
  /** Label → dollars this period. */
  byLabel: Map<string, number>;
  /** Model → dollars this period. */
  byModel: Map<string, number>;
  /** Share of input tokens served from cache, or null when unknowable. */
  cacheReadShare: number | null;
}

/**
 * A run of consecutive movement, named — never extrapolated.
 *
 * `periods` counts the *rises* (or falls), so a run of 3 spans 4 reports.
 * The floor is 3: two rises is what `--against` already shows, and one is
 * noise wearing a trend's clothes.
 */
export interface HistoryRun {
  kind: 'label-spend-climbing' | 'model-share-climbing' | 'cache-share-decaying';
  subject: string;
  /** Consecutive rises (falls, for decay). */
  periods: number;
  /** The report the run started in, by name — "climbing since <this one>". */
  sinceName: string;
  /** First and last values of the run, so the reader judges the size. */
  from: number;
  to: number;
  /**
   * Days inside this run's stretch that no report covers.
   *
   * A run is *consecutive reports*, and until this field existed it read as
   * *consecutive time*. Four reports with a three-week hole between the second
   * and the third is not "climbing for four periods" in any sense a reader
   * would act on — the climb may have reversed and come back inside the hole,
   * and nothing here can see it. The caveat travels with the finding rather
   * than living in another field the reader has to cross-reference, because a
   * finding that needs a second lookup to be read correctly will be read
   * incorrectly.
   */
  unmeasuredDays: number;
}

/**
 * A stretch of calendar time no stored report covers.
 *
 * Arithmetic on the spans, not an inference about a schedule: this module has
 * no idea how often somebody meant to run anything, and guessing a cadence in
 * order to call a gap late would be the tool deciding what the reader's
 * routine is. A hole between one report's end and the next one's start is a
 * fact about the reports.
 *
 * It is also the whole of what "nobody produced this series on a schedule"
 * looks like from inside the data: a cron that died three weeks ago does not
 * announce itself, it just stops adding points — and a shorter series and a
 * series with a hole in it read identically until somebody says which.
 */
export interface UnmeasuredStretch {
  fromMs: number;
  toMs: number;
  days: number;
  /** The report that ends where the hole begins. */
  afterName: string;
  /** The report that begins where the hole ends. */
  beforeName: string;
}

/**
 * Two reports covering some of the same calendar time.
 *
 * `history` never sums `totalUsd` across periods, but a reader with the
 * document in a spreadsheet will, and two reports over the same fortnight
 * count that fortnight twice. Named rather than merged: which of the two is
 * the better measurement is not knowable from here, and picking one would be
 * throwing away money on a guess.
 */
export interface OverlappingReports {
  a: string;
  b: string;
  days: number;
}

/** The same action planned again and again: a decision nobody is executing. */
export interface RepeatedPlanAction {
  kind: PlanActionKind;
  label: string;
  model: string;
  appearances: number;
  firstPlanned: string | null;
  lastPlanned: string | null;
}

export interface HistoryDocument {
  schemaVersion: 1;
  /** Ordered oldest first by span start. */
  periods: { name: string; fromMs: number; toMs: number; totalUsd: number; calls: number | null }[];
  /** Per label, dollars per period — null where the label had no traffic. */
  labelSeries: { label: string; points: (number | null)[] }[];
  /** Per model, share of that period's total — null where absent. */
  modelShareSeries: { model: string; points: (number | null)[] }[];
  /** Cache read share per period, null where unknowable. */
  cacheShareSeries: (number | null)[];
  /** The findings only a series can make. Shapes, never forecasts. */
  runs: HistoryRun[];
  /** Plans in the same directory, held against each other. */
  repeatedPlanActions: RepeatedPlanAction[];
  /**
   * Reports that carry no span cannot be placed on a timeline; they are
   * named here and in no series above, never silently absorbed.
   */
  undatedReports: string[];
  /**
   * Calendar time between the first report's start and the last one's end
   * that no report covers, oldest first.
   *
   * The series is stated with its holes rather than closed over them: a
   * scheduled run that stopped three weeks ago produces a series that looks
   * exactly like a shorter one, and only this field tells the two apart.
   */
  unmeasured: UnmeasuredStretch[];
  /** The same calendar time covered by two reports. Named, never merged. */
  overlappingReports: OverlappingReports[];
}

export const MIN_RUN = 3;

const DAY_MS = 86_400_000;

/**
 * Whole days between two instants, never negative and never rounded up.
 *
 * Rounded down deliberately: a gap this module calls three days must be at
 * least three days. A ceiling would make the smallest possible hole read as a
 * day of missing measurement, which is the flattering direction inverted —
 * alarming rather than reassuring, and just as wrong.
 */
const daysBetween = (fromMs: number, toMs: number): number =>
  Math.max(0, Math.floor((toMs - fromMs) / DAY_MS));

/**
 * The holes and the overlaps in a set of dated reports.
 *
 * One sweep in start order. A report that ends before the furthest end seen so
 * far is contained in what is already covered and moves nothing; one that
 * starts after it opens a hole; one that starts before it overlaps.
 */
function coverageOf(
  dated: { name: string; fromMs: number; toMs: number }[],
): { unmeasured: UnmeasuredStretch[]; overlaps: OverlappingReports[] } {
  const unmeasured: UnmeasuredStretch[] = [];
  const overlaps: OverlappingReports[] = [];
  if (dated.length === 0) return { unmeasured, overlaps };

  let coveredTo = dated[0]!.toMs;
  let coveredBy = dated[0]!.name;
  for (let i = 1; i < dated.length; i += 1) {
    const report = dated[i]!;
    if (report.fromMs > coveredTo) {
      const days = daysBetween(coveredTo, report.fromMs);
      // A hole shorter than a whole day is the seam between two adjacent
      // exports, not a stretch nobody measured.
      if (days > 0) {
        unmeasured.push({
          fromMs: coveredTo,
          toMs: report.fromMs,
          days,
          afterName: coveredBy,
          beforeName: report.name,
        });
      }
    } else if (report.fromMs < coveredTo) {
      const days = daysBetween(report.fromMs, Math.min(coveredTo, report.toMs));
      if (days > 0) overlaps.push({ a: coveredBy, b: report.name, days });
    }
    if (report.toMs > coveredTo) {
      coveredTo = report.toMs;
      coveredBy = report.name;
    }
  }
  return { unmeasured, overlaps };
}

/** Days of hole inside a stretch of the timeline. */
const unmeasuredWithin = (
  unmeasured: UnmeasuredStretch[],
  fromMs: number,
  toMs: number,
): number =>
  unmeasured
    .filter((hole) => hole.fromMs >= fromMs && hole.toMs <= toMs)
    .reduce((sum, hole) => sum + hole.days, 0);

/** The longest run of strictly consecutive movement ending anywhere in the series. */
function longestRun(
  points: (number | null)[],
  direction: 1 | -1,
): { start: number; length: number } | null {
  let best: { start: number; length: number } | null = null;
  let start = -1;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1] ?? null;
    const here = points[i] ?? null;
    if (prev !== null && here !== null && Math.sign(here - prev) === direction && here !== prev) {
      if (length === 0) start = i - 1;
      length += 1;
      if (best === null || length > best.length) best = { start, length };
    } else {
      length = 0;
    }
  }
  return best !== null && best.length >= MIN_RUN ? best : null;
}

export function buildHistory(
  reports: StoredReport[],
  plans: (PlanDocument & { createdAt?: string; name?: string })[] = [],
): HistoryDocument {
  const undatedReports = reports.filter((r) => r.span === null).map((r) => r.name);
  const dated = reports
    .filter((r) => r.span !== null)
    .sort((a, b) => a.span!.fromMs - b.span!.fromMs);

  const periods = dated.map((r) => ({
    name: r.name,
    fromMs: r.span!.fromMs,
    toMs: r.span!.toMs,
    totalUsd: r.totalUsd,
    calls: r.calls,
  }));

  const labels = [...new Set(dated.flatMap((r) => [...r.byLabel.keys()]))].sort();
  const labelSeries = labels.map((label) => ({
    label,
    points: dated.map((r) => r.byLabel.get(label) ?? null),
  }));

  const models = [...new Set(dated.flatMap((r) => [...r.byModel.keys()]))].sort();
  const modelShareSeries = models.map((model) => ({
    model,
    points: dated.map((r) => {
      const usd = r.byModel.get(model);
      if (usd === undefined || r.totalUsd <= 0) return null;
      return usd / r.totalUsd;
    }),
  }));

  const cacheShareSeries = dated.map((r) => r.cacheReadShare);

  const { unmeasured, overlaps: overlappingReports } = coverageOf(periods);

  /** The unmeasured days a run spans, from the report it starts in to the one it ends in. */
  const holeIn = (start: number, length: number): number =>
    unmeasuredWithin(unmeasured, periods[start]!.fromMs, periods[start + length]!.toMs);

  const runs: HistoryRun[] = [];
  for (const series of labelSeries) {
    const run = longestRun(series.points, 1);
    if (run === null) continue;
    runs.push({
      kind: 'label-spend-climbing',
      subject: series.label,
      periods: run.length,
      sinceName: periods[run.start]!.name,
      from: series.points[run.start]!,
      to: series.points[run.start + run.length]!,
      unmeasuredDays: holeIn(run.start, run.length),
    });
  }
  for (const series of modelShareSeries) {
    const run = longestRun(series.points, 1);
    if (run === null) continue;
    runs.push({
      kind: 'model-share-climbing',
      subject: series.model,
      periods: run.length,
      sinceName: periods[run.start]!.name,
      from: series.points[run.start]!,
      to: series.points[run.start + run.length]!,
      unmeasuredDays: holeIn(run.start, run.length),
    });
  }
  {
    const run = longestRun(cacheShareSeries, -1);
    if (run !== null) {
      runs.push({
        kind: 'cache-share-decaying',
        subject: 'cache',
        periods: run.length,
        sinceName: periods[run.start]!.name,
        from: cacheShareSeries[run.start]!,
        to: cacheShareSeries[run.start + run.length]!,
        unmeasuredDays: holeIn(run.start, run.length),
      });
    }
  }
  runs.sort((a, b) => b.periods - a.periods);

  /**
   * Plans held against each other: the same action (kind, label, model) in
   * two or more plans is a decision nobody is executing, and the dates make
   * the sentence sayable — "planned first on <date>, still planned on
   * <date>".
   */
  const seen = new Map<string, RepeatedPlanAction>();
  const ordered = [...plans].sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  for (const plan of ordered) {
    for (const action of plan.actions) {
      const key = `${action.kind}\n${action.label}\n${action.model}`;
      const entry = seen.get(key);
      if (entry === undefined) {
        seen.set(key, {
          kind: action.kind,
          label: action.label,
          model: action.model,
          appearances: 1,
          firstPlanned: plan.createdAt ?? null,
          lastPlanned: plan.createdAt ?? null,
        });
      } else {
        entry.appearances += 1;
        entry.lastPlanned = plan.createdAt ?? entry.lastPlanned;
      }
    }
  }
  const repeatedPlanActions = [...seen.values()]
    .filter((entry) => entry.appearances >= 2)
    .sort((a, b) => b.appearances - a.appearances);

  return {
    schemaVersion: 1,
    periods,
    labelSeries,
    modelShareSeries,
    cacheShareSeries,
    runs,
    repeatedPlanActions,
    undatedReports,
    unmeasured,
    overlappingReports,
  };
}

/**
 * Reads one stored `profile --json` document into the slice history needs.
 * Returns null when the JSON is not a profile document — the caller names
 * the file rather than absorbing it.
 */
export function storedReportFrom(name: string, parsed: unknown): StoredReport | null {
  const doc = parsed as {
    schemaVersion?: number;
    span?: { fromMs: number; toMs: number } | null;
    total?: {
      totalUsd?: number;
      calls?: number;
      inputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    };
    byLabelAndModel?: {
      label?: string;
      model?: string;
      breakdown?: { totalUsd?: number };
    }[];
  };
  if (doc === null || typeof doc !== 'object') return null;
  if (doc.schemaVersion !== 1 || doc.total === undefined || !Array.isArray(doc.byLabelAndModel)) {
    return null;
  }

  const byLabel = new Map<string, number>();
  const byModel = new Map<string, number>();
  for (const slice of doc.byLabelAndModel) {
    const usd = slice.breakdown?.totalUsd ?? 0;
    const label = slice.label ?? UNLABELLED;
    const model = slice.model ?? 'unknown';
    byLabel.set(label, (byLabel.get(label) ?? 0) + usd);
    byModel.set(model, (byModel.get(model) ?? 0) + usd);
  }

  const input = doc.total.inputTokens ?? 0;
  const cacheRead = doc.total.cacheReadTokens ?? 0;
  const cacheWrite = doc.total.cacheWriteTokens ?? 0;
  const denominator = input + cacheRead + cacheWrite;

  return {
    name,
    span: doc.span ?? null,
    totalUsd: doc.total.totalUsd ?? 0,
    calls: doc.total.calls ?? 0,
    byLabel,
    byModel,
    cacheReadShare: denominator > 0 ? cacheRead / denominator : null,
  };
}
