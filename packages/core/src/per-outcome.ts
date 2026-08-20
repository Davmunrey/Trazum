/**
 * Dollars per outcome — and the three ways this refuses to state one.
 *
 * 1.50.4 recorded the numerator. This divides by it, which sounds like
 * arithmetic and is almost entirely a set of decisions about when *not* to do
 * the arithmetic. A cost per resolution is the most quotable number this
 * product will ever print — it ends up in a slide, in a quarterly review, in an
 * argument about whether to keep a feature — and every way of getting it
 * slightly wrong is a way of getting somebody's decision badly wrong.
 *
 * ## Which bill is the numerator
 *
 * The obvious implementation divides the **whole** slice bill by its successes.
 * It is wrong, and wrong in the direction that makes a product look worse than
 * it is: any call that carried no outcome is spend with no chance of appearing
 * in the denominator, so the ratio is inflated by exactly the uninstrumented
 * share — silently, and by an amount nobody can see from the figure.
 *
 * A team that instruments half its traffic would read a cost per resolution
 * twice the real one, conclude the feature is uneconomic, and kill it.
 *
 * So the numerator is **recorded spend only**: the dollars on calls that
 * carried an outcome. That makes it a ratio over a sample, which is fine and
 * only fine because the coverage is stated beside it every single time, and
 * because below a floor it is not stated at all.
 *
 * ## Three refusals
 *
 * 1. **Too few outcomes is not a rate.** Two resolutions and one figure is
 *    noise with a dollar sign. The count is shown instead — the same refusal
 *    `route` makes about small case sets and `history` makes about short runs.
 * 2. **Too little coverage is not a rate.** A slice where an eighth of the
 *    spend carried an outcome yields a ratio over an unknown denominator. The
 *    coverage is shown instead.
 * 3. **No successes recorded is not a rate of infinity.** A slice that spent
 *    money and resolved nothing is a real and alarming measurement, and it is
 *    reported as what it is rather than as a division by zero dressed up.
 *
 * ## Two rankings, and the product prints both
 *
 * Cheapest per call and cheapest per outcome are **different orders**, and the
 * whole reason this chapter exists is that a workload can move up one while
 * moving down the other. Picking one would be this tool making the choice it
 * spent the last release refusing to make. Both are returned; the disagreement
 * between them is itself a finding, and it is named.
 */

import { judgeOutcome } from './outcome.js';
import type { OutcomeTally, OutcomeVocabulary } from './outcome.js';

/**
 * Recorded successes a slice needs before a per-outcome figure is stated.
 *
 * Ten, matching `history`'s `MIN_RUN` reasoning rather than a fresh number: a
 * figure over fewer than ten observations moves more from one more observation
 * than from anything a team could do about it.
 */
export const MIN_OUTCOMES_FOR_RATE = 10;

/**
 * Share of a slice's spend that must carry an outcome before a rate is stated.
 *
 * 0.8, the same floor `watch` uses for a measured day. Below it the figure is a
 * ratio over an unknown denominator, and the gap between what it says and what
 * is true is not bounded by anything the reader can see.
 */
export const MIN_COVERAGE_FOR_RATE = 0.8;

export type WithheldReason =
  | 'too-few-outcomes'
  | 'too-little-coverage'
  | 'no-successes-recorded'
  | 'no-vocabulary'
  | 'nothing-recorded';

export interface PerOutcome {
  /**
   * Dollars per recorded success, over **recorded spend only**, or null.
   *
   * Null is never a zero and never an infinity: `withheld` says which of the
   * five reasons applies, and a caller that prints the figure without reading
   * that field will print nothing rather than something wrong.
   */
  usdPerSuccess: number | null;
  withheld: WithheldReason | null;
  /** Successes counted. Shown in place of the rate when it is withheld. */
  successes: number;
  /** Spend on calls that carried a declared outcome — the numerator. */
  recordedUsd: number;
  /** Everything the slice spent, recorded or not — for the coverage share. */
  totalUsd: number;
  /**
   * Recorded share of the slice's spend, 0-1. Printed beside the rate every
   * time it is printed, because a ratio over a sample presented without its
   * sample size is a claim about the whole.
   */
  coverage: number;
}

