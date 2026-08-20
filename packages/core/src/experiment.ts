/**
 * Two arms on real traffic, and the three things that stop it being theatre.
 *
 * `eval` compares two prompts on cases somebody wrote; `route` compares two
 * models on the same. Both measure agreement in a laboratory. The traffic is
 * the only place the real question gets answered — and the moment a comparison
 * runs on real traffic, three failures become available that a laboratory does
 * not have.
 *
 * ## 1. A winner where there is none
 *
 * Two arms always produce two numbers, and one of them is always larger. An
 * A/B report that names a winner from that is a coin flip with a dashboard.
 * The verdict here is **three-valued**, the way `verify`'s has been since
 * 1.39: A wins, B wins, or **not separable on this traffic** — and the third
 * one comes with the number of outcomes per arm that *would* separate them, so
 * "run it longer" is a quantified instruction rather than a shrug.
 *
 * ## 2. Peeking
 *
 * A test stopped on the first afternoon it looked good is not a test. The
 * stopping rule is declared **before** the experiment starts, and the report
 * says whether it was honoured. It cannot enforce that — nobody can stop
 * somebody reading a number early — but it can make an early stop *visible*
 * to whoever reads the result later, which is the part that matters.
 *
 * ## 3. Quality and cost judged apart, then together
 *
 * The interesting arm is almost never better *and* cheaper. It is better and
 * dearer, and the decision needs one figure nobody computes: **what an extra
 * success costs**. That is the marginal figure — the difference in spend over
 * the difference in successes — and it is the number a product decision
 * actually turns on, printed rather than left as an exercise.
 *
 * ## The statistics are shown, not asserted
 *
 * Wilson score intervals per arm and Newcombe's interval on the difference,
 * because both behave at the small samples this will actually see. The
 * intervals are returned, not just the verdict: a reader who disagrees with
 * the threshold can see the numbers it was applied to, which is the same
 * discipline `eval` established by running the original twice before judging
 * anything against it.
 */

import { judgeOutcome } from './outcome.js';
import type { OutcomeTally, OutcomeVocabulary } from './outcome.js';

/** z for a two-sided 95% interval, and for 80% power. */
const Z_95 = 1.959963984540054;
const Z_POWER_80 = 0.8416212335729143;

/**
 * The declaration, made before the experiment runs.
 *
 * Its whole purpose is to exist *earlier* than the result. A stopping rule
 * invented after looking at the numbers is not a stopping rule.
 */
export interface ExperimentDeclaration {
  /** Two arms. More would need a multiple-comparison correction nobody asked for. */
  arms: [string, string];
  /**
   * Outcomes each arm must record before the result may be read.
   *
   * Declared as a count rather than a duration, because a duration is a proxy
   * for a count and the proxy breaks the week traffic doubles.
   */
  minOutcomesPerArm: number;
}

/** What one arm actually did. */
export interface ExperimentArm {
  name: string;
  tally: OutcomeTally;
  /** Everything this arm spent, recorded outcome or not. */
  totalUsd: number;
}

export interface ArmResult {
  name: string;
  successes: number;
  /** Calls carrying a *declared* outcome — the denominator. */
  recorded: number;
  /** Successes over recorded, or null when nothing was recorded. */
  rate: number | null;
  /** Wilson score interval on that rate, or null. */
  interval: { low: number; high: number } | null;
  /** Spend on calls carrying a declared outcome. */
  recordedUsd: number;
}

export type Separation = 'a-wins' | 'b-wins' | 'not-separable';

export type NotSeparableReason =
  | 'interval-includes-zero'
  | 'no-difference-observed'
  | 'nothing-recorded';

export interface Marginal {
  /**
   * What one extra success costs, going from the worse arm to the better one.
   *
   * `(dearer spend − cheaper spend) / (more successes − fewer successes)`,
   * both per call so arms of different sizes compare. Null when the better arm
   * is also the cheaper one, because then nothing is being bought and a
   * "cost per extra success" would be a negative number people would quote.
   */
  usdPerExtraSuccess: number | null;
  /** The arm that resolved more, by rate. */
  better: string;
  /** Whether that arm also costs more per call. */
  dearer: boolean;
}

export interface ExperimentResult {
  a: ArmResult;
  b: ArmResult;
  separation: Separation;
  /** Why, when not separable. A refusal never arrives bare. */
  notSeparable: NotSeparableReason | null;
  /** Newcombe's interval on (rate A − rate B), or null. */
  difference: { point: number; low: number; high: number } | null;
  /**
   * Outcomes **per arm** that would separate the observed difference, or null.
   *
   * Null when the arms recorded the same rate: no sample size separates a
   * difference of zero, and returning a very large number would read as "keep
   * going" when the honest answer is "there is nothing here to find".
   */
  outcomesNeededPerArm: number | null;
  stopping: {
    declared: number;
    /** Whether both arms cleared the declared minimum. */
    honoured: boolean;
    /** The arm that has not, when one has not. */
    short: string | null;
  };
  marginal: Marginal | null;
}

