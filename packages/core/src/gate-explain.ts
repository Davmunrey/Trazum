/**
 * Why a gate failed, and what would move it — from figures the report already
 * computed.
 *
 * A gate today prints a verdict and an exit code. The person reading it is in
 * CI, which is the one place nobody opens the full report: the build is red,
 * the message says the bill is over budget, and finding out *which workload*
 * and *what to do* means running the tool again locally with different flags.
 * Most people do not, so the gate is a tripwire rather than a fix.
 *
 * **This module invents nothing.** The overage is subtraction, the largest
 * contributor is the biggest slice already in the report, and the cheapest
 * lever is `billLevers`' own arithmetic. What is added is the joining of the
 * three, so the failure carries its own next step.
 *
 * What it deliberately does not do is recommend. `coversIt` states whether the
 * lever's saving is at least the overage — a comparison of two numbers already
 * on the page — and nothing here claims the cheaper model can do the work or
 * that the calls can wait for a batch window. Those are the reader's to judge,
 * and the copy on every surface says so.
 */

import type { BillLevers, SliceLevers } from './levers.js';
import type { UsageProfileReport } from './usage.js';

export interface GateExplanation {
  /** What the bill was over by. Always positive — this only describes failures. */
  overageUsd: number;
  /**
   * The slice carrying the most spend, or null when the report has no slices
   * to point at. Null rather than a zeroed row: "nothing to name" and "a
   * workload that cost nothing" are different statements.
   */
  largest: { label: string; model: string; usd: number; share: number } | null;
  /**
   * The single cheapest lever available anywhere in the bill, by what it
   * would save. Null when the catalogue offers none — no routing candidate
   * and no batch price is a real answer, not an empty recommendation.
   */
  lever: SliceLevers | null;
  /**
   * Whether that lever alone would cover the overage. Two numbers compared,
   * stated rather than implied: a lever worth half the overage is still worth
   * pulling, and a reader must not be left to infer it closed the gap.
   */
  coversIt: boolean;
}

/**
 * The explanation for a failed spend gate.
 *
 * `overUsd` is what the gate judged minus its limit — passed in rather than
 * recomputed, because each gate judges a different figure (the whole bill, one
 * day, one conversation) and this module must not guess which.
 */
export function explainGateFailure(
  report: UsageProfileReport,
  levers: BillLevers,
  overUsd: number,
): GateExplanation {
  const biggest = report.byLabelAndModel[0] ?? null;
  const lever = levers.slices.length > 0 ? levers.slices[0]! : null;

  return {
    overageUsd: overUsd,
    largest:
      biggest === null
        ? null
        : {
            label: biggest.label,
            model: biggest.model,
            usd: biggest.breakdown.totalUsd,
            share:
              report.total.totalUsd > 0
                ? biggest.breakdown.totalUsd / report.total.totalUsd
                : 0,
          },
    lever,
    coversIt: lever !== null && lever.combinedUsd >= overUsd,
  };
}

/**
 * How much room a passing gate had left, as a fraction of the limit.
 *
 * A pass 2% under budget and a pass 60% under are different states of the
 * world, and only one of them is quiet news. Returned as a fraction so every
 * surface applies the same threshold to it rather than inventing one.
 *
 * `null` when the limit is zero — a budget of nothing has no margin to be a
 * fraction of, and dividing would produce an Infinity that reads like an
 * answer.
 */
export function gateMargin(judgedUsd: number, limitUsd: number): number | null {
  if (limitUsd <= 0) return null;
  return (limitUsd - judgedUsd) / limitUsd;
}

/**
 * The threshold under which a pass is worth saying out loud, stated here and
 * repeated in every rendering's copy.
 *
 * A tenth of the budget is close enough that the next ordinary week crosses
 * it. Wider than that and the pass is genuinely quiet news, which is what a
 * gate passing should usually be.
 */
export const GATE_MARGIN_TIGHT = 0.1;
