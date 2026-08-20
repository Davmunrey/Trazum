/**
 * The year, assembled from what was already written down.
 *
 * The last chapter of the arc, and the one that turns this product's argument
 * into something a stranger can audit. Everything below comes from the store
 * and the plans a team already keeps: **no new data, and nothing computed that
 * could not be checked against a document that already exists.**
 *
 * That constraint is the whole design. An annual report is the document most
 * likely to be quoted out of the room it was written in, and the one nobody
 * goes back to verify. So it may not contain a single figure that this tool
 * would refuse to print anywhere else — which means it is mostly a summing
 * exercise with a great many refusals attached.
 *
 * ## Four questions, and the fourth is the one that matters
 *
 * What was spent. What was planned. What arrived. **And what could not be
 * told** — which in a normal annual report is silently folded into one of the
 * other three, almost always into the flattering one.
 *
 * `verify` has kept those three outcomes apart since 1.39. A year is where the
 * temptation to collapse them is strongest, because "eleven of fourteen
 * actions arrived" reads better than "eleven arrived, one did not, and two
 * could not be judged" — and the second sentence is the one that tells
 * somebody their measurement has a hole in it.
 *
 * ## It reports the record, not the team
 *
 * No per-person anything, no velocity, no ranking of who planned well. The
 * doctrine rule from 1.44, and it matters most here: an annual document is
 * exactly where a cost tool starts being used for performance review, and the
 * way to not be is to hold no data that could be.
 */

import type { PlanDocument } from './plan.js';
import type { PlanVerification } from './verify.js';
import type { OutcomeReport } from './outcome.js';

/** One period the year is built from, as the caller sliced it. */
export interface AnnualPeriod {
  /** `YYYY-MM`. */
  month: string;
  usd: number;
  calls: number;
  /** The plan made for this period, when one was. */
  plan?: PlanDocument;
  /** The verification of the previous plan, when one was run. */
  verification?: PlanVerification;
  /** Outcomes recorded in this period, when any were. */
  outcomes?: OutcomeReport;
}

export interface AnnualRecord {
  schemaVersion: 1;
  year: string;
  /** Months present, oldest first. Gaps are named rather than interpolated. */
  months: Array<{ month: string; usd: number; calls: number }>;
  /**
   * Months of the year with no record at all.
   *
   * Named, never filled. A year report that quietly covers nine months and
   * prints an annual total is wrong by a quarter and says nothing about it.
   */
  missingMonths: string[];
  totalUsd: number;
  totalCalls: number;
  /**
   * What was planned and what became of it — three outcomes, never two.
   *
   * `cannotTell` is the field an ordinary annual report does not have, and its
   * absence is how a year of unmeasurable promises turns into a year of kept
   * ones.
   */
  promises: {
    planned: number;
    arrived: number;
    notArrived: number;
    cannotTell: number;
    /**
     * Dollars the plans projected, summed.
     *
     * **There is deliberately no `arrivedUsd` beside it**, and the reason is
     * worth the paragraph: a verification says whether each action *arrived*,
     * and its `observed` map carries where the money sits now — but the
     * document has never carried a per-action figure for the saving that
     * actually landed. Summing one out of the observations would mean deciding
     * which of several numbers per action is "the saving", which is a
     * judgement the verification refused to make and this module has no
     * standing to make on its behalf.
     *
     * So the year says what was promised and how many promises were kept, and
     * says plainly that it cannot put a dollar figure on the kept ones. The
     * alternative — a plausible number assembled here — is precisely the
     * annual-report arithmetic this document exists to replace.
     */
    projectedUsd: number;
  };
  /**
   * The year's outcome coverage, or null when nothing recorded one.
   *
   * Null rather than a rate of zero, for the reason it has been null
   * everywhere since 1.50.4: an uninstrumented year and a failing year are
   * different sentences.
   */
  outcomes: {
    recorded: number;
    parsed: number;
    /** Share of the year's spend that carried no outcome. */
    unrecordedUsd: number;
  } | null;
  /**
   * Everything this record cannot say, named.
   *
   * The section an annual report is usually missing, and the reason this one
   * is worth trusting: a document that lists its own blind spots is a document
   * somebody can act on the rest of.
   */
  cannotSay: string[];
}

/**
 * The twelve months of a year, so a gap is a fact rather than an absence.
 */
function monthsOf(year: string): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
}

export function annualRecord(year: string, periods: readonly AnnualPeriod[]): AnnualRecord {
  const inYear = [...periods]
    .filter((p) => p.month.startsWith(`${year}-`))
    .sort((a, b) => a.month.localeCompare(b.month));

  const present = new Set(inYear.map((p) => p.month));
  const missingMonths = monthsOf(year).filter((m) => !present.has(m));

  let planned = 0;
  let arrived = 0;
  let notArrived = 0;
  let cannotTell = 0;
  let projectedUsd = 0;

  for (const period of inYear) {
    if (period.plan !== undefined) {
      planned += period.plan.actions.length;
      projectedUsd += period.plan.projectedSavingUsd;
    }
    if (period.verification !== undefined) {
      arrived += period.verification.arrived;
      notArrived += period.verification.notArrived;
      cannotTell += period.verification.cannotTell;
    }
  }

  const withOutcomes = inYear.filter((p) => p.outcomes !== undefined);
  const outcomes =
    withOutcomes.length === 0
      ? null
      : {
          recorded: withOutcomes.reduce((sum, p) => sum + (p.outcomes?.coverage.recorded ?? 0), 0),
          parsed: withOutcomes.reduce((sum, p) => sum + (p.outcomes?.coverage.parsed ?? 0), 0),
          unrecordedUsd: withOutcomes.reduce(
            (sum, p) => sum + (p.outcomes?.coverage.unrecordedUsd ?? 0),
            0,
          ),
        };

  const cannotSay: string[] = [];
  if (missingMonths.length > 0) cannotSay.push('months-missing');
  if (planned === 0) cannotSay.push('nothing-was-planned');
  else if (arrived + notArrived + cannotTell === 0) cannotSay.push('nothing-was-verified');
  if (cannotTell > 0) cannotSay.push('some-promises-unjudgeable');
  /**
   * Named every time there is anything to verify, because it is a permanent
   * limit of the record rather than a gap in this particular year.
   */
  if (arrived > 0) cannotSay.push('arrived-savings-not-quantified');
  if (outcomes === null) cannotSay.push('no-outcomes-recorded');
  else if (outcomes.recorded < outcomes.parsed) cannotSay.push('outcome-coverage-partial');

  return {
    schemaVersion: 1,
    year,
    months: inYear.map((p) => ({ month: p.month, usd: p.usd, calls: p.calls })),
    missingMonths,
    totalUsd: inYear.reduce((sum, p) => sum + p.usd, 0),
    totalCalls: inYear.reduce((sum, p) => sum + p.calls, 0),
    promises: { planned, arrived, notArrived, cannotTell, projectedUsd },
    outcomes,
    cannotSay,
  };
}
