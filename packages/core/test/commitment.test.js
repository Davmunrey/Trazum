import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MIN_MONTHS_FOR_REPLAY,
  coversTheTerm,
  formatSignedUsd,
  replayCommitment,
} from '../dist/index.js';

/**
 * What a committed-use deal would have been worth on measured traffic.
 *
 * The tests that matter are the ones about the *second* direction. A
 * commitment is a floor as well as a discount, and a saving quoted without the
 * months that fell short is not an analysis — it is the vendor's slide.
 */

const TERMS = { monthlyFloorUsd: 1000, discount: 0.2, months: 12 };
const month = (name, usd) => ({ month: name, usd });

describe('both directions are priced', () => {
  it('saves the discount in a month that clears the floor', () => {
    // $2,000 at 20% off is $1,600, comfortably over the $1,000 floor, so the
    // saving is the discount: $400.
    const result = replayCommitment(
      [month('2026-01', 2000), month('2026-02', 2000), month('2026-03', 2000)],
      TERMS,
    );
    assert.equal(result.shortfallMonths, 0);
    assert.ok(Math.abs(result.netUsd - 1200) < 1e-9);
  });

  it('loses money in a month that falls short, and says by how much', () => {
    /**
     * $500 of usage: discounted it is $400, under the $1,000 floor, so the
     * floor is paid. That is $500 worse than paying list, and $600 of floor
     * nobody used.
     */
    const result = replayCommitment(
      [month('2026-01', 500), month('2026-02', 500), month('2026-03', 500)],
      TERMS,
    );
    assert.equal(result.shortfallMonths, 3);
    assert.ok(Math.abs(result.netUsd + 1500) < 1e-9, 'the deal cost $1,500');
    assert.ok(Math.abs(result.lostToUnusedFloorUsd - 1800) < 1e-9);
  });

  it('keeps the unused floor as its own figure, never netted away', () => {
    /**
     * The disappearing is the whole trick a vendor's slide relies on. Two good
     * months and one bad one net out to something positive, and the bad month
     * has to stay visible inside it.
     */
    const result = replayCommitment(
      [month('2026-01', 5000), month('2026-02', 5000), month('2026-03', 200)],
      TERMS,
    );
    assert.ok(result.netUsd > 0, 'the deal wins overall');
    assert.equal(result.shortfallMonths, 1);
    assert.ok(result.lostToUnusedFloorUsd > 0, 'and the bad month is still on the page');
    assert.ok(result.savedInGoodMonthsUsd > result.netUsd, 'the gap is what the shortfall cost');
  });

  it('names which months fell short, not just how many', () => {
    const result = replayCommitment(
      [month('2026-01', 5000), month('2026-02', 200), month('2026-03', 5000)],
      TERMS,
    );
    assert.deepEqual(
      result.months.filter((m) => m.shortfall).map((m) => m.month),
      ['2026-02'],
    );
  });

  it('prices the band between the floor and full utilisation', () => {
    // $1,100 discounted is $880, under the floor. Paid $1,000 against a $1,100
    // list price: a $100 saving, smaller than the discount would suggest.
    const result = replayCommitment(
      [month('2026-01', 1100), month('2026-02', 1100), month('2026-03', 1100)],
      TERMS,
    );
    assert.equal(result.shortfallMonths, 3);
    assert.ok(Math.abs(result.netUsd - 300) < 1e-9, 'still positive, and not 20%');
  });
});

