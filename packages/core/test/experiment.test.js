import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runExperiment } from '../dist/index.js';

/**
 * Two arms on real traffic.
 *
 * Every test here is about a way an A/B report lies. Two arms always produce
 * two numbers and one of them is always larger; naming a winner from that is a
 * coin flip with a dashboard.
 */

const VOCAB = { values: ['resolved', 'escalated'], success: ['resolved'] };

/** An arm with `successes` of `n` resolved, at `usdPerCall`. */
const arm = (name, successes, n, usdPerCall = 1) => ({
  name,
  totalUsd: n * usdPerCall,
  tally: {
    byValue: [
      ...(successes > 0
        ? [{ value: 'resolved', calls: successes, usd: successes * usdPerCall }]
        : []),
      ...(n - successes > 0
        ? [{ value: 'escalated', calls: n - successes, usd: (n - successes) * usdPerCall }]
        : []),
    ],
    recorded: n,
    parsed: n,
    unrecordedUsd: 0,
  },
});

const run = (a, b, minOutcomesPerArm = 100) =>
  runExperiment({ arms: [a.name, b.name], minOutcomesPerArm }, { a, b }, VOCAB);

describe('a winner only when there is one', () => {
  it('refuses to separate two arms whose interval includes zero', () => {
    /**
     * 52% against 48% on a hundred calls each. One number is larger. Nothing
     * about that is a finding, and a report that named a winner here would be
     * wrong roughly half the times it was run.
     */
    const result = run(arm('a', 52, 100), arm('b', 48, 100));
    assert.equal(result.separation, 'not-separable');
    assert.equal(result.notSeparable, 'interval-includes-zero');
    assert.ok(result.difference.low < 0 && result.difference.high > 0);
  });

  it('separates them once the difference is real', () => {
    const result = run(arm('a', 800, 1000), arm('b', 500, 1000));
    assert.equal(result.separation, 'a-wins');
    assert.equal(result.notSeparable, null);
    assert.ok(result.difference.low > 0, 'the whole interval is above zero');
  });

  it('names the other arm when it is the other arm', () => {
    assert.equal(run(arm('a', 500, 1000), arm('b', 800, 1000)).separation, 'b-wins');
  });

  it('says how many outcomes per arm would settle it', () => {
    /**
     * "Not significant" tells a reader nothing about whether to wait a day or
     * abandon the idea. A number is a quantified instruction.
     */
    const result = run(arm('a', 52, 100), arm('b', 48, 100));
    assert.ok(result.outcomesNeededPerArm > 100);
    // A 4-point difference around 50% needs a few thousand per arm.
    assert.ok(result.outcomesNeededPerArm > 1000, String(result.outcomesNeededPerArm));
  });

  it('returns null rather than a huge number when the rates are identical', () => {
    /**
     * No sample size separates a difference of zero. A very large number here
     * would read as "keep going", when the honest answer is that there is
     * nothing to find.
     */
    const result = run(arm('a', 50, 100), arm('b', 50, 100));
    assert.equal(result.notSeparable, 'no-difference-observed');
    assert.equal(result.outcomesNeededPerArm, null);
  });

  it('separates nothing recorded from no difference', () => {
    // Two sentences a reader acts on differently: "instrument this" and
    // "these are the same".
    const empty = { name: 'a', totalUsd: 0, tally: { byValue: [], recorded: 0, parsed: 0, unrecordedUsd: 0 } };
    const result = runExperiment({ arms: ['a', 'b'], minOutcomesPerArm: 10 }, { a: empty, b: arm('b', 5, 10) }, VOCAB);
    assert.equal(result.notSeparable, 'nothing-recorded');
  });
});

