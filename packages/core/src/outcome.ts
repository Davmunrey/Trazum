/**
 * The counterpart every figure in this product has been missing.
 *
 * Everything Trazum reports is a cost. It can say a workload got forty per cent
 * cheaper and cannot say whether it stopped working — a denominator with no
 * numerator, since the beginning. The missing field is not something this tool
 * can compute. It is something only the caller knows.
 *
 * ## Recorded, never inferred
 *
 * The whole module rests on one refusal. **No absence of complaint counts as
 * success. No short conversation counts as resolution. No retry counts as
 * failure on its own.** Every one of those is a plausible-looking heuristic
 * that would turn a guess into a metric, and a metric somebody would then
 * optimise against — which is how a tool ends up rewarding conversations that
 * end early because the user gave up.
 *
 * Where nothing was recorded, the report says so and names what recording one
 * would unlock. That is the `fieldCoverage` discipline from 1.19, applied to
 * the question that matters most.
 *
 * ## The vocabulary is declared, not guessed
 *
 * `resolved`, `escalated`, `deflected`, `abandoned`, `thumbs-down` — every
 * product has its own words, and **which of them count as success is a product
 * judgement this tool has no standing to make**. A tool that decided
 * `escalated` was a failure would be wrong at every company where escalation is
 * the correct, designed outcome for a whole class of request.
 *
 * So the config names the values and names which are successes. An outcome in
 * the log that the config never declared is **named as undeclared**, not
 * quietly bucketed into one side or the other — a typo in an exporter should
 * show up as a typo, not as a shift in the success rate.
 *
 * ## The privacy line does not move
 *
 * An outcome is a small enumerated value. The store keeps it the way it has
 * kept everything since 1.42: aggregated, never alongside content.
 */

/** What the config declares. Both halves are required; see the module note. */
export interface OutcomeVocabulary {
  /** Every value this product records. Anything else in a log is undeclared. */
  values: string[];
  /**
   * Which of them count as success.
   *
   * A subset of `values`, and it may be empty — a vocabulary that records only
   * failures is a legitimate thing to declare, and it still gives a rate this
   * tool can report against a cost.
   */
  success: string[];
}

export type OutcomeVerdict = 'success' | 'other' | 'undeclared';

/**
 * How a single recorded value is judged. Three outcomes, never two.
 *
 * `other` is a declared value that is not a success. `undeclared` is a value
 * nobody wrote down — which is a data-quality finding and not a result, and is
 * reported as one.
 */
export function judgeOutcome(value: string | null, vocabulary: OutcomeVocabulary): OutcomeVerdict | null {
  if (value === null) return null;
  if (!vocabulary.values.includes(value)) return 'undeclared';
  return vocabulary.success.includes(value) ? 'success' : 'other';
}

/** One value, and what it cost. */
export interface OutcomeSlice {
  value: string;
  verdict: OutcomeVerdict;
  calls: number;
  usd: number;
}

export interface OutcomeCoverage {
  /** Records that carried an outcome at all. */
  recorded: number;
  /** Every record that parsed — the denominator. */
  parsed: number;
  /**
   * Spend on calls that carried no outcome.
   *
   * The figure that decides whether a success rate means anything. A rate
   * computed over eight per cent of the bill is a rate about eight per cent of
   * the bill, and printing it beside the total without this number is how a
   * sample becomes a claim about the whole.
   */
  unrecordedUsd: number;
}

