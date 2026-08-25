/**
 * The month, ended on a measured position — the 1.67 arc's one answer.
 *
 * The product refuses to forecast, and that refusal stays. But "refuses to
 * forecast" and "cannot say where the month stands" are different sentences:
 * the measured burn, the days measured, and the arithmetic distance to each
 * configured ceiling are all measurements — and before this module they were
 * scattered across `profile`, `budgetPositions` and `watch` rather than
 * answerable as one question.
 *
 * **One source, named.** Everything here is measured from a usage log — the
 * record of what was called, priced record by record. The store's monthly
 * standing (provider-billed buckets, the number `serve` and `store` report)
 * is a different measurement of a different thing, and folding the two into
 * one figure would be the two-doors defect with extra steps. The document
 * says `source: "usage-log"` so no reader has to guess which this is.
 *
 * **The distance is division, labelled as division.** "At this measured
 * rate, the limit is N days away" is `remaining ÷ (measured ÷ days
 * measured)` — arithmetic on the past, stated with its own denominators. It
 * is absent, not zeroed, when the rate stands on fewer measured days than
 * `MIN_SCALE_DAYS`, the same floor every scaled figure in this product
 * respects; absent when nothing was measured; and absent on an `over`,
 * because the distance to a place you have already passed is not a number
 * this tool prints. There is no field naming a date, here or anywhere.
 */

import { monthOf } from './budget.js';
import type { BudgetPeriod } from './budget.js';
import { MIN_SCALE_DAYS } from './measured-profile.js';
import { costOf } from './session-cost.js';
import type { UsageRecord } from './usage.js';
import type { PricingCatalogue } from './pricing.js';
import type { LimitsConfig, SpendConfig } from './config-schema.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** What a position is measured against, and over which window. */
export type PositionScope = 'month' | 'day' | 'label';

export interface PositionDistance {
  /** `remainingUsd ÷ usdPerDay`. Division on the past, not a prediction. */
  daysAway: number;
  /** The measured rate: month-to-date spend over the days that measured it. */
  usdPerDay: number;
  /** The denominator of the rate — how many measured days stand behind it. */
  overDays: number;
  /** Always `division`: what this number is, stated in the number. */
  arithmetic: 'division';
}

export interface PositionStanding {
  scope: PositionScope;
  /** Which label, when the scope is `label`. Null otherwise. */
  label: string | null;
  limitUsd: number;
  /** Priced from the log's own records. Never an estimate. */
  measuredUsd: number;
  remainingUsd: number;
  /** The window the measured figure covers. */
  window: { fromMs: number; toMs: number };
  /** Distinct UTC days inside the window carrying any measurement. */
  daysMeasured: number;
  /** Days of the window already elapsed when this was computed. */
  daysElapsed: number;
  verdict: 'within' | 'over' | 'cannot-tell';
  /**
   * Present only when it means something: a `within` verdict standing on at
   * least `MIN_SCALE_DAYS` measured days and a non-zero rate. Null is "this
   * arithmetic would mislead", never "we forgot".
   */
  distance: PositionDistance | null;
}

/**
 * What a position document deliberately does not answer.
 *
 * Codes rather than prose, like every other document here: a consumer can
 * branch on them, and each rendering carries the sentence in its own
 * language.
 */
export type PositionCaveat = 'session-limit-at-the-doors' | 'no-ceiling-configured';

/** A configured ceiling this log cannot measure, with the reason stated. */
export interface UnmeasuredPosition {
  scope: PositionScope;
  label: string | null;
  limitUsd: number;
  why: 'no-clock' | 'no-labels' | 'nothing-recorded' | 'label-unseen';
}

export interface PositionDocument {
  schemaVersion: 1;
  /** Where every figure below was measured from. */
  source: 'usage-log';
  month: BudgetPeriod;
  positions: PositionStanding[];
  /** Configured ceilings the log cannot answer for, each with the reason. */
  unmeasured: UnmeasuredPosition[];
  /**
   * What this document deliberately does not answer, stated rather than
   * implied. The per-session ceiling is judged per call at the doors — a
   * session is not a calendar scope, and a "session position for the month"
   * would be an average wearing a limit's name.
   */
  cannotSay: PositionCaveat[];
  /** Records whose model the catalogue cannot price — money nobody can see. */
  unpricedRecords: number;
}

const daysIn = (stamps: Iterable<number>): number => {
  const days = new Set<string>();
  for (const ms of stamps) days.add(new Date(ms).toISOString().slice(0, 10));
  return days.size;
};

/**
 * The position, measured from one parsed usage log.
 *
 * Pure over its inputs, like `judgeLimits` and for the same reason: the
 * same function answers at the CLI, in the HTML door and over MCP, so the
 * surfaces cannot disagree about where the month stands.
 */