describe('it is an as-if calculation and says so', () => {
  it('carries measured-past provenance, always', () => {
    const result = replayCommitment([month('2026-01', 2000), month('2026-02', 2000), month('2026-03', 2000)], TERMS);
    assert.equal(result.provenance, 'measured-past');
  });

  it('states the shortfall as a count of real months, never a probability', () => {
    /**
     * "Three of your last twelve months would have fallen short" is a
     * measurement. "There is a 25% chance of shortfall" is a model of a
     * distribution nobody fitted, wearing the authority of arithmetic. Only
     * the first is available from a log.
     */
    const result = replayCommitment(
      [month('2026-01', 5000), month('2026-02', 200), month('2026-03', 5000), month('2026-04', 100)],
      TERMS,
    );
    assert.equal(result.shortfallMonths, 2);
    assert.equal(typeof result.shortfallMonths, 'number');
    assert.equal(result.shortfallRate, undefined, 'no rate is offered');
    assert.equal(result.probability, undefined);
  });

  it('shows the measured spread rather than a projection', () => {
    const result = replayCommitment(
      [month('2026-01', 100), month('2026-02', 5000), month('2026-03', 1000)],
      TERMS,
    );
    assert.deepEqual(result.spread, { lowUsd: 100, highUsd: 5000, medianUsd: 1000 });
    assert.equal(result.forecast, undefined);
    assert.equal(result.projected, undefined);
  });
});

describe('the refusals', () => {
  it('will not replay fewer than three months, and says how many more', () => {
    // A commitment is signed for a year. An answer from a single month is a
    // year-long decision made on a fortnight of evidence.
    const result = replayCommitment([month('2026-01', 2000)], TERMS);
    assert.equal(result.unknown, 'too-few-months');
    assert.equal(result.monthsNeeded, MIN_MONTHS_FOR_REPLAY - 1);
    assert.deepEqual(result.months, []);
  });

  it('separates no history from too little', () => {
    assert.equal(replayCommitment([], TERMS).unknown, 'no-history');
    assert.equal(replayCommitment([month('2026-01', 1)], TERMS).unknown, 'too-few-months');
  });

  it('still states the break-even, because it does not need history', () => {
    // The floor is a fact about the deal rather than about the traffic, so it
    // is available even when nothing can be replayed against it.
    const result = replayCommitment([], TERMS);
    assert.equal(result.breakEvenMonthlyUsd, 1000);
  });
});

describe('coverage of the term is said, not enforced', () => {
  it('answers a shorter history without refusing it', () => {
    /**
     * Six months against a twelve-month deal is a real answer about six
     * months. What it must not do is go unsaid — a twelve-month decision read
     * off half a year, with nothing marking the gap, is the spreadsheet this
     * module replaces.
     */
    const history = Array.from({ length: 6 }, (_, i) => month(`2026-0${i + 1}`, 3000));
    const replay = replayCommitment(history, TERMS);
    assert.equal(replay.unknown, null);
    assert.deepEqual(coversTheTerm(replay, TERMS), { covered: 6, ofMonths: 12, short: true });
  });

  it('says so when the history covers the whole term', () => {
    const history = Array.from({ length: 12 }, (_, i) => month(`2026-${String(i + 1).padStart(2, '0')}`, 3000));
    const replay = replayCommitment(history, TERMS);
    assert.equal(coversTheTerm(replay, TERMS).short, false);
  });
});

describe('the money in this table is formatted as one currency', () => {
  it('picks the thousands format on the rounded value, not the raw one', async () => {
    /**
     * Found by looking at a real commitment table, where a saving of exactly
     * a thousand dollars rendered as `$1000.00` beside `$5,000` — the same
     * magnitude in two different formats, one of which the thousands branch
     * would never produce.
     *
     * Floating point puts values there routinely: `5000 - 5000 * 0.8` is
     * `999.9999999999999`, which is under a thousand to a comparison and a
     * thousand to a reader.
     */
    const { formatUsd, formatSignedUsd } = await import('../dist/index.js');
    assert.equal(formatUsd(5000 - 5000 * 0.8), '$1,000');
    assert.equal(formatUsd(999.998), '$1,000');
    // And the boundary below it is untouched.
    assert.equal(formatUsd(999.4), '$999.40');
  });

  it('signs a saving that can go either way', () => {
    // `formatUsd` renders a negative as `$-2,400`, which reads as a typo. In a
    // column where every row can go either way the sign carries the whole
    // meaning, so it belongs where a reader expects it.
    assert.equal(formatSignedUsd(-2400), '-$2,400');
    assert.equal(formatSignedUsd(800), '+$800.00');
  });
});