export function perOutcome(
  tally: OutcomeTally,
  totalUsd: number,
  vocabulary: OutcomeVocabulary | null,
): PerOutcome {
  const declared = vocabulary ?? { values: [], success: [] };

  let successes = 0;
  let recordedUsd = 0;
  for (const entry of tally.byValue) {
    const verdict = judgeOutcome(entry.value, declared);
    // Undeclared values are in neither the numerator nor the denominator, the
    // same rule the success rate has: a typo in an exporter is a broken
    // exporter, not a result.
    if (verdict === 'undeclared') continue;
    recordedUsd += entry.usd;
    if (verdict === 'success') successes += entry.calls;
  }

  const coverage = totalUsd > 0 ? recordedUsd / totalUsd : 0;
  const base: Omit<PerOutcome, 'usdPerSuccess' | 'withheld'> = {
    successes,
    recordedUsd,
    totalUsd,
    coverage,
  };

  if (vocabulary === null || declared.success.length === 0) {
    return { ...base, usdPerSuccess: null, withheld: 'no-vocabulary' };
  }
  if (tally.recorded === 0) {
    return { ...base, usdPerSuccess: null, withheld: 'nothing-recorded' };
  }
  if (successes === 0) {
    // Money spent and nothing resolved. A real and alarming measurement, and
    // reported as one rather than as a division by zero dressed up as a figure.
    return { ...base, usdPerSuccess: null, withheld: 'no-successes-recorded' };
  }
  if (successes < MIN_OUTCOMES_FOR_RATE) {
    return { ...base, usdPerSuccess: null, withheld: 'too-few-outcomes' };
  }
  if (coverage < MIN_COVERAGE_FOR_RATE) {
    return { ...base, usdPerSuccess: null, withheld: 'too-little-coverage' };
  }
  return { ...base, usdPerSuccess: recordedUsd / successes, withheld: null };
}

export interface RankedSlice {
  key: string;
  calls: number;
  totalUsd: number;
  per: PerOutcome;
  /** Dollars per call — the ranking this product has always been able to make. */
  usdPerCall: number;
}

export interface PerOutcomeRanking {
  /** Dearest per call first. Every slice appears. */
  byCall: RankedSlice[];
  /**
   * Dearest per **outcome** first. Only slices with a stated rate appear —
   * a withheld figure has no position in an order, and giving it one would put
   * a slice somewhere on the strength of a number this module declined to
   * state.
   */
  byOutcome: RankedSlice[];
  /**
   * Slices whose two ranks disagree by more than a place, dearest-per-outcome
   * first.
   *
   * **The finding a total cannot make**: the workload that looks cheap per
   * call and is expensive per resolution, or the reverse. Somebody optimising
   * on the first number has been moving the wrong one, and nothing in this
   * product could tell them until now.
   */
  disagreements: Array<{ slice: RankedSlice; callRank: number; outcomeRank: number }>;
}

export interface SliceInput {
  key: string;
  calls: number;
  totalUsd: number;
  tally: OutcomeTally;
}

export function rankPerOutcome(
  slices: readonly SliceInput[],
  vocabulary: OutcomeVocabulary | null,
): PerOutcomeRanking {
  const ranked: RankedSlice[] = slices.map((slice) => ({
    key: slice.key,
    calls: slice.calls,
    totalUsd: slice.totalUsd,
    per: perOutcome(slice.tally, slice.totalUsd, vocabulary),
    usdPerCall: slice.calls > 0 ? slice.totalUsd / slice.calls : 0,
  }));

  const byCall = [...ranked].sort((a, b) => b.usdPerCall - a.usdPerCall);
  const byOutcome = ranked
    .filter((slice) => slice.per.usdPerSuccess !== null)
    .sort((a, b) => (b.per.usdPerSuccess as number) - (a.per.usdPerSuccess as number));

  const callRankOf = new Map(byCall.map((slice, index) => [slice.key, index]));
  const disagreements: PerOutcomeRanking['disagreements'] = [];
  byOutcome.forEach((slice, outcomeRank) => {
    /**
     * Compared against this slice's position among **the rankable slices
     * only**, not among all of them.
     *
     * Ranking it at position 4 of ten by call and 1 of three by outcome would
     * report a disagreement produced entirely by the two lists having different
     * lengths — an artefact, printed as a finding.
     */
    const callRank = byCall
      .filter((other) => other.per.usdPerSuccess !== null)
      .findIndex((other) => other.key === slice.key);
    /**
     * More than one place — **or** a change at the top.
     *
     * The distance threshold alone misses the sharpest case there is: with two
     * rankable slices a complete reversal is a distance of exactly one, and
     * that is not noise, it is the finding. Whoever is dearest per call and
     * whoever is dearest per resolution are the two names in the conversation,
     * and them being different names is the whole point of computing both.
     */
    const changedAtTheTop = (callRank === 0) !== (outcomeRank === 0);
    if (Math.abs(callRank - outcomeRank) > 1 || changedAtTheTop) {
      disagreements.push({ slice, callRank, outcomeRank });
    }
  });
  // `callRankOf` is kept for callers that want the position among everything;
  // the disagreement test deliberately does not use it, for the reason above.
  void callRankOf;

  return { byCall, byOutcome, disagreements };
}