export function positionReport(
  records: readonly UsageRecord[],
  config: { spend?: SpendConfig; limits?: LimitsConfig },
  options: { catalogue: PricingCatalogue; on?: Date },
): PositionDocument {
  const { catalogue, on = new Date() } = options;
  const month = monthOf(on);
  const dayFromMs = Math.floor(on.getTime() / DAY_MS) * DAY_MS;
  const dayWindow = { fromMs: dayFromMs, toMs: dayFromMs + DAY_MS };
  const monthWindow = { fromMs: month.fromMs, toMs: month.toMs };
  const elapsedDays = Math.max(
    1,
    Math.min(month.days, Math.ceil((on.getTime() - month.fromMs) / DAY_MS)),
  );

  let unpricedRecords = 0;
  let clocksSeen = false;
  let labelsSeen = false;
  let monthUsd = 0;
  let dayUsd = 0;
  const monthDays = new Set<number>();
  const labelUsd = new Map<string, number>();
  const labelDays = new Map<string, Set<number>>();

  for (const record of records) {
    if (record.ts !== null) clocksSeen = true;
    if (record.label !== null) labelsSeen = true;
    const usd = costOf(record, catalogue, on);
    if (usd === null) {
      unpricedRecords += 1;
      continue;
    }
    if (record.ts === null) continue; // a clockless record belongs to no window
    const day = Math.floor(record.ts / DAY_MS) * DAY_MS;
    if (record.ts >= month.fromMs && record.ts < month.toMs) {
      monthUsd += usd;
      monthDays.add(day);
      if (record.label !== null) {
        labelUsd.set(record.label, (labelUsd.get(record.label) ?? 0) + usd);
        if (!labelDays.has(record.label)) labelDays.set(record.label, new Set());
        labelDays.get(record.label)!.add(day);
      }
    }
    if (record.ts >= dayWindow.fromMs && record.ts < dayWindow.toMs) dayUsd += usd;
  }

  const positions: PositionStanding[] = [];
  const unmeasured: UnmeasuredPosition[] = [];

  const standing = (
    scope: PositionScope,
    label: string | null,
    limitUsd: number,
    measuredUsd: number,
    window: { fromMs: number; toMs: number },
    daysMeasured: number,
    daysElapsed: number,
    measured: boolean,
  ): PositionStanding => {
    const verdict = !measured ? 'cannot-tell' : measuredUsd > limitUsd ? 'over' : 'within';
    const usdPerDay = daysMeasured > 0 ? measuredUsd / daysMeasured : 0;
    const distance: PositionDistance | null =
      verdict === 'within' && daysMeasured >= MIN_SCALE_DAYS && usdPerDay > 0
        ? {
            daysAway: (limitUsd - measuredUsd) / usdPerDay,
            usdPerDay,
            overDays: daysMeasured,
            arithmetic: 'division',
          }
        : null;
    return {
      scope,
      label,
      limitUsd,
      measuredUsd,
      remainingUsd: limitUsd - measuredUsd,
      window,
      daysMeasured,
      daysElapsed,
      verdict,
      distance,
    };
  };

  const monthly = config.spend?.monthlyUsd;
  if (monthly !== undefined) {
    if (!clocksSeen) {
      unmeasured.push({ scope: 'month', label: null, limitUsd: monthly, why: records.length === 0 ? 'nothing-recorded' : 'no-clock' });
    } else {
      /**
       * A month with zero measured days is a stale log, not a quiet month:
       * `budgetPositions` has held that line since 1.49 ("coverage none is
       * cannot-tell"), and this module agreeing with it is the point of the
       * arc. Contrast the day scope below, deliberately.
       */
      positions.push(
        standing('month', null, monthly, monthUsd, monthWindow, monthDays.size, elapsedDays, monthDays.size > 0),
      );
    }
  }

  const day = config.limits?.dayUsd;
  if (day !== undefined) {
    if (!clocksSeen) {
      unmeasured.push({ scope: 'day', label: null, limitUsd: day, why: records.length === 0 ? 'nothing-recorded' : 'no-clock' });
    } else {
      /**
       * A day with no records inside a log that records clocks is a quiet
       * day, measured at $0 — the same reading `positionAt` gives the doors,
       * because a position page and an enforcement door disagreeing about
       * today's spend is the exact defect the 1.66 arc closed. And one day
       * is one day: the distance arithmetic needs a multi-day rate, so a
       * day position never carries a `distance` — always under the floor.
       */
      positions.push(standing('day', null, day, dayUsd, dayWindow, monthDays.has(dayFromMs) ? 1 : 0, 1, true));
    }
  }

  for (const [label, limitUsd] of Object.entries(config.limits?.byLabel ?? {})) {
    if (!clocksSeen || !labelsSeen) {
      unmeasured.push({
        scope: 'label',
        label,
        limitUsd,
        why: records.length === 0 ? 'nothing-recorded' : !clocksSeen ? 'no-clock' : 'no-labels',
      });
    } else if (!labelUsd.has(label)) {
      // The log records labels and has never seen this one this month. That
      // is a measured empty history — but a position of $0 with no days
      // behind it would print the healthiest possible line for a label that
      // may simply have been renamed, so it is named instead.
      unmeasured.push({ scope: 'label', label, limitUsd, why: 'label-unseen' });
    } else {
      positions.push(
        standing('label', label, limitUsd, labelUsd.get(label)!, monthWindow, daysIn(labelDays.get(label)!), elapsedDays, true),
      );
    }
  }

  /**
   * Codes, not sentences — the rule this document was the last to follow.
   *
   * Its three sibling documents already say why, in the contract itself:
   * "codes rather than prose so a consumer can branch and the renderings
   * carry the sentences". This one pushed English prose instead, and the
   * consequence was visible the first time somebody ran it in Spanish: a
   * localized heading over an untranslated paragraph. A sentence baked
   * into a document is a sentence no locale can reach.
   */
  const cannotSay: PositionCaveat[] = [];
  if (config.limits?.sessionUsd !== undefined) {
    cannotSay.push('session-limit-at-the-doors');
  }
  if (monthly === undefined && config.limits?.dayUsd === undefined && Object.keys(config.limits?.byLabel ?? {}).length === 0) {
    cannotSay.push('no-ceiling-configured');
  }

  return {
    schemaVersion: 1,
    source: 'usage-log',
    month,
    positions,
    unmeasured,
    cannotSay,
    unpricedRecords,
  };
}
