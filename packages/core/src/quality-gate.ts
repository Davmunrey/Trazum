/**
 * The failure that actually matters, and the four ways of getting it wrong.
 *
 * CI has been able to fail a build for tokens since 1.4 and for dollars since
 * 1.21. A prompt edit that quietly made the product worse has never been
 * gateable — which means every cost saving this tool has ever recommended went
 * into a repository with its most important consequence unmeasured.
 *
 * ## This is a before-and-after, not an experiment
 *
 * Worth saying in the first paragraph, because the arithmetic is the same as
 * `experiment`'s and the epistemics are not. An experiment splits traffic
 * randomly, so the two arms differ only in the thing under test. A
 * before-and-after splits it by **time**, and everything else that changed at
 * the same time is in the difference too.
 *
 * So this module spends most of its code looking for reasons *not* to blame the
 * prompt, and it reports `cannot-tell` far more readily than a randomised
 * comparison would. That is not timidity. A gate that blames the prompt because
 * the prompt is the thing it can see will be switched off within a month, and a
 * switched-off gate catches nothing at all.
 *
 * ## The three confounders it can actually see
 *
 * **The model moved.** If the mix of models shifted across the boundary, the
 * prompt is not the only variable, and the drop may be entirely somebody else's
 * migration.
 *
 * **The volume moved.** A workload whose traffic tripled is usually a workload
 * whose *population* changed — a new surface, a new customer, a marketing
 * campaign — and the questions being asked are not the questions from before.
 *
 * **The coverage moved.** The subtle one, and the one nobody thinks of: if the
 * share of calls recording an outcome changed, the two rates describe different
 * populations. A team that started instrumenting its hard cases will see its
 * measured rate fall without anything getting worse.
 *
 * Any of them present, and the verdict is `cannot-tell` with the confounder
 * **named**. Not a hedge attached to a blame — a refusal to blame.
 *
 * ## What it cannot see, and says so
 *
 * Everything else deployed that day. This module has one label's numbers and no
 * knowledge of the world, and it never pretends otherwise: a `dropped` verdict
 * is a statement that the rate fell and the three things it can check did not
 * move, which is a smaller claim than "the prompt did it" and is the largest
 * claim the evidence supports.
 */

import { runExperiment } from './experiment.js';
import type { ArmResult, ExperimentArm } from './experiment.js';
import type { OutcomeVocabulary } from './outcome.js';

/**
 * Outcomes each side of the change needs before a verdict is offered.
 *
 * A hundred rather than the ten used for a rate elsewhere, because this one
 * fails builds. The cost of a wrong `dropped` is somebody reverting a good
 * change and losing the saving; the cost of a wrong `cannot-tell` is waiting a
 * day. Those are not symmetric and the threshold is not either.
 */
export const MIN_OUTCOMES_EACH_SIDE = 100;

/** How far the model mix may move before the comparison stops being about the prompt. */
export const MAX_MODEL_MIX_DRIFT = 0.1;

/**
 * How far the call volume may move, as a ratio.
 *
 * Half again, either way. Ordinary week-to-week traffic moves less than that;
 * a workload that doubled is usually a workload whose population changed.
 */
export const MAX_VOLUME_RATIO = 1.5;

/** How far outcome coverage may move before the two rates describe different populations. */
export const MAX_COVERAGE_DRIFT = 0.1;

export type Confounder =
  | { kind: 'model-mix-moved'; drift: number; model: string }
  | { kind: 'volume-moved'; beforeCalls: number; afterCalls: number; ratio: number }
  | { kind: 'coverage-moved'; before: number; after: number };

export type GateVerdict = 'held' | 'dropped' | 'cannot-tell';

export type GateUnknown =
  | 'too-few-before'
  | 'too-few-after'
  | 'confounded'
  | 'no-vocabulary'
  | 'not-separable';

/** One side of the boundary, as the caller measured it. */
export interface GateSide {
  arm: ExperimentArm;
  /** Every call in the window, outcome or not — the coverage denominator. */
  calls: number;
  /** Spend per model, for the mix comparison. */
  usdByModel: Array<{ model: string; usd: number }>;
}

export interface QualityGate {
  verdict: GateVerdict;
  /** Why, when the verdict is `cannot-tell`. A refusal never arrives bare. */
  unknown: GateUnknown | null;
  before: ArmResult;
  after: ArmResult;
  /** The 95% interval on (after − before), or null. */
  difference: { point: number; low: number; high: number } | null;
  /**
   * Everything found that means the prompt is not the only variable.
   *
   * Non-empty forces `cannot-tell`. Reported even on a `held` verdict, because
   * a rate that held while the model changed underneath is not evidence that
   * the prompt is fine either.
   */
  confounders: Confounder[];
  /**
   * The cost half — measured, and kept beside the quality half rather than
   * merged with it. The sentence teams argue about needs both.
   */
  cost: { beforeUsdPerCall: number; afterUsdPerCall: number; deltaUsdPerCall: number } | null;
  /** Outcomes behind the comparison, so the claim carries its own sample size. */
  outcomes: { before: number; after: number };
}

