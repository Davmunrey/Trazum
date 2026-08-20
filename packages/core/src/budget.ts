/**
 * One measured number, wherever it is asked for.
 *
 * By 1.48 there are four ways to ask Trazum about money — a gate in CI, the
 * terminal, the local endpoint an agent consults, the browser — and no
 * guarantee any two of them agree about how much of a budget is left. Each
 * computed its own answer from whatever it happened to be holding: a log, a
 * store, a request body. Four right answers to four slightly different
 * questions is how a CI failure and an agent's refusal come to disagree in
 * front of somebody.
 *
 * This is that number. A budget becomes a **position**: a limit, a period, the
 * measured spend inside it, and — the part that makes it honest — how much of
 * that period was measured at all.
 *
 * **Nothing here forecasts.** "Sixty-one per cent of the budget, consumed over
 * eleven of thirty days" is a measurement. "You will run out on the 24th" is a
 * prediction, and this product has refused those since 1.27 at every scale it
 * operates on. The burn-down below compares two shares that both already
 * happened, and names the shape; it never produces a date.
 *
 * **A period nobody measured is not a period under budget.** The rule
 * `fleetBudgetMissing` established for services in 1.37, applied to time: days
 * inside the period with no measurement are counted and named, and a position
 * standing on three measured days out of thirty says so rather than reporting
 * a comfortable ninety per cent remaining.
 */

import type { SpendConfig } from './config-schema.js';
import type { StoreRecord } from './store.js';
import { effectivePricing } from './pricing.js';
import type { PricingCatalogue } from './pricing.js';

const DAY_MS = 86_400_000;

/** The window a budget is spent over. Calendar months, UTC, like everything else. */
export interface BudgetPeriod {
  kind: 'month';
  /** `YYYY-MM`, UTC. */
  id: string;
  fromMs: number;
  /** Half-open: the first instant of the next month. */
  toMs: number;
  days: number;
}

export type BudgetScope =
  | { kind: 'total' }
  | { kind: 'label'; label: string }
  | { kind: 'source'; source: string };

/**
 * How much of the period the measurement actually covers.
 *
 * Three values rather than a percentage, because the three lead to different
 * decisions: act on it, act on it knowing it is a floor, or go and find out
 * why nothing was measured.
 */
export type BudgetCoverage = 'complete' | 'partial' | 'none';

/**
 * The shape of the burn, named — never a date.
 *
 * A comparison of two shares that have both already happened: how much of the
 * budget is gone against how much of the period is gone. `ahead` means the
 * money is going faster than the calendar, which is a fact about the past
 * eleven days and not a claim about the next nineteen.
 */
export type BurnShape = 'ahead' | 'on-pace' | 'behind' | 'cannot-tell';

export interface BurnDown {
  /** Share of the limit consumed, 0-1. Null when the limit is zero. */
  consumedShare: number | null;
  /** Share of the period elapsed at the instant this was computed, 0-1. */
  elapsedShare: number;
  shape: BurnShape;
  /**
   * Deliberately absent: any field naming a date the budget runs out.
   *
   * Stated here rather than left to be noticed, because it is the single most
   * requested number this module will ever be asked for, and every future
   * reader of this file will be tempted to add it. It cannot be measured; it
   * can only be projected from a rate that the log has no reason to keep.
   */
  readonly forecast?: never;
}

export interface BudgetStanding {
  schemaVersion: 1;
  scope: BudgetScope;
  limitUsd: number;
  period: BudgetPeriod;
  /** Measured spend inside the period. Never an estimate — see `provenance`. */
  consumedUsd: number;
  remainingUsd: number;
  provenance: 'measured';
  /** Distinct UTC days inside the period that carry any measurement. */
  measuredDays: number;
  /** Days of the period that have already elapsed at the instant asked. */
  elapsedDays: number;
  /**
   * Elapsed days with no measurement at all, oldest first, capped for
   * rendering. A day missing from a series is the thing a total cannot show.
   */
  unmeasuredDays: string[];
  coverage: BudgetCoverage;
  burn: BurnDown;
  /**
   * `cannot-tell` when nothing in the period was measured. A budget with no
   * measurement behind it is not a budget under control, and reporting
   * `within` would be the flattering direction — the one this repository
   * refuses everywhere it can occur.
   */
  verdict: 'within' | 'over' | 'cannot-tell';
}

