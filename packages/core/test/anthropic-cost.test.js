import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { anthropicCostReport, looksLikeAnthropicCost, reconcile } from '../dist/anthropic-cost.js';

/**
 * What the provider billed, beside what Trazum computed.
 *
 * The two figures are never added and neither corrects the other. What is
 * checked here is the arithmetic that separates them, the unit that would
 * silently multiply a bill by a hundred, and every case where the comparison
 * refuses to be made at all — a wrong number under a right title being the
 * failure this whole product is arranged against.
 */

const DAY = { from: '2026-09-01T00:00:00Z', to: '2026-09-02T00:00:00Z' };

const cost = (over = {}) => ({
  amount: '400.00',
  context_window: '0-200k',
  cost_type: 'tokens',
  currency: 'USD',
  description: 'Claude Opus 5 Usage - Input Tokens',
  inference_geo: 'global',
  model: 'claude-opus-5',
  service_tier: 'standard',
  token_type: 'uncached_input_tokens',
  workspace_id: null,
  ...over,
});

const report = (results, over = {}) =>
  JSON.stringify({
    data: [{ starting_at: DAY.from, ending_at: DAY.to, results }],
    has_more: false,
    next_page: null,
    ...over,
  });

/** A receipt's span, inside the day the report covers. */
const inside = (usd) => ({
  usd,
  fromMs: Date.parse('2026-09-01T09:00:00Z'),
  toMs: Date.parse('2026-09-01T17:00:00Z'),
});

describe('the amount is in cents, which is the trap', () => {
  it('divides by a hundred, against the schema’s own example', () => {
    /*
      The published example says `"123.45"` in USD represents $1.23. A reader
      who takes the field for dollars overstates a bill a hundredfold, and the
      figure looks entirely plausible on a large organisation.
    */
    const reading = anthropicCostReport(report([cost({ amount: '123.45' })]));
    assert.equal(reading.usd, 1.2345);
  });

  it('sums in cents and divides once, not the other way round', () => {
    const reading = anthropicCostReport(
      report([cost({ amount: '0.01' }), cost({ amount: '0.01' }), cost({ amount: '0.01' })]),
    );
    assert.equal(reading.usd, 0.0003);
  });

  it('counts an unreadable amount rather than reading it as zero', () => {
    /* A zero would quietly shrink the bill, which is the direction that
       matters: an understated bill is one nobody questions. */
    const reading = anthropicCostReport(report([cost(), cost({ amount: 'many dollars' })]));
    assert.equal(reading.unreadableAmount, 1);
    assert.equal(reading.usd, 4);
  });
});

describe('the decomposition, and what it refuses to decompose', () => {
  it('separates what no token rate covers, and the batch tier', () => {
    const reading = anthropicCostReport(
      report([
        cost({ amount: '400.00' }),
        cost({ amount: '150.00', cost_type: 'web_search', service_tier: null, model: null }),
        cost({ amount: '50.00', service_tier: 'batch' }),
      ]),
    );
    assert.equal(reading.usd, 6);
    assert.equal(reading.notTokensUsd, 1.5);
    assert.equal(reading.batchUsd, 0.5);
    assert.equal(reading.described, true);
  });

  it('says when the report was not grouped by description', () => {
    /* Without it every cost_type and service_tier is null, so a difference
       cannot be attributed and a remainder would be the whole difference
       wearing a smaller name. */
    const bare = anthropicCostReport(
      report([{ amount: '600.00', currency: 'USD', cost_type: null, service_tier: null }]),
    );
    assert.equal(bare.described, false);
    assert.equal(bare.usd, 6);
    assert.equal(bare.notTokensUsd, 0);
  });

  it('reads the window off the buckets, and says when there is none', () => {
    const reading = anthropicCostReport(report([cost()]));
    assert.deepEqual(reading.window, { fromMs: Date.parse(DAY.from), toMs: Date.parse(DAY.to) });
    assert.equal(anthropicCostReport(JSON.stringify({ data: [], has_more: false })).window, null);
  });

  it('refuses text that is not this endpoint’s answer', () => {
    for (const text of ['', 'not json', '[]', 'null', '{"buckets":[]}']) {
      assert.equal(anthropicCostReport(text).unparseable, true, `${JSON.stringify(text)} was read`);
    }
  });
});

