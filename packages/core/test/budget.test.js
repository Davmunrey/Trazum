import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, budgetPositions, monthOf } from '../dist/index.js';

/**
 * The live budget.
 *
 * One measured number, and the two things that keep it honest: it never
 * forecasts, and it never reports a period nobody measured as a period under
 * budget. Every case below is really one of those two.
 *
 * Hand figures: Claude Opus 5 at $5/MTok input makes 1,000,000 input tokens
 * exactly $5.00, so a day's record is a round number and a month's arithmetic
 * is checkable without a calculator.
 *
 * Doctrine: [A period, or a service, nobody measured is not one under budget](../../../docs/doctrine.md#a-period-or-a-service-nobody-measured-is-not-one-under-budget)
 */

const JAN = monthOf(new Date('2026-01-15T00:00:00Z'));
const DAY_MS = 86_400_000;

/** One day's worth of measured spend, on day `d` (0-based) of January 2026. */
const record = (d, tokens = 1_000_000, over = {}) => ({
  v: 1,
  provider: 'anthropic',
  fromMs: Date.UTC(2026, 0, 1 + d),
  toMs: Date.UTC(2026, 0, 2 + d),
  model: 'claude-opus-5',
  calls: null,
  input: tokens,
  cacheRead: 0,
  write5m: 0,
  write1h: 0,
  ttlKnown: true,
  output: 0,
  group: {},
  pulledAtMs: Date.UTC(2026, 0, 2 + d),
  ...over,
});

const position = (records, spend, at) =>
  budgetPositions(records, spend, {
    catalogue: BUNDLED_CATALOGUE,
    now: new Date(at),
    period: JAN,
  }).positions[0];

describe('budgetPositions — the measured number', () => {
  it('prices measured records into a position against the limit', () => {
    // Ten days at $5.00 each against a $100 budget.
    const records = Array.from({ length: 10 }, (_, d) => record(d));
    const standing = position(records, { monthlyUsd: 100 }, '2026-01-11T00:00:00Z');
    assert.ok(Math.abs(standing.consumedUsd - 50) < 1e-6, String(standing.consumedUsd));
    assert.ok(Math.abs(standing.remainingUsd - 50) < 1e-6);
    assert.equal(standing.provenance, 'measured');
    assert.equal(standing.verdict, 'within');
  });

  it('is over when it is over, and says so on measurement alone', () => {
    const records = Array.from({ length: 30 }, (_, d) => record(d));
    const standing = position(records, { monthlyUsd: 100 }, '2026-01-31T00:00:00Z');
    assert.equal(standing.verdict, 'over');
    assert.ok(standing.remainingUsd < 0);
  });

  it('apportions a record that straddles the period boundary', () => {
    /**
     * A store record covers a bucket, and a bucket can cross a month. Counting
     * it wholly in or wholly out moves real money between months by up to a
     * day; the overlap is exact arithmetic about the window, not an estimate.
     */
    const straddling = record(0, 1_000_000, {
      fromMs: Date.UTC(2025, 11, 31),
      toMs: Date.UTC(2026, 0, 2),
    });
    const standing = position([straddling], { monthlyUsd: 100 }, '2026-01-05T00:00:00Z');
    // Two days of window, one inside January: half the $5.00.
    assert.ok(Math.abs(standing.consumedUsd - 2.5) < 1e-6, String(standing.consumedUsd));
  });

  it('ignores a record that falls entirely outside the period', () => {
    const december = record(0, 1_000_000, {
      fromMs: Date.UTC(2025, 11, 1),
      toMs: Date.UTC(2025, 11, 2),
    });
    assert.equal(position([december], { monthlyUsd: 100 }, '2026-01-05T00:00:00Z').consumedUsd, 0);
  });
});

