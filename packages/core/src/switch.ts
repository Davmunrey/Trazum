/**
 * The switching decision, priced — the 1.74 arc's second chapter.
 *
 * Every what-if reader is really asking one question: *should we move this
 * traffic, and when does moving pay?* The what-if answers the first half as
 * arithmetic; this answers the second half the only way this product allows:
 *
 * - the delta rests on `repriceProfile` — the same slice-by-slice move that
 *   already refuses over-context slices and cache traffic the target could
 *   not grant, so nothing here re-derives pricing;
 * - break-even is **division on the past**: a declared migration cost over
 *   the measured daily rate of the saving, with the denominator (how many
 *   days were measured) attached. No growth is assumed, nothing is
 *   forecast — if the log carries no timestamps there is no rate, and the
 *   answer is a stated refusal rather than an invented calendar;
 * - the evaluation the switch requires is itself priced, because the cost
 *   of *knowing* the cheaper model can do the work is part of the cost of
 *   switching: `trazum route` spends three provider calls per case (two on
 *   the incumbent, one on the candidate), priced here at this log's own
 *   mean call — an assumption, and a stated one.
 *
 * **What this never says: anything about quality.** Whether the target can
 * do the work is `trazum route`'s verdict to measure, and every rendering
 * of this document is expected to end by pointing there.
 */

import type { PricingCatalogue } from './pricing.js';
import { repriceProfile } from './reprice.js';
import type { RepriceReport } from './reprice.js';
import type { UsageProfileReport } from './usage.js';

const DAY_MS = 86_400_000;

/** Why a break-even could not be computed. Absence is never silent. */
export type BreakEvenRefusal =
  /** The reprice shows no saving — there is nothing for migration to recover. */
  | 'no-saving'
  /** No record carried a timestamp, so the log has no measured rate. */
  | 'no-clock';

export interface SwitchAnalysis {
  schemaVersion: 1;
  /** The slice-by-slice move this analysis rests on, verbatim. */
  reprice: RepriceReport;
  /**
   * `currentUsd - targetUsd` over the movable slices: **positive means the
   * switch saves.** Stated with its own name because `reprice.deltaUsd`
   * carries the opposite convention (`target - current`, negative is
   * cheaper), and a sign read across that boundary is exactly the class of
   * defect that ships a break-even for a switch that loses money.
   */
  savingUsd: number;
  /**
   * Days the measured window spans, from the log's own first and last
   * timestamps. Null when no record carried one — and then nothing below
   * that needs a rate exists either.
   */
  measuredDays: number | null;
  /** The saving as a daily rate over that window. Null with the window. */
  dailySavingUsd: number | null;
  /**
   * Declared migration cost over the measured daily saving. Present only
   * when a migration cost was declared; `refused` names why the division
   * could not be made rather than leaving a hole.
   */
  breakEven:
    | { migrationUsd: number; days: number }
    | { migrationUsd: number; refused: BreakEvenRefusal }
    | null;
  /**
   * What `trazum route` would cost on this traffic: per case, two calls on
   * the incumbent mix and one on the target, each priced at this log's own
   * mean movable call. Present only when a case count was declared —
   * defaulting one would be inventing the size of somebody's test set.
   */
  evalCost: {
    cases: number;
    meanCurrentCallUsd: number;
    meanTargetCallUsd: number;
    totalUsd: number;
  } | null;
}

export interface SwitchOptions {
  catalogue: PricingCatalogue;
  on?: Date;
  /** What the reader says the migration itself costs. Declared, never guessed. */
  migrationUsd?: number;
  /** How many evaluation cases the reader would run. Declared, never guessed. */
  evalCases?: number;
}

/**
 * Null when the catalogue does not know the target — the same contract as
 * `repriceProfile`, and for the same reason: a comparison against a price
 * nobody has is worse than no comparison.
 */
export function switchAnalysis(
  report: UsageProfileReport,
  targetId: string,
  options: SwitchOptions,
): SwitchAnalysis | null {
  const { catalogue, on = new Date(), migrationUsd, evalCases } = options;
  const reprice = repriceProfile(report, targetId, catalogue, on);
  if (reprice === null) return null;

  // reprice's convention is `target - current` (negative is cheaper); the
  // saving is its negation, named so no reader has to carry the sign.
  const savingUsd = -reprice.deltaUsd;

  const span = report.span;
  const measuredDays =
    span === null ? null : Math.max(1, Math.ceil((span.toMs - span.fromMs) / DAY_MS));
  const dailySavingUsd = measuredDays === null ? null : savingUsd / measuredDays;

  let breakEven: SwitchAnalysis['breakEven'] = null;
  if (migrationUsd !== undefined) {
    if (savingUsd <= 0) breakEven = { migrationUsd, refused: 'no-saving' };
    else if (dailySavingUsd === null) breakEven = { migrationUsd, refused: 'no-clock' };
    else breakEven = { migrationUsd, days: migrationUsd / dailySavingUsd };
  }

  let evalCost: SwitchAnalysis['evalCost'] = null;
  const movableCalls = reprice.slices.reduce((sum, slice) => sum + slice.calls, 0);
  if (evalCases !== undefined && evalCases > 0 && movableCalls > 0) {
    const meanCurrentCallUsd = reprice.currentUsd / movableCalls;
    const meanTargetCallUsd = reprice.targetUsd / movableCalls;
    evalCost = {
      cases: evalCases,
      meanCurrentCallUsd,
      meanTargetCallUsd,
      // route's own bill: two calls on the incumbent, one on the candidate.
      totalUsd: evalCases * (2 * meanCurrentCallUsd + meanTargetCallUsd),
    };
  }

  return { schemaVersion: 1, reprice, savingUsd, measuredDays, dailySavingUsd, breakEven, evalCost };
}

/**
 * A self-hosted model's dollars per million tokens, derived from the
 * operator's own two numbers — the 1.74 arc's third chapter.
 *
 * GPU dollars per hour over measured tokens per second, at a declared
 * utilisation. Division, nothing else: no amortisation, no energy model, no
 * guessed cluster efficiency — a calculator that estimated those would be an
 * invented price wearing arithmetic's clothes. The result is only as honest
 * as the throughput measurement it was given, which is why every rendering
 * labels it derived-from-your-declaration.
 */
export function ownRate(inputs: {
  gpuUsdPerHour: number;
  tokensPerSecond: number;
  /** Fraction of the hour actually serving (0–1]. Defaults to 1. */
  utilization?: number;
}): { usdPerMTok: number } {
  const { gpuUsdPerHour, tokensPerSecond, utilization = 1 } = inputs;
  if (!(gpuUsdPerHour > 0)) throw new Error('gpuUsdPerHour must be a positive number');
  if (!(tokensPerSecond > 0)) throw new Error('tokensPerSecond must be a positive number');
  if (!(utilization > 0 && utilization <= 1))
    throw new Error('utilization must be greater than 0 and at most 1');
  const tokensPerHour = tokensPerSecond * 3600 * utilization;
  return { usdPerMTok: (gpuUsdPerHour / tokensPerHour) * 1_000_000 };
}
