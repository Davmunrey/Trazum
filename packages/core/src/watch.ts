/**
 * The afternoon the loop burned a quarter of the month, said that afternoon.
 *
 * Every gate in this product fires when a human runs a command. The failures
 * worth catching — a retry loop, a prompt that grew, a model swapped in a
 * deploy — happen at 3pm on a Tuesday, and a report that arrives three weeks
 * later is an obituary.
 *
 * This module decides **what has crossed**, given what is measured and what
 * the operator asked to be told about. The pulling, the storing, the sleeping
 * and the sending live in the CLI; everything here is arithmetic over figures
 * somebody already has, which is what makes an alerting rule testable without
 * waiting for 3pm.
 *
 * **An alert fires on a measured crossing, never on a projection.** "You will
 * exceed" is a forecast, and this product has refused those at every window
 * length since 1.27. "You have spent $412 of a $400 budget, measured over
 * these calls" is a fact, and the difference is the only reason an alert at
 * 3am can be trusted.
 *
 * **A window too short to mean anything does not fire.** A day gate needs a
 * whole day of measurement before it can fail: the first ten minutes of a day
 * are not a day, and a watcher that cries at every dawn gets muted — which is
 * how alerting tools actually fail.
 */

import type { BucketedReport } from './connector.js';

export type WatchGate = 'maxUsd' | 'maxDayUsd' | 'maxCacheLossUsd';

/** Why a gate could not be judged rather than passed. */
export type NotJudgeable =
  /** Not enough of the period is measured for the threshold to mean anything. */
  | 'window-too-short'
  /** The source cannot serve the dimension this gate is written against. */
  | 'dimension-unavailable';

export interface WatchCrossing {
  gate: WatchGate;
  /** The measured figure that crossed, and the threshold it crossed. */
  measuredUsd: number;
  limitUsd: number;
  /** Which slice of time the figure covers — a day gate names its day. */
  window: { fromMs: number; toMs: number };
  /** A day gate's UTC day, so the alert names the afternoon it means. */
  day: string | null;
  /**
   * Everything a machine reader needs to know what kind of number this is.
   *
   * `measured` is the only value this module will ever emit: a projected
   * crossing is not a crossing. The field exists anyway, because a consumer
   * that cannot see the provenance will treat whatever arrives as fact — and
   * a later version of this file must not be able to smuggle an estimate past
   * a reader by leaving the question unasked.
   */
  provenance: 'measured';
}

export interface WatchAbstention {
  gate: WatchGate;
  reason: NotJudgeable;
  /** What is missing, as a figure the operator can act on. */
  detail: { coveredMs: number; neededMs: number } | null;
}

export interface WatchResult {
  crossings: WatchCrossing[];
  /**
   * Still over the limit, and already reported on an earlier cycle.
   *
   * These are the reason a quiet cycle is not the same as a clean one. A
   * restart that reported "within every threshold" while the budget was still
   * blown would be the flattering reading this product refuses everywhere:
   * the alert was suppressed, the *crossing* was not, and only one of those
   * is news.
   */
  suppressed: WatchCrossing[];
  /**
   * Gates that could not be judged, which is neither a pass nor a failure.
   *
   * Reported rather than swallowed: a gate silently skipped for a week reads
   * exactly like a gate that has been passing for a week, and those are very
   * different states to be in.
   */
  abstentions: WatchAbstention[];
  /**
   * The stretch this cycle did not watch, when a watcher was down or is
   * starting for the first time. A resumed watcher that says nothing implies
   * coverage it did not have.
   */
  gap: { fromMs: number; toMs: number } | null;
}

export interface WatchThresholds {
  maxUsd?: number;
  maxDayUsd?: number;
  maxCacheLossUsd?: number;
}

