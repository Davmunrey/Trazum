import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { reconcile } from '../dist/anthropic-cost.js';
import { looksLikeOpenaiCost, openaiCostReport } from '../dist/openai-cost.js';

/**
 * What OpenAI billed, beside what Trazum computed.
 *
 * The fixture is the published OpenAPI example: a day's bucket at six cents,
 * `{"value": 0.06, "currency": "usd"}`. That example is the assertion that
 * `value` is dollars and not cents, which is the one place the habit of the
 * Anthropic converter would silently divide a real bill by a hundred.
 */

const START = 1730419200;

const cost = (over = {}) => ({
  object: 'organization.costs.result',
  amount: { value: 0.06, currency: 'usd' },
  line_item: 'gpt-6-astra, input_tokens',
  project_id: 'proj_abc',
  api_key_id: null,
  quantity: 10000,
  quantity_unit: 'tokens',
  ...over,
});

const report = (results, over = {}) =>
  JSON.stringify({
    object: 'page',
    data: [{ object: 'bucket', start_time: START, end_time: START + 86400, results }],
    has_more: false,
    next_page: null,
    ...over,
  });

const inside = (usd) => ({ usd, fromMs: (START + 3600) * 1000, toMs: (START + 7200) * 1000 });

describe('the amount is in dollars, which is the other trap', () => {
  it('reads the schema’s own example as six cents, undivided', () => {
    assert.equal(openaiCostReport(report([cost()])).usd, 0.06);
  });

  it('counts an unreadable amount rather than reading it as zero', () => {
    const reading = openaiCostReport(report([cost(), cost({ amount: { value: 'six', currency: 'usd' } })]));
    assert.equal(reading.unreadableAmount, 1);
    assert.equal(reading.usd, 0.06);
  });

  it('reads the currency case-insensitively and refuses any other', () => {
    assert.deepEqual(openaiCostReport(report([cost({ amount: { value: 1, currency: 'USD' } })])).otherCurrencies, []);
    const reading = openaiCostReport(report([cost(), cost({ amount: { value: 1, currency: 'eur' } })]));
    assert.deepEqual(reading.otherCurrencies, ['eur']);
  });
});

describe('the decomposition, and how little this report allows', () => {
  it('separates money measured in something other than tokens', () => {
    const reading = openaiCostReport(
      report([
        cost({ amount: { value: 4, currency: 'usd' } }),
        cost({ amount: { value: 1.5, currency: 'usd' }, line_item: 'Whisper', quantity_unit: 'duration_seconds' }),
        cost({ amount: { value: 0.5, currency: 'usd' }, line_item: 'gpt-image-1, images', quantity_unit: 'images' }),
        cost({ amount: { value: 2, currency: 'usd' }, line_item: 'gpt-6, input', quantity_unit: '1000_tokens' }),
      ]),
    );
    assert.equal(reading.usd, 8);
    assert.equal(reading.notTokensUsd, 2);
    assert.equal(reading.described, true);
  });

  it('names money on a line item with no unit, neither as tokens nor as not', () => {
    const reading = openaiCostReport(
      report([cost(), cost({ amount: { value: 3, currency: 'usd' }, line_item: 'something', quantity_unit: null })]),
    );
    assert.equal(reading.unknownUnitUsd, 3);
    assert.equal(reading.notTokensUsd, 0);
  });

  it('never claims to separate batch, because nothing in the schema names it', () => {
    const reading = openaiCostReport(report([cost()]));
    assert.equal(reading.batchSeparable, false);
    assert.equal(reading.batchUsd, 0);
  });

  it('says when the report was not grouped by line item', () => {
    const bare = openaiCostReport(report([cost({ line_item: null, quantity: null, quantity_unit: null })]));
    assert.equal(bare.described, false);
    assert.equal(bare.usd, 0.06);
  });

  it('reads the window off the buckets in Unix seconds, and says when there is none', () => {
    const reading = openaiCostReport(report([cost()]));
    assert.deepEqual(reading.window, { fromMs: START * 1000, toMs: (START + 86400) * 1000 });
    assert.equal(openaiCostReport(JSON.stringify({ object: 'page', data: [], has_more: false })).window, null);
  });

  it('carries the truncation forward', () => {
    assert.equal(openaiCostReport(report([cost()], { has_more: true, next_page: 'page_x' })).truncated, true);
  });

  it('refuses text that is not this endpoint’s answer', () => {
    for (const input of ['', 'not json', '[]', 'null', '{"buckets":[]}']) {
      assert.equal(openaiCostReport(input).unparseable, true, `${JSON.stringify(input)} was read`);
    }
  });
});

describe('setting a receipt beside an OpenAI bill', () => {
  it('reconciles through the same function the Anthropic reading uses', () => {
    const billed = openaiCostReport(
      report([
        cost({ amount: { value: 4, currency: 'usd' } }),
        cost({ amount: { value: 1.5, currency: 'usd' }, line_item: 'Whisper', quantity_unit: 'duration_seconds' }),
      ]),
    );
    const answer = reconcile(inside(3.8), billed);
    assert.equal(answer.refusal, null);
    assert.equal(answer.billedUsd, 5.5);
    assert.ok(Math.abs(answer.differenceUsd - 1.7) < 1e-9);
    assert.equal(answer.notTokensUsd, 1.5);
    assert.equal(answer.batchUsd, 0);
    assert.equal(answer.batchSeparable, false);
    /* 1.70 − 1.50 − 0: batch, if any, is inside this figure and the command
       says so. */
    assert.ok(Math.abs(answer.remainderUsd - 0.2) < 1e-9);
  });

  it('refuses the same three things: window, currency, no window', () => {
    const billed = openaiCostReport(report([cost()]));
    const outside = { usd: 1, fromMs: (START + 10 * 86400) * 1000, toMs: (START + 11 * 86400) * 1000 };
    assert.equal(reconcile(outside, billed).refusal?.reason, 'window-not-covered');
    const eur = openaiCostReport(report([cost({ amount: { value: 1, currency: 'eur' } })]));
    assert.equal(reconcile(inside(1), eur).refusal?.reason, 'other-currency');
    const none = openaiCostReport(JSON.stringify({ object: 'page', data: [], has_more: false }));
    assert.equal(reconcile(inside(1), none).refusal?.reason, 'no-billed-window');
  });
});

describe('telling this report from the other provider’s', () => {
  it('recognises one and does not claim the Anthropic report or a usage report', () => {
    assert.equal(looksLikeOpenaiCost(report([cost()])), true);
    const anthropic = JSON.stringify({
      data: [{ starting_at: '2026-09-01T00:00:00Z', results: [{ amount: '1.00', currency: 'USD' }] }],
      has_more: false,
    });
    assert.equal(looksLikeOpenaiCost(anthropic), false);
    const usage = JSON.stringify({
      object: 'page',
      data: [{ start_time: START, results: [{ input_tokens: 1, output_tokens: 1, num_model_requests: 1 }] }],
    });
    assert.equal(looksLikeOpenaiCost(usage), false);
    assert.equal(looksLikeOpenaiCost('{}'), false);
  });
});
