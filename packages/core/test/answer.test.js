import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, answerCost } from '../dist/index.js';

/**
 * The answer given before the call is sent.
 *
 * Hand figures: Claude Opus 5 at $5/MTok input makes 200k input tokens $1.00.
 * The date is pinned so a lapsing promotion never fails a test nobody changed.
 *
 * Doctrine: [Measured never merges with estimated without saying which half is which](../../../docs/doctrine.md#measured-never-merges-with-estimated-without-saying-which-half-is-which)
 */

const ON = new Date('2026-08-16T00:00:00Z');
const ask = (request) => answerCost(request, { catalogue: BUNDLED_CATALOGUE, on: ON });

describe('answerCost', () => {
  it('keeps the measured half and the estimated half apart', () => {
    const answer = ask({
      model: 'claude-opus-5',
      inputTokens: 200_000,
      consumedUsd: 40,
      limitUsd: 100,
    });
    assert.equal(answer.call.provenance, 'estimated');
    assert.equal(answer.budget.provenance, 'measured');
    assert.ok(Math.abs(answer.call.estimatedUsd - 1) < 1e-9);
    assert.equal(answer.budget.consumedUsd, 40);
    // The composed figure exists, and never without its halves beside it.
    assert.ok(Math.abs(answer.afterCall.usd - 41) < 1e-9);
    assert.equal(answer.afterCall.halves.measuredUsd, 40);
    assert.ok(Math.abs(answer.afterCall.halves.estimatedUsd - 1) < 1e-9);
  });

  it('says the verdict rests on a measurement when the budget is already blown', () => {
    const answer = ask({ model: 'claude-opus-5', inputTokens: 1000, consumedUsd: 120, limitUsd: 100 });
    assert.equal(answer.verdict, 'over');
    // No estimate was needed to reach that verdict, and a caller can act on it
    // without wondering how good the token count was.
    assert.equal(answer.restsOn, 'measured');
  });

  it('says the verdict rests on an estimate when it takes this call to cross', () => {
    // $99 spent of $100, and a call worth $2.00.
    const answer = ask({
      model: 'claude-opus-5',
      inputTokens: 400_000,
      consumedUsd: 99,
      limitUsd: 100,
    });
    assert.equal(answer.verdict, 'over');
    assert.equal(answer.restsOn, 'measured+estimated');
  });

  it('is within when the composition stays under, and says what that rests on', () => {
    const answer = ask({ model: 'claude-opus-5', inputTokens: 200_000, consumedUsd: 10, limitUsd: 100 });
    assert.equal(answer.verdict, 'within');
    assert.equal(answer.restsOn, 'measured+estimated');
  });

  it('tells a missing budget from a missing measurement, because the fixes differ', () => {
    const noBudget = ask({ model: 'claude-opus-5', inputTokens: 1000, consumedUsd: 5 });
    assert.equal(noBudget.verdict, 'cannot-tell');
    assert.equal(noBudget.reason, 'no-budget-configured');
    // The call half still answers: offline is a mode, not a failure.
    assert.ok(noBudget.call.estimatedUsd > 0);

    const nothingMeasured = ask({ model: 'claude-opus-5', inputTokens: 1000, limitUsd: 100 });
    assert.equal(nothingMeasured.verdict, 'cannot-tell');
    assert.equal(nothingMeasured.reason, 'nothing-measured');
  });

  it('refuses to answer about a model it cannot price, rather than answering another question', () => {
    const answer = ask({ model: 'nobody-prices-this', inputTokens: 1000, consumedUsd: 10, limitUsd: 100 });
    assert.equal(answer.verdict, 'cannot-tell');
    assert.equal(answer.reason, 'model-unpriced');
    // "within" here would answer whether current spend fits, which is not what
    // was asked.
    assert.equal(answer.call, null);
    assert.equal(answer.budget.consumedUsd, 10);
  });

  it('prices output as well as input', () => {
    // 200k input ($1.00) plus 40k output ($1.00) on Claude Opus 5.
    const answer = ask({
      model: 'claude-opus-5',
      inputTokens: 200_000,
      outputTokens: 40_000,
      consumedUsd: 0,
      limitUsd: 100,
    });
    assert.ok(Math.abs(answer.call.estimatedUsd - 2) < 1e-9, String(answer.call.estimatedUsd));
  });

  it('carries how the token count was arrived at', () => {
    assert.equal(ask({ model: 'claude-opus-5', inputTokens: 10, consumedUsd: 0, limitUsd: 1 }).call.basis, 'token-count');
    assert.equal(
      ask({ model: 'claude-opus-5', inputTokens: 10, basis: 'heuristic', consumedUsd: 0, limitUsd: 1 }).call.basis,
      'heuristic',
    );
  });

  it('answers the budget question alone when no call is described', () => {
    const answer = ask({ consumedUsd: 40, limitUsd: 100 });
    assert.equal(answer.call, null);
    assert.equal(answer.verdict, 'within');
    assert.equal(answer.afterCall.halves.estimatedUsd, 0);
  });
});