export interface BudgetReport {
  schemaVersion: 1;
  period: BudgetPeriod;
  positions: BudgetStanding[];
  /**
   * Budgets configured with a scope nothing measured touches.
   *
   * Not a position of zero: a label that has no records may have been renamed,
   * or may simply not have run. Both are worth knowing and neither is "under
   * budget".
   */
  unmeasuredScopes: BudgetScope[];
}

/** The UTC month containing `at`, as a period. */
export function monthOf(at: Date): BudgetPeriod {
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();
  const fromMs = Date.UTC(year, month, 1);
  const toMs = Date.UTC(year, month + 1, 1);
  return {
    kind: 'month',
    id: `${year}-${String(month + 1).padStart(2, '0')}`,
    fromMs,
    toMs,
    days: Math.round((toMs - fromMs) / DAY_MS),
  };
}

/** What a store record's tokens cost, at the catalogue's rates for its window. */
function priceOf(record: StoreRecord, catalogue: PricingCatalogue): number | null {
  const model = catalogue.byId.get(record.model);
  if (model === undefined) return null;
  const rates = effectivePricing(model, new Date(record.fromMs));
  const write5m = record.write5m * rates.inputPerMTok * 1.25;
  const write1h = record.write1h * rates.inputPerMTok * 2;
  return (
    (record.input * rates.inputPerMTok +
      record.cacheRead * rates.inputPerMTok * 0.1 +
      write5m +
      write1h +
      record.output * rates.outputPerMTok) /
    1_000_000
  );
}

/**
 * The share of a record's window that falls inside the period.
 *
 * A store record covers a bucket, and a bucket can straddle a month boundary.
 * Counting it wholly in or wholly out would move real money between months by
 * up to a day; apportioning by overlap is the only answer that keeps two
 * adjacent months summing to the same total as the pair.
 *
 * This is arithmetic about a window, not an estimate of anything: the record
 * says what the window cost, and the overlap is exact.
 */
function overlapShare(record: StoreRecord, period: BudgetPeriod): number {
  const span = record.toMs - record.fromMs;
  if (span <= 0) return record.fromMs >= period.fromMs && record.fromMs < period.toMs ? 1 : 0;
  const from = Math.max(record.fromMs, period.fromMs);
  const to = Math.min(record.toMs, period.toMs);
  return to <= from ? 0 : (to - from) / span;
}

