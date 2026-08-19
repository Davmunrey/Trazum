import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GATE_MARGIN_TIGHT, explainGateFailure, gateMargin } from '@trazum/core';

/** Why a gate failed and what would move it — joined, never invented. */

const report = (slices, totalUsd) => ({
  total: { totalUsd },
  byLabelAndModel: slices.map(([label, model, usd]) => ({
    label,
    model,
    breakdown: { totalUsd: usd },
  })),
});

const levers = (slices) => ({ slices, promptCeilingUsd: 0, promptCeilingShare: 0 });

describe('explainGateFailure', () => {
  it('names the slice holding the money and its share of the bill', () => {
    const why = explainGateFailure(
      report([['rag', 'claude-opus-5', 10], ['chat', 'claude-opus-5', 2]], 12),
      levers([]),
      4,
    );
    assert.equal(why.largest.label, 'rag');
    assert.ok(Math.abs(why.largest.share - 10 / 12) < 1e-9);
    assert.equal(why.overageUsd, 4);
  });

  it('says whether the lever covers the overage, rather than leaving it inferred', () => {
    const slice = { label: 'rag', model: 'claude-opus-5', combinedUsd: 5 };
    assert.equal(explainGateFailure(report([], 12), levers([slice]), 4).coversIt, true);
    assert.equal(explainGateFailure(report([], 12), levers([slice]), 6).coversIt, false);
  });

  it('returns null rather than an empty recommendation when no lever exists', () => {
    const why = explainGateFailure(report([['a', 'm', 1]], 1), levers([]), 1);
    assert.equal(why.lever, null);
    assert.equal(why.coversIt, false);
  });

  it('has nothing to name when the report has no slices', () => {
    // Null, not a zeroed row: "nothing to point at" and "a workload that cost
    // nothing" are different statements.
    assert.equal(explainGateFailure(report([], 0), levers([]), 5).largest, null);
  });
});

describe('gateMargin', () => {
  it('states how much room a pass had, as a fraction of the limit', () => {
    assert.ok(Math.abs(gateMargin(12, 12.5) - 0.04) < 1e-9);
    assert.ok(gateMargin(12, 12.5) < GATE_MARGIN_TIGHT, 'a 4% margin must read as tight');
    assert.ok(gateMargin(5, 50) > GATE_MARGIN_TIGHT, 'a 90% margin must not');
  });

  it('refuses a budget of nothing rather than dividing by it', () => {
    // An Infinity here would read like an answer.
    assert.equal(gateMargin(0, 0), null);
    assert.equal(gateMargin(5, -1), null);
  });
});
