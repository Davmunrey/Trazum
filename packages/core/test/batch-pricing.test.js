import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  MODELS,
  effectivePricing,
  multipliersFor,
  parseUsageLine,
  profileUsage,
} from '../dist/index.js';

/**
 * A call the provider ran on its Batch API, billed at the published discount.
 *
 * platform.claude.com/docs/en/build-with-claude/batch-processing, read
 * 2026-11-05: "All usage is charged at 50 percent of the standard API prices",
 * and every Messages response says which tier ran in `usage.service_tier`
 * ("standard", "priority" or "batch"). The pricing page adds that caching
 * stacks with the Batch API discount. developers.openai.com/api/docs/guides/
 * batch: "50% cost discount compared to synchronous APIs". Trazum priced a
 * batch call at the standard rate, twice its cost, and left every batch row of
 * a usage report out of the bill.
 *
 * The ratio is the row's own `multipliers.batch`, the one the batch advisory
 * quotes and price-drift checks against each provider's batch table weekly.
 */

const ON = new Date('2026-11-01T10:00:00Z');
const byId = (id) => MODELS.find((model) => model.id === id);
const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
const rates = (id, context) => {
  const r = effectivePricing(byId(id), ON, context);
  return [r.inputPerMTok, r.outputPerMTok, r.batch];
};

describe('the batch rate', () => {
  it('is the batch table each page publishes', () => {
    // Opus 5: $5/$25 standard, $2.50/$12.50 batch. GPT-6 Astra: $10/$50, $5/$25.
    assert.deepEqual(rates('claude-opus-5', { batch: true }), [2.5, 12.5, true]);
    assert.deepEqual(rates('gpt-6-astra', { batch: true, inputTokens: 1000 }), [5, 25, true]);
    assert.deepEqual(rates('claude-opus-5', {}), [5, 25, undefined]);
    assert.deepEqual(rates('claude-opus-5', { batch: false }), [5, 25, undefined]);
  });

  it('takes the long band first, as the batch table’s own long columns do', () => {
    // GPT-6 Astra's long band is $20/$75, and its batch long band $10/$37.50.
    assert.deepEqual(rates('gpt-6-astra', { batch: true, inputTokens: 400_000 }), [10, 37.5, true]);
  });

  it('stacks with US-only inference, as Anthropic’s page says', () => {
    const r = effectivePricing(byId('claude-opus-5'), ON, { batch: true, inferenceGeo: 'us' });
    assert.deepEqual([r.inputPerMTok, r.outputPerMTok, r.batch, r.inferenceGeo], [2.75, 13.75, true, 'us']);
  });

  it('leaves a model with no batch API at its standard price', () => {
    const none = MODELS.find((model) => multipliersFor(model).batch === null);
    if (none === undefined) return;
    const r = effectivePricing(none, ON, { batch: true, inputTokens: 1000 });
    const standard = effectivePricing(none, ON, { inputTokens: 1000 });
    assert.deepEqual([r.inputPerMTok, r.outputPerMTok, r.batch], [standard.inputPerMTok, standard.outputPerMTok, undefined]);
  });
});

describe('a batch call reaches the bill at half', () => {
  const line = (over) => JSON.stringify({
    model: 'claude-opus-5', timestamp: '2026-11-01T10:00:00Z',
    usage: {
      input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 0 },
      ...over,
    },
  });
  const bill = (text) => profileUsage(text, { catalogue: BUNDLED_CATALOGUE }).total.totalUsd;

  it('reads Anthropic’s usage.service_tier, and only "batch" changes the price', () => {
    assert.equal(parseUsageLine(line({ service_tier: 'batch' })).batch, true);
    for (const tier of ['standard', 'priority', undefined]) {
      assert.equal(parseUsageLine(line(tier === undefined ? {} : { service_tier: tier })).batch, undefined, String(tier));
    }
    // Standard: $5 + $25 + $0.50 cache read + $6.25 5m write. Batch: half of every one.
    const standard = 5 + 25 + 0.5 + 6.25;
    close(bill(line({ service_tier: 'standard' })), standard, 'standard');
    close(bill(line({ service_tier: 'batch' })), standard / 2, 'batch');
  });

  it('reads a record-level batch flag, which the usage report converters write', () => {
    const flagged = JSON.stringify({ model: 'gpt-6-astra', timestamp: '2026-11-01T10:00:00Z', batch: true, usage: { prompt_tokens: 1000, completion_tokens: 1000 } });
    assert.equal(parseUsageLine(flagged).batch, true);
    const plain = flagged.replace('"batch":true,', '');
    close(bill(flagged), bill(plain) / 2, 'flagged batch');
  });

  it('does not take OpenAI’s response-level service_tier for a batch', () => {
    // OpenAI's documented values are auto, default, flex, scale and priority: none is "batch".
    const flex = JSON.stringify({ model: 'gpt-6-astra', service_tier: 'flex', usage: { prompt_tokens: 1, completion_tokens: 1 } });
    assert.equal(parseUsageLine(flex).batch, undefined);
  });
});