/** Every UTC day a record touches inside the period, as `YYYY-MM-DD`. */
function daysTouched(record: StoreRecord, period: BudgetPeriod): string[] {
  const from = Math.max(record.fromMs, period.fromMs);
  const to = Math.min(Math.max(record.toMs, record.fromMs + 1), period.toMs);
  if (to <= from) return [];
  const days: string[] = [];
  for (let ms = Math.floor(from / DAY_MS) * DAY_MS; ms < to; ms += DAY_MS) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

function shapeOf(consumedShare: number | null, elapsedShare: number, coverage: BudgetCoverage): BurnShape {
  // Nothing measured, or nothing to measure against: the comparison has no
  // meaning, and inventing one from an elapsed share alone would be a shape
  // drawn from the calendar rather than from the bill.
  if (coverage === 'none' || consumedShare === null) return 'cannot-tell';

  // A five-point band, so a budget tracking the calendar to within a rounding
  // error is not reported as drifting every time somebody looks.
  const drift = consumedShare - elapsedShare;
  const ahead = drift > 0.05;

  /**
   * **A floor can prove `ahead` and can never prove `behind`.**
   *
   * Partial coverage means the consumed figure is a floor on the period: the
   * unmeasured days spent *something*, and nobody knows how much. A floor that
   * has already outrun the calendar is unarguably ahead — the real figure is
   * higher still. A floor that looks comfortable proves nothing at all, and
   * reporting it as `behind` would turn missing measurement into good news,
   * which is the flattering direction this repository refuses everywhere.
   *
   * The first version of this returned `behind` for three measured days out of
   * twenty, beside a warning that the figure was a floor. Two sentences that
   * contradicted each other, and the reassuring one came second.
   */
  if (coverage === 'partial') return ahead ? 'ahead' : 'cannot-tell';

  if (ahead) return 'ahead';
  if (drift < -0.05) return 'behind';
  return 'on-pace';
}

/** How many unmeasured days are worth naming before the list becomes noise. */
export const MAX_UNMEASURED_NAMED = 10;

export interface BudgetOptions {
  catalogue: PricingCatalogue;
  /** The instant the position is taken. Every share below is as of this moment. */
  now?: Date;
  /** Which period. Defaults to the month containing `now`. */
  period?: BudgetPeriod;
}

/**
 * The live position of every configured budget, from measured records alone.
 *
 * Per-label and per-source budgets are **not** computed here, and their
 * absence is the honest answer rather than an omission: a store record carries
 * a provider, a model and the account's own grouping, and it does not carry a
 * workload label — labels live in a per-call usage log, which a bucketed
 * provider API does not serve. Reporting a per-label position from records
 * that cannot distinguish labels would be a number assembled from the wrong
 * denominator. They appear in `unmeasuredScopes` instead, which says what is
 * true: nothing measured here can answer for them.
 */
export function budgetPositions(
  records: readonly StoreRecord[],
  spend: SpendConfig | undefined,
  options: BudgetOptions,
): BudgetReport {
  const { catalogue, now = new Date() } = options;
  const period = options.period ?? monthOf(now);

  const positions: BudgetStanding[] = [];
  const unmeasuredScopes: BudgetScope[] = [];

  const elapsedMs = Math.min(Math.max(0, now.getTime() - period.fromMs), period.toMs - period.fromMs);
  const elapsedDays = Math.max(1, Math.ceil(elapsedMs / DAY_MS));
  const elapsedShare = elapsedMs / (period.toMs - period.fromMs);

  /**
   * `monthlyUsd`, never `maxUsd`. The two are the same units over different
   * denominators — one gates whatever period a log happens to cover, this
   * gates a calendar month — and reading one for the other is exactly the
   * disagreement this module exists to end.
   */
  if (spend?.monthlyUsd !== undefined) {
    let consumedUsd = 0;
    const measured = new Set<string>();
    for (const record of records) {
      const share = overlapShare(record, period);
      if (share === 0) continue;
      const usd = priceOf(record, catalogue);
      // An unpriced model contributes no dollars **and no measured day**:
      // counting the day would report the period as covered by money nobody
      // can see, which is the same flattering omission in a different place.
      if (usd === null) continue;
      consumedUsd += usd * share;
      for (const day of daysTouched(record, period)) measured.add(day);
    }

    const unmeasured: string[] = [];
    for (let d = 0; d < elapsedDays; d += 1) {
      const day = new Date(period.fromMs + d * DAY_MS).toISOString().slice(0, 10);
      if (!measured.has(day)) unmeasured.push(day);
    }

    const coverage: BudgetCoverage =
      measured.size === 0 ? 'none' : unmeasured.length === 0 ? 'complete' : 'partial';
    const limitUsd = spend.monthlyUsd;
    const consumedShare = limitUsd > 0 ? consumedUsd / limitUsd : null;

    positions.push({
      schemaVersion: 1,
      scope: { kind: 'total' },
      limitUsd,
      period,
      consumedUsd,
      remainingUsd: limitUsd - consumedUsd,
      provenance: 'measured',
      measuredDays: measured.size,
      elapsedDays,
      unmeasuredDays: unmeasured.slice(0, MAX_UNMEASURED_NAMED),
      coverage,
      burn: { consumedShare, elapsedShare, shape: shapeOf(consumedShare, elapsedShare, coverage) },
      verdict: coverage === 'none' ? 'cannot-tell' : consumedUsd > limitUsd ? 'over' : 'within',
    });
  }

  for (const label of Object.keys(spend?.byLabel ?? {})) {
    unmeasuredScopes.push({ kind: 'label', label });
  }
  for (const source of Object.keys(spend?.bySource ?? {})) {
    unmeasuredScopes.push({ kind: 'source', source });
  }

  return { schemaVersion: 1, period, positions, unmeasuredScopes };
}