describe('setting the two figures beside each other', () => {
  const billed = (results, over) => anthropicCostReport(report(results, over));

  it('names the difference and leaves the remainder standing on its own', () => {
    const answer = reconcile(
      inside(3.8),
      billed([
        cost({ amount: '400.00' }),
        cost({ amount: '150.00', cost_type: 'web_search' }),
        cost({ amount: '50.00', service_tier: 'batch' }),
      ]),
    );
    assert.equal(answer.refusal, null);
    assert.equal(answer.computedUsd, 3.8);
    assert.equal(answer.billedUsd, 6);
    assert.ok(Math.abs(answer.differenceUsd - 2.2) < 1e-9);
    assert.equal(answer.notTokensUsd, 1.5);
    assert.equal(answer.batchUsd, 0.5);
    /* 2.20 − 1.50 − 0.50. The remainder is never folded into an explanation:
       it is the only figure here worth arguing about. */
    assert.ok(Math.abs(answer.remainderUsd - 0.2) < 1e-9);
  });

  it('reports a negative remainder rather than clamping it at zero', () => {
    /*
      Trazum priced more than the provider charged. That is a stale rate in
      the direction that costs somebody money, and reporting it as zero would
      hide exactly the case worth finding.
    */
    const answer = reconcile(inside(9), billed([cost({ amount: '400.00' })]));
    assert.ok(answer.remainderUsd < 0, `remainder was ${answer.remainderUsd}`);
    assert.ok(Math.abs(answer.remainderUsd - -5) < 1e-9);
  });

  it('refuses two windows that are not the same window', () => {
    /* A receipt for one day set against a bill for another is a wrong number
       under a right title. Containment rather than equality, because a daily
       bucket is wider than a receipt's span by construction. */
    const outside = {
      usd: 3.8,
      fromMs: Date.parse('2026-09-05T09:00:00Z'),
      toMs: Date.parse('2026-09-05T17:00:00Z'),
    };
    const answer = reconcile(outside, billed([cost()]));
    assert.equal(answer.refusal?.reason, 'window-not-covered');
    assert.equal(answer.remainderUsd, 0, 'a refused comparison still produced a remainder');

    /* And a span the bucket does contain is compared. */
    assert.equal(reconcile(inside(3.8), billed([cost()])).refusal, null);
  });

  it('refuses to sum a currency it has no rate for', () => {
    /* Summing two currencies into one total needs a rate, and inventing one
       is the thing this product exists not to do. */
    const answer = reconcile(inside(3.8), billed([cost(), cost({ currency: 'EUR' })]));
    assert.equal(answer.refusal?.reason, 'other-currency');
    assert.deepEqual(answer.refusal.currencies, ['EUR']);
  });

  it('refuses a report with no window at all', () => {
    const answer = reconcile(inside(3.8), anthropicCostReport(JSON.stringify({ data: [] })));
    assert.equal(answer.refusal?.reason, 'no-billed-window');
  });

  it('carries the truncation forward, because a short bill understates the gap', () => {
    const short = billed([cost()], { has_more: true, next_page: 'page_abc' });
    assert.equal(short.truncated, true);
  });
});

describe('telling a cost report from a usage report', () => {
  it('recognises one and claims neither the other nor a saved response', () => {
    assert.equal(looksLikeAnthropicCost(report([cost()])), true);
    /* The usage report has buckets and no amount. */
    const usage = JSON.stringify({
      data: [{ starting_at: DAY.from, results: [{ uncached_input_tokens: 10, output_tokens: 5 }] }],
      has_more: false,
    });
    assert.equal(looksLikeAnthropicCost(usage), false);
    assert.equal(looksLikeAnthropicCost('{}'), false);
  });
});
