import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, guardSpend } from '../dist/index.js';

/**
 * The guard an agent consults before it spends.
 *
 * Hand figures: Claude Opus 5 at $5/MTok input makes 200k input tokens $1.00;
 * Claude Haiku 4.5 makes the same tokens $0.20. Pinned inside Sonnet 5's
 * introductory window so a lapsing promotion never fails a test.
 *
 * Doctrine: [A refusal never arrives bare](../../../docs/doctrine.md#a-refusal-never-arrives-bare)
 */

const ON = new Date('2026-08-16T00:00:00Z');
const guard = (request) => guardSpend(request, { catalogue: BUNDLED_CATALOGUE, on: ON });

describe('guardSpend', () => {
  it('says yes within budget, and still names a cheaper way', () => {
    const answer = guard({ model: 'claude-opus-5', inputTokens: 200_000, consumedUsd: 1, limitUsd: 100 });
    assert.equal(answer.verdict, 'yes');
    // An agent allowed to spend that could spend less should be told so.
    assert.ok(answer.alternatives.length > 0);
    assert.match(answer.because, /still a cheaper way/);
  });

  it('refuses with the lever, never bare', () => {
    const answer = guard({ model: 'claude-opus-5', inputTokens: 200_000, consumedUsd: 99.5, limitUsd: 100 });
    assert.equal(answer.verdict, 'no');
    // A guard that only says no teaches a caller to stop asking.
    assert.ok(answer.alternatives.length > 0, 'a refusal must carry alternatives');
    const best = answer.alternatives[0];
    assert.ok(best.savingUsd > 0);
    assert.ok(best.assumes.length > 0, 'every alternative names what it assumes');
  });

  it('prices an alternative for this call, not for a month', () => {
    // Opus 5 at $1.00 for 200k in; Haiku 4.5 at $0.20 for the same. The
    // saving offered is the difference on this call.
    const answer = guard({ model: 'claude-opus-5', inputTokens: 200_000, consumedUsd: 0, limitUsd: 100 });
    const haiku = answer.alternatives.find((a) => a.model?.id === 'claude-haiku-4-5');
    assert.ok(haiku, 'the cheapest model in the family is offered');
    assert.ok(Math.abs(haiku.savingUsd - 0.8) < 1e-9, String(haiku.savingUsd));
  });

  it('never offers a model the prompt does not fit in', () => {
    // 500k tokens: Haiku 4.5's window is 200k, so it is not an alternative —
    // it is a way not to make this call at all.
    const answer = guard({ model: 'claude-opus-5', inputTokens: 500_000, consumedUsd: 0, limitUsd: 100 });
    assert.ok(!answer.alternatives.some((a) => a.model?.id === 'claude-haiku-4-5'));
    // A model with a big enough window is still offered.
    assert.ok(answer.alternatives.some((a) => a.model !== null));
  });

  it('combines route and batch rather than adding their savings', () => {
    const answer = guard({
      model: 'claude-opus-5',
      inputTokens: 200_000,
      consumedUsd: 0,
      limitUsd: 100,
      batchEligible: true,
    });
    const route = answer.alternatives.find((a) => a.kind === 'route' && a.model?.id === 'claude-haiku-4-5');
    const batch = answer.alternatives.find((a) => a.kind === 'batch');
    const both = answer.alternatives.find((a) => a.kind === 'route+batch' && a.model?.id === 'claude-haiku-4-5');
    assert.ok(route && batch && both);
    // The batch discount applies to the cheaper model's price, so the combined
    // saving is less than the sum — the arithmetic `plan` exists to kill.
    assert.ok(both.savingUsd < route.savingUsd + batch.savingUsd);
    assert.ok(both.savingUsd > route.savingUsd);
  });

  it('offers no batch alternative unless the caller says the work can wait', () => {
    const answer = guard({ model: 'claude-opus-5', inputTokens: 200_000, consumedUsd: 0, limitUsd: 100 });
    assert.ok(!answer.alternatives.some((a) => a.kind === 'batch' || a.kind === 'route+batch'));
  });

  it('does not permit what it cannot judge', () => {
    // A guard that says yes whenever its inputs go missing permits everything
    // the moment a store is empty.
    const noBudget = guard({ model: 'claude-opus-5', inputTokens: 1000, consumedUsd: 5 });
    assert.equal(noBudget.verdict, 'cannot-tell');
    assert.match(noBudget.because, /No budget is configured/);

    const nothingMeasured = guard({ model: 'claude-opus-5', inputTokens: 1000, limitUsd: 10 });
    assert.equal(nothingMeasured.verdict, 'cannot-tell');
    assert.match(nothingMeasured.because, /Nothing has been measured/);

    const unpriced = guard({ model: 'who-knows', inputTokens: 1000, consumedUsd: 1, limitUsd: 10 });
    assert.equal(unpriced.verdict, 'cannot-tell');
    assert.match(unpriced.because, /not in the price catalogue/);
  });

  it('keeps the cost answer intact, halves and provenance included', () => {
    const answer = guard({ model: 'claude-opus-5', inputTokens: 200_000, consumedUsd: 40, limitUsd: 100 });
    assert.equal(answer.cost.call.provenance, 'estimated');
    assert.equal(answer.cost.budget.provenance, 'measured');
    assert.equal(answer.cost.restsOn, 'measured+estimated');
    assert.equal(answer.cost.afterCall.halves.measuredUsd, 40);
  });

  it('says which half a refusal rests on', () => {
    // Already over without any help from the estimate.
    const measured = guard({ model: 'claude-opus-5', inputTokens: 1000, consumedUsd: 120, limitUsd: 100 });
    assert.equal(measured.verdict, 'no');
    assert.match(measured.because, /already spent, measured/);

    // It takes this call to cross.
    const mixed = guard({ model: 'claude-opus-5', inputTokens: 400_000, consumedUsd: 99, limitUsd: 100 });
    assert.equal(mixed.verdict, 'no');
    assert.match(mixed.because, /on an estimate of the call/);
  });
});
