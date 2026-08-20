/**
 * What a committed-use deal would have been worth **on the traffic you
 * actually had**.
 *
 * Providers sell committed-use and reserved-capacity contracts, and every team
 * that signs one is doing arithmetic in a spreadsheet against a number they
 * guessed. That is exactly the failure this product exists to end — and it is
 * the highest-stakes instance of it, because the guess is annual and signed.
 *
 * ## An as-if calculation, and the wording never blurs it
 *
 * "On the traffic you actually had, this commitment would have saved $X" is a
 * measurement of the past.
 *
 * "You will save $X" is a claim about the future, and this product has refused
 * that at every scale since 1.27. Nothing here projects, extrapolates, fits a
 * trend or annualises a partial month. Every figure describes months that
 * happened, and the type says so in a field a machine reader can check.
 *
 * ## Both directions, because one direction is the sales pitch
 *
 * A commitment is a **floor** as well as a discount. Below the floor you pay
 * for capacity you did not use, and a saving quoted without that half is not
 * an analysis — it is the vendor's slide.
 *
 * So every month is priced both ways, the months that would have fallen short
 * are counted and named, and what the unused floor would have cost is its own
 * figure rather than netted quietly against the good months.
 *
 * ## The shortfall risk is a count, not a probability
 *
 * "Three of your last twelve months would have fallen short, by $400, $150 and
 * $2,900" is a measurement. "There is a 25% chance of shortfall" is a model of
 * a distribution nobody fitted, presented with the authority of arithmetic.
 * Only the first is available from a log, so only the first is printed.
 */

/** The deal, as the provider states it. */
export interface CommitmentTerms {
  /**
   * What you commit to spending each month, **after** the discount — which is
   * how these contracts are almost always written.
   *
   * If your discounted usage comes in under this, you pay this anyway.
   */
  monthlyFloorUsd: number;
  /** The discount, 0-1. 0.2 is twenty per cent off. */
  discount: number;
  /** How many months the commitment runs. */
  months: number;
}

/** One measured month, as the caller sliced it. */
export interface MeasuredMonth {
  /** `YYYY-MM`. */
  month: string;
  usd: number;
}

export interface MonthReplay {
  month: string;
  /** What was actually paid, with no commitment. */
  listUsd: number;
  /** What the discounted usage would have come to. */
  discountedUsd: number;
  /** What would actually have been paid: the floor, or the discounted usage. */
  paidUsd: number;
  /** Positive means the commitment saved money that month. */
  savingUsd: number;
  /** Whether the floor was the binding number — a month that fell short. */
  shortfall: boolean;
  /** What the unused floor cost, in a month that fell short. Zero otherwise. */
  unusedFloorUsd: number;
}

export type CommitmentUnknown =
  | 'no-history'
  | 'too-few-months'
  | 'partial-months-excluded-everything';

export interface CommitmentReplay {
  /**
   * Always `measured-past`. There is no other value, and the field exists so a
   * machine reader cannot mistake this for a projection — the same reason
   * every other document in this product carries its provenance.
   */
  provenance: 'measured-past';
  months: MonthReplay[];
  /** Summed over the months replayed, positive meaning the deal won. */
  netUsd: number;
  /** What the good months saved, before the shortfalls are taken off. */
  savedInGoodMonthsUsd: number;
  /**
   * What the shortfall months cost, kept as its own figure.
   *
   * Netted against the savings it disappears, and the disappearing is the
   * whole trick a vendor's slide relies on.
   */
  lostToUnusedFloorUsd: number;
  /** How many of the measured months would have fallen short. A count, never a rate. */
  shortfallMonths: number;
  /**
   * The monthly spend at which the commitment stops losing money.
   *
   * Equal to the floor: below it you pay the floor for less usage. Above it
   * the saving grows, first as (spend − floor) and then, once discounted usage
   * clears the floor, as spend × discount.
   */
  breakEvenMonthlyUsd: number;
  /**
   * Measured spread across the months replayed — lowest and highest, and how
   * far the range spans as a share of the median.
   *
   * The honest form of "shortfall risk": a reader looking at a range wider than
   * the floor can see the deal is a bet, without anybody modelling a
   * distribution nobody fitted.
   */
  spread: { lowUsd: number; highUsd: number; medianUsd: number } | null;
  /** Set when nothing could be replayed. A refusal never arrives bare. */
  unknown: CommitmentUnknown | null;
  /** How many whole months would settle it, when there are too few. */
  monthsNeeded: number | null;
}