/** Wilson score interval — behaves at the sample sizes this will actually see. */
function wilson(successes: number, n: number, z = Z_95): { low: number; high: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return { low: Math.max(0, centre - half), high: Math.min(1, centre + half) };
}

function resultOf(arm: ExperimentArm, vocabulary: OutcomeVocabulary | null): ArmResult {
  const declared = vocabulary ?? { values: [], success: [] };
  let successes = 0;
  let recorded = 0;
  let recordedUsd = 0;
  for (const entry of arm.tally.byValue) {
    // Undeclared values are out of both halves, as everywhere since 1.50.4: a
    // typo in an exporter must not decide an experiment.
    if (judgeOutcome(entry.value, declared) === 'undeclared') continue;
    recorded += entry.calls;
    recordedUsd += entry.usd;
    if (declared.success.includes(entry.value)) successes += entry.calls;
  }
  return {
    name: arm.name,
    successes,
    recorded,
    rate: recorded > 0 ? successes / recorded : null,
    interval: wilson(successes, recorded),
    recordedUsd,
  };
}

export function runExperiment(
  declaration: ExperimentDeclaration,
  arms: { a: ExperimentArm; b: ExperimentArm },
  vocabulary: OutcomeVocabulary | null,
): ExperimentResult {
  const a = resultOf(arms.a, vocabulary);
  const b = resultOf(arms.b, vocabulary);

  const stopping = {
    declared: declaration.minOutcomesPerArm,
    honoured: a.recorded >= declaration.minOutcomesPerArm && b.recorded >= declaration.minOutcomesPerArm,
    short:
      a.recorded < declaration.minOutcomesPerArm
        ? a.name
        : b.recorded < declaration.minOutcomesPerArm
          ? b.name
          : null,
  };

  const bare = (reason: NotSeparableReason): ExperimentResult => ({
    a,
    b,
    separation: 'not-separable',
    notSeparable: reason,
    difference: null,
    outcomesNeededPerArm: null,
    stopping,
    marginal: null,
  });

  if (a.rate === null || b.rate === null || a.interval === null || b.interval === null) {
    return bare('nothing-recorded');
  }

  /**
   * Newcombe's interval on the difference, built from the two Wilson
   * intervals rather than from a normal approximation to the difference.
   *
   * The naive interval is symmetric and can run past 0 or 1, which at the
   * sample sizes a real experiment starts with is not an edge case — it is
   * most of the first week.
   */
  const point = a.rate - b.rate;
  const low = point - Math.sqrt((a.rate - a.interval.low) ** 2 + (b.interval.high - b.rate) ** 2);
  const high = point + Math.sqrt((a.interval.high - a.rate) ** 2 + (b.rate - b.interval.low) ** 2);
  const difference = { point, low, high };

  /**
   * How many outcomes per arm would separate the difference *observed so far*.
   *
   * A standard two-proportion power calculation at 95% confidence and 80%
   * power. It is an estimate about a difference that may itself be noise, and
   * it is offered as "how much longer" rather than as a promise — but a number
   * somebody can act on beats "not significant", which tells a reader nothing
   * about whether to wait a day or abandon the idea.
   */
  const spread = Math.abs(point);
  const outcomesNeededPerArm =
    spread === 0
      ? null
      : Math.ceil(
          (((Z_95 + Z_POWER_80) ** 2) * (a.rate * (1 - a.rate) + b.rate * (1 - b.rate))) /
            (spread * spread),
        );

  const perCallA = arms.a.tally.parsed > 0 ? arms.a.totalUsd / arms.a.tally.parsed : 0;
  const perCallB = arms.b.tally.parsed > 0 ? arms.b.totalUsd / arms.b.tally.parsed : 0;
  const better = a.rate >= b.rate ? a : b;
  const worse = better === a ? b : a;
  const betterPerCall = better === a ? perCallA : perCallB;
  const worsePerCall = better === a ? perCallB : perCallA;
  const rateGap = (better.rate as number) - (worse.rate as number);

  const marginal: Marginal = {
    /**
     * Per call on both sides, so arms that took different shares of the
     * traffic compare. Dividing raw totals would report a marginal cost that
     * moves when the split changes and the behaviour does not.
     */
    usdPerExtraSuccess:
      betterPerCall > worsePerCall && rateGap > 0
        ? (betterPerCall - worsePerCall) / rateGap
        : null,
    better: better.name,
    dearer: betterPerCall > worsePerCall,
  };

  if (spread === 0) return { ...bare('no-difference-observed'), difference, marginal };
  if (low <= 0 && high >= 0) {
    return { ...bare('interval-includes-zero'), difference, outcomesNeededPerArm, marginal };
  }

  return {
    a,
    b,
    separation: point > 0 ? 'a-wins' : 'b-wins',
    notSeparable: null,
    difference,
    outcomesNeededPerArm,
    stopping,
    marginal,
  };
}