describe('budgetPositions — a period nobody measured is not under budget', () => {
  it('cannot tell when nothing in the period was measured', () => {
    // $0 consumed of $100 looks like the healthiest possible budget, and it is
    // the shape of a store that stopped being written to.
    const standing = position([], { monthlyUsd: 100 }, '2026-01-20T00:00:00Z');
    assert.equal(standing.verdict, 'cannot-tell');
    assert.equal(standing.coverage, 'none');
    assert.equal(standing.burn.shape, 'cannot-tell');
  });

  it('names the elapsed days that carry no measurement', () => {
    // Days 1 and 2 measured, then nothing, asked on the 6th: three gaps.
    const standing = position([record(0), record(1)], { monthlyUsd: 100 }, '2026-01-06T00:00:00Z');
    assert.equal(standing.coverage, 'partial');
    assert.equal(standing.measuredDays, 2);
    assert.deepEqual(standing.unmeasuredDays, ['2026-01-03', '2026-01-04', '2026-01-05']);
  });

  it('calls coverage complete only when every elapsed day was measured', () => {
    const records = Array.from({ length: 5 }, (_, d) => record(d));
    const standing = position(records, { monthlyUsd: 100 }, '2026-01-05T12:00:00Z');
    assert.equal(standing.coverage, 'complete');
    assert.deepEqual(standing.unmeasuredDays, []);
  });

  it('does not count a day as measured on the strength of an unpriced model', () => {
    /**
     * The subtle one. An unpriced model contributes no dollars — which is
     * right — and it must contribute no *day* either. Counting the day would
     * report the period as covered by money nobody can see, so the position
     * would stand at complete coverage over a total that is missing whatever
     * that model cost.
     */
    const standing = position(
      [record(0, 1_000_000, { model: 'some-model-nobody-priced' })],
      { monthlyUsd: 100 },
      '2026-01-02T00:00:00Z',
    );
    assert.equal(standing.measuredDays, 0);
    assert.equal(standing.coverage, 'none');
    assert.equal(standing.verdict, 'cannot-tell');
  });
});

describe('budgetPositions — the burn is a shape, never a date', () => {
  it('compares two shares that have both already happened', () => {
    // Half the month gone, half the budget gone.
    const records = Array.from({ length: 15 }, (_, d) => record(d, 1_000_000));
    const standing = position(records, { monthlyUsd: 150 }, '2026-01-15T12:00:00Z');
    assert.ok(Math.abs(standing.burn.consumedShare - 0.5) < 0.01);
    assert.equal(standing.coverage, 'complete');
    assert.ok(Math.abs(standing.burn.elapsedShare - 0.468) < 0.01);
    assert.equal(standing.burn.shape, 'on-pace');
  });

  it('names money going faster than the calendar', () => {
    const records = Array.from({ length: 10 }, (_, d) => record(d, 4_000_000));
    const standing = position(records, { monthlyUsd: 250 }, '2026-01-11T00:00:00Z');
    assert.equal(standing.burn.shape, 'ahead');
  });

  it('names money going slower, but only when every elapsed day was measured', () => {
    const measured = Array.from({ length: 19 }, (_, d) => record(d));
    assert.equal(position(measured, { monthlyUsd: 10_000 }, '2026-01-20T00:00:00Z').burn.shape, 'behind');
  });

  it('a floor can prove ahead and can never prove behind', () => {
    /**
     * Partial coverage means the consumed figure is a floor: the unmeasured
     * days spent something and nobody knows how much. A comfortable-looking
     * floor proves nothing, and reporting it as `behind` would turn missing
     * measurement into good news.
     *
     * The first version did exactly that — `behind` on three measured days out
     * of twenty, printed under a warning that the figure was a floor. Two
     * sentences contradicting each other, and the reassuring one came second.
     */
    const floor = position([record(0)], { monthlyUsd: 10_000 }, '2026-01-20T00:00:00Z');
    assert.equal(floor.coverage, 'partial');
    assert.equal(floor.burn.shape, 'cannot-tell');

    // Already past the calendar on the days that *were* measured: the real
    // figure can only be higher, so `ahead` is unarguable.
    const overrun = position([record(0, 40_000_000)], { monthlyUsd: 100 }, '2026-01-20T00:00:00Z');
    assert.equal(overrun.coverage, 'partial');
    assert.equal(overrun.burn.shape, 'ahead');
  });

  it('tolerates a rounding-width drift rather than reporting it', () => {
    // A budget tracking the calendar to within a rounding error must not be
    // reported as drifting every time somebody looks at it.
    const records = Array.from({ length: 10 }, (_, d) => record(d));
    const standing = position(records, { monthlyUsd: 155 }, '2026-01-10T12:00:00Z');
    assert.equal(standing.coverage, 'complete');
    assert.equal(standing.burn.shape, 'on-pace');
  });

  it('carries no field naming a date the budget runs out', () => {
    /**
     * The single most requested number this module will ever be asked for,
     * and the one it cannot honestly produce: it is a projection from a rate
     * the log has no reason to keep. Asserted structurally so adding one is a
     * test failure rather than a code review somebody skips.
     */
    const standing = position([record(0)], { monthlyUsd: 100 }, '2026-01-05T00:00:00Z');
    assert.deepEqual(Object.keys(standing.burn).sort(), ['consumedShare', 'elapsedShare', 'shape']);
    const serialised = JSON.stringify(standing);
    assert.doesNotMatch(serialised, /forecast|runsOut|willExhaust|project/i);
  });

  it('has no consumed share against a zero limit, rather than infinity', () => {
    const standing = position([record(0)], { monthlyUsd: 0 }, '2026-01-05T00:00:00Z');
    assert.equal(standing.burn.consumedShare, null);
    assert.equal(standing.burn.shape, 'cannot-tell');
  });
});