describe('peeking is visible even though it cannot be prevented', () => {
  it('says the rule was not honoured, and which arm is short', () => {
    /**
     * Nobody can stop somebody reading a number early. What this can do is
     * make the early stop visible to whoever reads the result later, which is
     * the part that matters.
     */
    const result = run(arm('a', 40, 50), arm('b', 20, 50), 100);
    assert.equal(result.stopping.honoured, false);
    assert.equal(result.stopping.short, 'a');
    assert.equal(result.stopping.declared, 100);
  });

  it('says it was honoured when both arms cleared it', () => {
    const result = run(arm('a', 80, 100), arm('b', 50, 100), 100);
    assert.equal(result.stopping.honoured, true);
    assert.equal(result.stopping.short, null);
  });

  it('reports the separation and the peek independently', () => {
    // A separable result read too early is still separable and still read too
    // early. Collapsing them would hide one of the two facts.
    const result = run(arm('a', 45, 50), arm('b', 10, 50), 100);
    assert.equal(result.separation, 'a-wins');
    assert.equal(result.stopping.honoured, false);
  });
});

describe('what an extra success costs', () => {
  it('prices the arm that is better and dearer', () => {
    /**
     * The interesting arm is almost never better *and* cheaper. A costs $2 a
     * call and resolves 80%; B costs $1 and resolves 50%. The extra 30 points
     * cost $1 a call, so one extra success costs $1/0.30 = $3.33.
     */
    const result = run(arm('a', 800, 1000, 2), arm('b', 500, 1000, 1));
    assert.equal(result.marginal.better, 'a');
    assert.equal(result.marginal.dearer, true);
    assert.ok(Math.abs(result.marginal.usdPerExtraSuccess - 1 / 0.3) < 1e-9);
  });

  it('prices per call, so arms with different traffic shares compare', () => {
    // Dividing raw totals would report a marginal cost that moves when the
    // split changes and the behaviour does not.
    const small = run(arm('a', 800, 1000, 2), arm('b', 500, 1000, 1));
    const lopsided = run(arm('a', 80, 100, 2), arm('b', 5000, 10_000, 1));
    assert.ok(
      Math.abs(small.marginal.usdPerExtraSuccess - lopsided.marginal.usdPerExtraSuccess) < 1e-9,
    );
  });

  it('prices nothing when the better arm is also the cheaper one', () => {
    /**
     * Nothing is being bought, and a "cost per extra success" would come out
     * negative — a number people quote without the sign.
     */
    const result = run(arm('a', 800, 1000, 1), arm('b', 500, 1000, 2));
    assert.equal(result.marginal.better, 'a');
    assert.equal(result.marginal.dearer, false);
    assert.equal(result.marginal.usdPerExtraSuccess, null);
  });

  it('is reported even when the arms are not separable', () => {
    // The cost difference is a fact about the bill whether or not the quality
    // difference survives a confidence interval.
    const result = run(arm('a', 52, 100, 2), arm('b', 48, 100, 1));
    assert.equal(result.separation, 'not-separable');
    assert.ok(result.marginal !== null);
  });
});

describe('the statistics are shown, not asserted', () => {
  it('returns each arm\'s interval as well as the verdict', () => {
    // A reader who disagrees with the threshold can see the numbers it was
    // applied to.
    const result = run(arm('a', 80, 100), arm('b', 50, 100));
    assert.ok(result.a.interval.low < 0.8 && result.a.interval.high > 0.8);
    assert.ok(result.b.interval.low < 0.5 && result.b.interval.high > 0.5);
  });

  it('keeps every interval inside 0 and 1', () => {
    /**
     * The reason for Wilson rather than a normal approximation: at 10 of 10 a
     * symmetric interval runs past 1, and at the sample sizes a real
     * experiment starts with that is not an edge case, it is most of the
     * first week.
     */
    const result = run(arm('a', 10, 10), arm('b', 0, 10));
    assert.ok(result.a.interval.high <= 1);
    assert.ok(result.b.interval.low >= 0);
  });

  it('leaves an undeclared value out of both arms', () => {
    const withTypo = arm('a', 50, 100);
    withTypo.tally.byValue.push({ value: 'resolvd', calls: 500, usd: 500 });
    const result = runExperiment({ arms: ['a', 'b'], minOutcomesPerArm: 10 }, { a: withTypo, b: arm('b', 50, 100) }, VOCAB);
    assert.equal(result.a.recorded, 100, 'a typo must not decide an experiment');
  });
});
