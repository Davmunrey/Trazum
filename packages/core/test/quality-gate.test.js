import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MIN_OUTCOMES_EACH_SIDE, qualityGate } from '../dist/index.js';

/**
 * The gate that fails a build for a prompt edit that made the product worse.
 *
 * Most of these tests are about the gate **refusing to blame the prompt**. A
 * before-and-after splits traffic by time rather than at random, so everything
 * else that changed at the same time is in the difference too — and a gate that
 * blames the prompt because the prompt is the thing it can see gets switched
 * off within a month.
 */

const VOCAB = { values: ['resolved', 'escalated'], success: ['resolved'] };

/** One side: `successes` of `recorded` resolved, `calls` total, on one model. */
const side = (successes, recorded, { calls = recorded, model = 'claude-opus-5', usdPerCall = 1 } = {}) => ({
  arm: {
    name: 'x',
    totalUsd: calls * usdPerCall,
    tally: {
      byValue: [
        ...(successes > 0 ? [{ value: 'resolved', calls: successes, usd: successes * usdPerCall }] : []),
        ...(recorded - successes > 0
          ? [{ value: 'escalated', calls: recorded - successes, usd: (recorded - successes) * usdPerCall }]
          : []),
      ],
      recorded,
      parsed: calls,
      unrecordedUsd: (calls - recorded) * usdPerCall,
    },
  },
  calls,
  usdByModel: [{ model, usd: calls * usdPerCall }],
});

const gate = (before, after, vocabulary = VOCAB) => qualityGate(before, after, vocabulary);

describe('the verdict', () => {
  it('fails on a measured, separable drop', () => {
    // 71% to 64% on 8,400 outcomes a side — the sentence from the plan.
    const result = gate(side(5964, 8400), side(5376, 8400));
    assert.equal(result.verdict, 'dropped');
    assert.equal(result.unknown, null);
    assert.ok(result.difference.high < 0, 'the whole interval is below zero');
  });

  it('holds when the rate measurably went up', () => {
    assert.equal(gate(side(500, 1000), side(700, 1000)).verdict, 'held');
  });

  it('never calls "not measurably worse" a hold', () => {
    /**
     * The line `verify` has held since 1.39, and it matters more here because
     * this one is wired to an exit code: a gate that spells "no measurable
     * drop" and "held" the same way passes a real regression it merely lacked
     * the power to see.
     */
    const result = gate(side(520, 1000), side(505, 1000));
    assert.equal(result.verdict, 'cannot-tell');
    assert.equal(result.unknown, 'not-separable');
  });
});

describe('it refuses to blame the prompt for something else', () => {
  it('cannot tell when the model mix moved underneath', () => {
    const before = side(700, 1000);
    const after = side(500, 1000);
    after.usdByModel = [
      { model: 'claude-opus-5', usd: 400 },
      { model: 'claude-haiku-4-5', usd: 600 },
    ];
    const result = gate(before, after);
    assert.equal(result.verdict, 'cannot-tell');
    assert.equal(result.unknown, 'confounded');
    assert.equal(result.confounders[0].kind, 'model-mix-moved');
  });

  it('cannot tell when the volume moved', () => {
    // A workload whose traffic tripled is usually a workload whose population
    // changed — a new surface, a new customer, a campaign.
    const result = gate(side(700, 1000), side(1500, 3000, { calls: 3000 }));
    assert.equal(result.verdict, 'cannot-tell');
    assert.ok(result.confounders.some((c) => c.kind === 'volume-moved'));
  });

  it('cannot tell when outcome coverage moved — the one nobody thinks of', () => {
    /**
     * A team that starts instrumenting its hard cases sees its measured rate
     * fall without anything having got worse. Comparing two rates over
     * differently-selected populations is the most convincing wrong answer
     * this module could produce.
     */
    const before = side(700, 1000, { calls: 1000 });
    const after = side(500, 1000, { calls: 1400 });
    const result = gate(before, after);
    assert.equal(result.verdict, 'cannot-tell');
    assert.ok(result.confounders.some((c) => c.kind === 'coverage-moved'));
  });

  it('reports a confounder even when the rate held', () => {
    // A rate that held while the model changed underneath is not evidence
    // that the prompt is fine either.
    const before = side(500, 1000);
    const after = side(700, 1000);
    after.usdByModel = [
      { model: 'claude-opus-5', usd: 300 },
      { model: 'claude-sonnet-5', usd: 700 },
    ];
    const result = gate(before, after);
    assert.ok(result.confounders.length > 0);
    assert.equal(result.verdict, 'cannot-tell');
  });

  it('puts a confounder ahead of the statistics, so no build fails on an ambiguous drop', () => {
    const before = side(900, 1000);
    const after = side(100, 1000);
    after.usdByModel = [{ model: 'something-else', usd: 1000 }];
    // The drop is enormous and unambiguous statistically. It is still not
    // attributable, and the gate says so rather than failing the build.
    assert.equal(gate(before, after).verdict, 'cannot-tell');
  });
});

describe('the refusals name what would settle them', () => {
  it('separates too few before from too few after', () => {
    const thin = side(30, 50);
    const thick = side(700, 1000);
    assert.equal(gate(thin, thick).unknown, 'too-few-before');
    assert.equal(gate(thick, thin).unknown, 'too-few-after');
  });

  it('needs a hundred a side, not the ten a rate needs elsewhere', () => {
    /**
     * This one fails builds. The cost of a wrong `dropped` is somebody
     * reverting a good change and losing the saving; the cost of a wrong
     * `cannot-tell` is waiting a day. Those are not symmetric.
     */
    assert.equal(MIN_OUTCOMES_EACH_SIDE, 100);
    const justUnder = side(50, MIN_OUTCOMES_EACH_SIDE - 1);
    assert.equal(gate(justUnder, side(700, 1000)).unknown, 'too-few-before');
  });

  it('says so when no vocabulary declares what success is', () => {
    assert.equal(gate(side(700, 1000), side(500, 1000), null).unknown, 'no-vocabulary');
  });
});

describe('both halves, both provenances, one report', () => {
  it('carries the cost delta beside the quality delta', () => {
    // The sentence teams actually argue about needs both, and they are kept
    // apart rather than merged into a score.
    const result = gate(side(5964, 8400, { usdPerCall: 2 }), side(5376, 8400, { usdPerCall: 1 }));
    assert.equal(result.verdict, 'dropped');
    assert.ok(Math.abs(result.cost.deltaUsdPerCall + 1) < 1e-9, 'a dollar a call cheaper');
    assert.ok(result.before.rate > result.after.rate, 'and measurably worse');
  });

  it('carries the sample size, so the claim states its own weight', () => {
    const result = gate(side(5964, 8400), side(5376, 8400));
    assert.deepEqual(result.outcomes, { before: 8400, after: 8400 });
  });

  it('keeps each side\'s interval', () => {
    const result = gate(side(700, 1000), side(500, 1000));
    assert.ok(result.before.interval.low < 0.7 && result.before.interval.high > 0.7);
    assert.ok(result.after.interval.low < 0.5 && result.after.interval.high > 0.5);
  });
});