describe('budgetPositions — scopes the store cannot answer for', () => {
  it('reports a per-label budget as unmeasured rather than inventing a position', () => {
    /**
     * A store record carries a provider, a model and the account's own
     * grouping. It does not carry a workload label — labels live in a
     * per-call usage log, which a bucketed provider API does not serve.
     * Reporting a per-label position from records that cannot distinguish
     * labels would be a figure assembled from the wrong denominator.
     */
    const report = budgetPositions([record(0)], { byLabel: { 'support-rag': 50 } }, {
      catalogue: BUNDLED_CATALOGUE,
      now: new Date('2026-01-05T00:00:00Z'),
      period: JAN,
    });
    assert.deepEqual(report.positions, []);
    assert.deepEqual(report.unmeasuredScopes, [{ kind: 'label', label: 'support-rag' }]);
  });

  it('does the same for a per-source budget', () => {
    const report = budgetPositions([], { bySource: { checkout: 200 } }, {
      catalogue: BUNDLED_CATALOGUE,
      now: new Date('2026-01-05T00:00:00Z'),
      period: JAN,
    });
    assert.deepEqual(report.unmeasuredScopes, [{ kind: 'source', source: 'checkout' }]);
  });

  it('reports nothing at all when no budget is configured', () => {
    // No budget is not a budget of zero, and not a budget met.
    const report = budgetPositions([record(0)], undefined, {
      catalogue: BUNDLED_CATALOGUE,
      now: new Date('2026-01-05T00:00:00Z'),
      period: JAN,
    });
    assert.deepEqual(report.positions, []);
    assert.deepEqual(report.unmeasuredScopes, []);
  });
});

describe('monthOf', () => {
  it('is UTC and half-open, like every window in this product', () => {
    const period = monthOf(new Date('2026-02-14T12:00:00Z'));
    assert.equal(period.id, '2026-02');
    assert.equal(period.fromMs, Date.UTC(2026, 1, 1));
    assert.equal(period.toMs, Date.UTC(2026, 2, 1));
    assert.equal(period.days, 28);
  });

  it('counts a long month as long and a leap February as twenty-nine', () => {
    assert.equal(monthOf(new Date('2026-01-01T00:00:00Z')).days, 31);
    assert.equal(monthOf(new Date('2028-02-01T00:00:00Z')).days, 29);
  });

  it('puts the last instant of a month inside that month', () => {
    // The boundary that goes wrong when somebody reaches for a 30-day window.
    const period = monthOf(new Date(Date.UTC(2026, 0, 31, 23, 59, 59, 999)));
    assert.equal(period.id, '2026-01');
    assert.equal(monthOf(new Date(Date.UTC(2026, 1, 1))).id, '2026-02');
    assert.equal(period.toMs - period.fromMs, 31 * DAY_MS);
  });
});