export interface WatchOptions {
  /** Priced measurements for the period being watched. */
  report: BucketedReport;
  thresholds: WatchThresholds;
  /** The cache verdict over the same report, when the caller computed one. */
  cacheDeltaUsd?: number;
  /** Now, so a partly-elapsed day can be told from a whole one. */
  nowMs: number;
  /** Where the previous cycle finished, for the coverage gap. */
  lastCoveredToMs?: number;
  /**
   * Gates already fired, by gate and by day, so a restart is not amnesia.
   *
   * Keyed `gate` for whole-period gates and `gate\nYYYY-MM-DD` for a day, so
   * a day that already alerted stays quiet while a *new* day crossing still
   * speaks.
   */
  alreadyFired?: ReadonlySet<string>;
}

/** A day gate cannot judge a day that has not finished being measured. */
export const DAY_MS = 86_400_000;

/**
 * How much of a period must be measured before a threshold over it means
 * anything. Nine tenths rather than all of it: a usage API's last bucket is
 * often minutes behind, and a gate that waits for perfection never fires.
 */
export const COVERAGE_FLOOR = 0.9;

export function firedKey(gate: WatchGate, day: string | null): string {
  return day === null ? gate : `${gate}\n${day}`;
}

export function evaluateWatch(options: WatchOptions): WatchResult {
  const { report, thresholds, cacheDeltaUsd, nowMs, lastCoveredToMs, alreadyFired } = options;
  const fired = alreadyFired ?? new Set<string>();
  const crossings: WatchCrossing[] = [];
  const suppressed: WatchCrossing[] = [];
  const abstentions: WatchAbstention[] = [];

  const span = report.span;

  const push = (gate: WatchGate, measuredUsd: number, limitUsd: number, day: string | null, window: { fromMs: number; toMs: number }): void => {
    if (measuredUsd <= limitUsd) return;
    const crossing: WatchCrossing = { gate, measuredUsd, limitUsd, window, day, provenance: 'measured' };
    // Already told: quiet, but still crossed. The two are kept apart because
    // "we alerted about this" and "this is fine now" are different sentences.
    (fired.has(firedKey(gate, day)) ? suppressed : crossings).push(crossing);
  };

  if (thresholds.maxUsd !== undefined) {
    if (span === null) {
      abstentions.push({ gate: 'maxUsd', reason: 'dimension-unavailable', detail: null });
    } else {
      push('maxUsd', report.total.totalUsd, thresholds.maxUsd, null, span);
    }
  }

  if (thresholds.maxCacheLossUsd !== undefined) {
    if (cacheDeltaUsd === undefined || span === null) {
      abstentions.push({ gate: 'maxCacheLossUsd', reason: 'dimension-unavailable', detail: null });
    } else {
      push('maxCacheLossUsd', cacheDeltaUsd, thresholds.maxCacheLossUsd, null, span);
    }
  }

  if (thresholds.maxDayUsd !== undefined) {
    if (report.byDay.length === 0) {
      abstentions.push({ gate: 'maxDayUsd', reason: 'dimension-unavailable', detail: null });
    } else {
      for (const entry of report.byDay) {
        const dayStart = Date.parse(`${entry.day}T00:00:00Z`);
        const dayEnd = dayStart + DAY_MS;
        /**
         * The day still running is measured only up to now, so a threshold
         * over it is a threshold over a fraction of a day. Once it *has*
         * crossed, the crossing is real whatever the hour — a day that is
         * already over budget at noon does not become less over budget at
         * midnight — so the abstention only applies while the figure is
         * still under the limit.
         */
        const covered = Math.min(nowMs, dayEnd) - dayStart;
        const whole = covered >= DAY_MS * COVERAGE_FLOOR;
        if (entry.usd > thresholds.maxDayUsd) {
          push('maxDayUsd', entry.usd, thresholds.maxDayUsd, entry.day, { fromMs: dayStart, toMs: dayEnd });
        } else if (!whole) {
          abstentions.push({
            gate: 'maxDayUsd',
            reason: 'window-too-short',
            detail: { coveredMs: Math.max(0, covered), neededMs: DAY_MS },
          });
        }
      }
    }
  }

  const gap =
    lastCoveredToMs !== undefined && span !== null && span.fromMs > lastCoveredToMs
      ? { fromMs: lastCoveredToMs, toMs: span.fromMs }
      : null;

  return { crossings, suppressed, abstentions, gap };
}