/**
 * The fewest whole months worth replaying a commitment against.
 *
 * Three. Two months cannot show a shortfall pattern and one cannot show
 * anything at all — and a commitment is signed for a year, so an answer from a
 * single month is a year-long decision made on a fortnight of evidence.
 */
export const MIN_MONTHS_FOR_REPLAY = 3;

export function replayCommitment(
  history: readonly MeasuredMonth[],
  terms: CommitmentTerms,
): CommitmentReplay {
  const bare = (unknown: CommitmentUnknown, have: number): CommitmentReplay => ({
    provenance: 'measured-past',
    months: [],
    netUsd: 0,
    savedInGoodMonthsUsd: 0,
    lostToUnusedFloorUsd: 0,
    shortfallMonths: 0,
    breakEvenMonthlyUsd: terms.monthlyFloorUsd,
    spread: null,
    unknown,
    monthsNeeded: Math.max(0, MIN_MONTHS_FOR_REPLAY - have),
  });

  if (history.length === 0) return bare('no-history', 0);
  if (history.length < MIN_MONTHS_FOR_REPLAY) return bare('too-few-months', history.length);

  const months: MonthReplay[] = history.map((entry) => {
    const discountedUsd = entry.usd * (1 - terms.discount);
    const shortfall = discountedUsd < terms.monthlyFloorUsd;
    const paidUsd = shortfall ? terms.monthlyFloorUsd : discountedUsd;
    return {
      month: entry.month,
      listUsd: entry.usd,
      discountedUsd,
      paidUsd,
      savingUsd: entry.usd - paidUsd,
      shortfall,
      // What the floor bought that nobody used. Its own figure, never netted.
      unusedFloorUsd: shortfall ? terms.monthlyFloorUsd - discountedUsd : 0,
    };
  });

  const sorted = [...history].map((m) => m.usd).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianUsd =
    sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);

  return {
    provenance: 'measured-past',
    months,
    netUsd: months.reduce((sum, m) => sum + m.savingUsd, 0),
    savedInGoodMonthsUsd: months.filter((m) => !m.shortfall).reduce((sum, m) => sum + m.savingUsd, 0),
    lostToUnusedFloorUsd: months.reduce((sum, m) => sum + m.unusedFloorUsd, 0),
    shortfallMonths: months.filter((m) => m.shortfall).length,
    breakEvenMonthlyUsd: terms.monthlyFloorUsd,
    spread: { lowUsd: sorted[0] ?? 0, highUsd: sorted[sorted.length - 1] ?? 0, medianUsd },
    unknown: null,
    monthsNeeded: null,
  };
}

/**
 * Whether the replay covers as long as the commitment runs.
 *
 * Kept separate from the refusals because it does not stop the arithmetic: six
 * months of history against a twelve-month deal is a real answer about six
 * months, and saying so is more useful than refusing. What it must not do is
 * go unsaid — a twelve-month decision read off half a year of evidence, with
 * nothing on the page marking the gap, is the spreadsheet this module was
 * written to replace.
 */
export function coversTheTerm(
  replay: CommitmentReplay,
  terms: CommitmentTerms,
): { covered: number; ofMonths: number; short: boolean } {
  return {
    covered: replay.months.length,
    ofMonths: terms.months,
    short: replay.months.length < terms.months,
  };
}
