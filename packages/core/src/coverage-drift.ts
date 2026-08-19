/**
 * What the comparison cannot see: a field one log measured and the other did
 * not.
 *
 * `--against` names the dollars that moved. It cannot name the findings that
 * *stopped being measurable*, and those look identical to good news. A log
 * where `session` was on 98% of calls and is now on 4% has not fixed its
 * conversation growth; it has stopped recording the field that would show it,
 * and every session-shaped finding in this report is now silent for a reason
 * that has nothing to do with the bill.
 *
 * The distinction this module exists to keep: **a finding that vanished
 * because it was fixed and a finding that vanished because the log went blind
 * are opposite facts.** Nothing else in the comparison can tell them apart —
 * the dollars are the same either way. Coverage can, and only coverage can.
 *
 * Shares, not counts: two logs of different lengths cannot be compared by how
 * many records carried a field. A log twice the size with the same share
 * measured exactly as well.
 */

import type { FieldCoverage } from './usage.js';

/** The fields a comparison can go blind on, with what each one unlocks. */
export const COVERAGE_FIELDS = ['label', 'session', 'ts', 'stopReason'] as const;

export type CoverageField = (typeof COVERAGE_FIELDS)[number];

export interface CoverageDrift {
  field: CoverageField;
  /** Share of parsed records carrying it in the previous log, 0–1. */
  was: number;
  /** Share in this log, 0–1. */
  now: number;
  /** `now - was`. Negative means the log went blinder. */
  delta: number;
}

/**
 * The threshold, stated here and repeated in every rendering's copy.
 *
 * A fifth of the records is enough to change which findings appear at all —
 * `sessionCosts` needs five conversations, `modelMixDrift` needs four dated
 * days — while smaller wobbles are the ordinary variation of a week's traffic
 * and reporting them would teach a reader to skip the section.
 */
export const COVERAGE_DRIFT_MIN = 0.2;

/**
 * Slack on the comparison, because the threshold is a number a reader checks
 * by hand. 100% against 80% is exactly a fifth and subtracts to
 * 0.19999999999999996 in binary floating point — dropping that row would make
 * the stated threshold a lie in the one case somebody is most likely to test
 * it with. Small enough that nothing else reaches it: the shares are ratios of
 * integer counts.
 */
const DRIFT_EPSILON = 1e-9;

/**
 * Fields whose coverage moved by at least `minDelta`, biggest move first.
 *
 * Both directions are reported. A field that *appeared* matters too: findings
 * this report can make that the previous one could not are not a regression
 * in the bill, and a reader comparing two reports needs to know the second one
 * was simply able to see more.
 *
 * A log with no parsed records has no shares — an empty array, never zeroes,
 * because "0% carried a session" and "there was nothing to carry one" are the
 * distinction this whole file is about.
 */
export function coverageDrift(
  previous: FieldCoverage,
  current: FieldCoverage,
  options: { minDelta?: number } = {},
): CoverageDrift[] {
  const { minDelta = COVERAGE_DRIFT_MIN } = options;
  if (previous.parsed === 0 || current.parsed === 0) return [];

  return COVERAGE_FIELDS.map((field) => {
    const was = previous[field] / previous.parsed;
    const now = current[field] / current.parsed;
    return { field, was, now, delta: now - was };
  })
    .filter((row) => Math.abs(row.delta) >= minDelta - DRIFT_EPSILON)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