function mixDrift(
  before: Array<{ model: string; usd: number }>,
  after: Array<{ model: string; usd: number }>,
): Confounder | null {
  const share = (rows: Array<{ model: string; usd: number }>): Map<string, number> => {
    const total = rows.reduce((sum, row) => sum + row.usd, 0);
    const out = new Map<string, number>();
    if (total <= 0) return out;
    for (const row of rows) out.set(row.model, (out.get(row.model) ?? 0) + row.usd / total);
    return out;
  };
  const a = share(before);
  const b = share(after);
  let worst: { model: string; drift: number } | null = null;
  for (const model of new Set([...a.keys(), ...b.keys()])) {
    const drift = Math.abs((b.get(model) ?? 0) - (a.get(model) ?? 0));
    if (worst === null || drift > worst.drift) worst = { model, drift };
  }
  if (worst === null || worst.drift <= MAX_MODEL_MIX_DRIFT) return null;
  return { kind: 'model-mix-moved', drift: worst.drift, model: worst.model };
}

export function qualityGate(
  before: GateSide,
  after: GateSide,
  vocabulary: OutcomeVocabulary | null,
): QualityGate {
  /**
   * The statistics are `experiment`'s, deliberately.
   *
   * One implementation of a two-proportion comparison, so a gate and a
   * deliberate experiment can never disagree about the same two numbers — the
   * failure mode where a team runs both and gets two answers, then trusts
   * whichever one they liked.
   */
  const stats = runExperiment(
    { arms: ['before', 'after'], minOutcomesPerArm: MIN_OUTCOMES_EACH_SIDE },
    { a: { ...after.arm, name: 'after' }, b: { ...before.arm, name: 'before' } },
    vocabulary,
  );

  const outcomes = { before: stats.b.recorded, after: stats.a.recorded };
  const cost =
    before.calls > 0 && after.calls > 0
      ? {
          beforeUsdPerCall: before.arm.totalUsd / before.calls,
          afterUsdPerCall: after.arm.totalUsd / after.calls,
          deltaUsdPerCall: after.arm.totalUsd / after.calls - before.arm.totalUsd / before.calls,
        }
      : null;

  const confounders: Confounder[] = [];
  const mix = mixDrift(before.usdByModel, after.usdByModel);
  if (mix !== null) confounders.push(mix);

  if (before.calls > 0 && after.calls > 0) {
    const ratio = after.calls / before.calls;
    if (ratio > MAX_VOLUME_RATIO || ratio < 1 / MAX_VOLUME_RATIO) {
      confounders.push({
        kind: 'volume-moved',
        beforeCalls: before.calls,
        afterCalls: after.calls,
        ratio,
      });
    }
    /**
     * Coverage, the one nobody thinks of.
     *
     * A team that starts instrumenting its hard cases sees its measured rate
     * fall without anything having got worse. Comparing two rates over
     * differently-selected populations is the most convincing wrong answer
     * this module could produce.
     */
    const coverageBefore = outcomes.before / before.calls;
    const coverageAfter = outcomes.after / after.calls;
    if (Math.abs(coverageAfter - coverageBefore) > MAX_COVERAGE_DRIFT) {
      confounders.push({ kind: 'coverage-moved', before: coverageBefore, after: coverageAfter });
    }
  }

  const shell = {
    before: stats.b,
    after: stats.a,
    difference: stats.difference,
    confounders,
    cost,
    outcomes,
  };

  if (vocabulary === null || vocabulary.success.length === 0) {
    return { ...shell, verdict: 'cannot-tell', unknown: 'no-vocabulary' };
  }
  if (outcomes.before < MIN_OUTCOMES_EACH_SIDE) {
    return { ...shell, verdict: 'cannot-tell', unknown: 'too-few-before' };
  }
  if (outcomes.after < MIN_OUTCOMES_EACH_SIDE) {
    return { ...shell, verdict: 'cannot-tell', unknown: 'too-few-after' };
  }
  /**
   * A confounder outranks the statistics.
   *
   * Checked after the sample sizes and before the verdict, so a build is never
   * failed on a difference that something else could equally explain. A gate
   * that blames the prompt because the prompt is the thing it can see gets
   * switched off within a month, and a switched-off gate catches nothing.
   */
  if (confounders.length > 0) {
    return { ...shell, verdict: 'cannot-tell', unknown: 'confounded' };
  }
  if (stats.separation === 'not-separable') {
    /**
     * Not separable is `cannot-tell`, never `held`.
     *
     * "The rate did not measurably fall" and "the rate held" are different
     * claims, and a gate that spells them the same way passes a real
     * regression it merely lacked the power to see. `verify` has held this
     * line since 1.39 and it matters more here, because this one is wired to
     * an exit code.
     */
    return { ...shell, verdict: 'cannot-tell', unknown: 'not-separable' };
  }
  // `a` is the *after* arm, so `a-wins` means the rate went up.
  return {
    ...shell,
    verdict: stats.separation === 'a-wins' ? 'held' : 'dropped',
    unknown: null,
  };
}