export interface OutcomeReport {
  /** Per recorded value, dearest first. Empty when nothing was recorded. */
  slices: OutcomeSlice[];
  coverage: OutcomeCoverage;
  /**
   * Values found in the log that the config never declared, with what they
   * cost. Named rather than bucketed: a typo in an exporter should surface as
   * a typo and not as a shift in the success rate.
   */
  undeclared: OutcomeSlice[];
  /**
   * The success rate **by spend**, or null when it cannot honestly be stated.
   *
   * By spend rather than by call, because this product's whole subject is
   * money: a success rate weighted by call count says one thing while the
   * expensive half of the traffic fails, and the two figures diverge exactly
   * when it matters.
   *
   * Null has one meaning and it is not zero: nothing was recorded. A rate of
   * zero is a real, terrible measurement, and a tool that spells "nobody told
   * me" the same way has destroyed the difference between them.
   */
  successShareOfRecordedUsd: number | null;
  /**
   * Why there is no rate, when there is none. A refusal never arrives bare.
   */
  noRate: 'nothing-recorded' | 'no-success-values-declared' | null;
}

/**
 * What was recorded, before anybody judged it.
 *
 * Deliberately split from the report: `profileUsage` produces this while it
 * reads a log, knowing nothing about which values mean success, and the
 * judgement happens where the config is. Measurement and product judgement are
 * different jobs and this is the seam between them.
 *
 * It is also an **aggregate**, never a list of records — the same shape the
 * store has kept since 1.42. Counting outcomes never means keeping calls.
 */
export interface OutcomeTally {
  /** Per recorded value: how many calls carried it and what they cost. */
  byValue: Array<{ value: string; calls: number; usd: number }>;
  recorded: number;
  parsed: number;
  unrecordedUsd: number;
}

export function outcomeReport(
  tally: OutcomeTally,
  vocabulary: OutcomeVocabulary | null,
): OutcomeReport {
  const coverage: OutcomeCoverage = {
    recorded: tally.recorded,
    parsed: tally.parsed,
    unrecordedUsd: tally.unrecordedUsd,
  };

  /**
   * With no vocabulary declared, every recorded value is `undeclared`.
   *
   * That is the honest reading rather than an inconvenience: somebody has been
   * writing outcomes into a log the config never described, so this tool knows
   * what happened and not what any of it means. It reports the values and their
   * cost, and declines the rate.
   */
  const declared = vocabulary ?? { values: [], success: [] };

  const all: OutcomeSlice[] = [...tally.byValue]
    .map((entry) => ({
      value: entry.value,
      verdict: judgeOutcome(entry.value, declared) as OutcomeVerdict,
      calls: entry.calls,
      usd: entry.usd,
    }))
    .sort((a, b) => b.usd - a.usd);

  const slices = all.filter((slice) => slice.verdict !== 'undeclared');
  const undeclared = all.filter((slice) => slice.verdict === 'undeclared');

  /**
   * The rate's denominator is **declared, recorded spend** — not the whole
   * bill, and not every recorded value.
   *
   * Undeclared values are left out of both halves rather than counted as
   * failures. A misspelled `resolvd` is a broken exporter, and folding it into
   * the failure side would report a product regression that never happened —
   * the direction that gets somebody paged at four in the morning.
   */
  const declaredUsd = slices.reduce((sum, slice) => sum + slice.usd, 0);
  const successUsd = slices
    .filter((slice) => slice.verdict === 'success')
    .reduce((sum, slice) => sum + slice.usd, 0);

  let successShareOfRecordedUsd: number | null = null;
  let noRate: OutcomeReport['noRate'] = null;
  if (declared.success.length === 0) {
    noRate = 'no-success-values-declared';
  } else if (declaredUsd <= 0) {
    noRate = 'nothing-recorded';
  } else {
    successShareOfRecordedUsd = successUsd / declaredUsd;
  }

  return { slices, coverage, undeclared, successShareOfRecordedUsd, noRate };
}

/**
 * What recording an outcome would unlock, for a report that has none.
 *
 * Named rather than implied. "No outcome recorded" on its own reads as a
 * missing feature; the point is that one small enumerated field turns every
 * cost figure in this product into a cost *per* something.
 */
export const OUTCOME_UNLOCKS = [
  'cost-per-outcome',
  'success-rate-by-spend',
  'cheaper-and-still-working',
] as const;

export type OutcomeUnlock = (typeof OUTCOME_UNLOCKS)[number];
