import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  MODELS,
  effectivePricing,
  gatewayDecision,
  multipliersFor,
  parseUsageLine,
  profileUsage,
  serviceTierOf,
  streamingUsageReader,
  usageFromResponse,
} from '../dist/index.js';

/**
 * OpenAI's service tiers, priced from the pricing page's own tables.
 *
 * developers.openai.com/api/docs/pricing.md, read 2026-11-05: Flex, Fast and
 * Ultrafast each have a table beside the Standard one, with long-context
 * columns. The response's top-level `service_tier` names the tier that ran
 * ("priority" for GPT-5.6 and earlier when Fast was asked for, the guide
 * says). Trazum ignored the field, so a Flex call was billed at twice its
 * cost and a Fast one at half or less.
 */

const ON = new Date('2026-11-01T10:00:00Z');
const model = (id) => BUNDLED_CATALOGUE.byId.get(id);
const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
const rates = (id, size) => {
  const r = effectivePricing(model(id), ON, size);
  return [r.inputPerMTok, r.outputPerMTok, r.serviceTier];
};

describe('the service tier a response names', () => {
  it('reads Fast under both its names, Flex and Ultrafast, and nothing else', () => {
    assert.equal(serviceTierOf('flex'), 'flex');
    assert.equal(serviceTierOf('priority'), 'fast');
    assert.equal(serviceTierOf('fast'), 'fast');
    assert.equal(serviceTierOf('Ultrafast'), 'ultrafast');
    for (const standard of ['default', 'auto', 'scale', '', 'turbo', undefined, null, 3]) {
      assert.equal(serviceTierOf(standard), undefined, String(standard));
    }
  });
});

describe('each tier priced from its own table', () => {
  it('prices GPT-6 Astra in all four tables, short and long, as the page prints them', () => {
    // [tier, short input/output, long input/output]
    for (const [tier, short, long] of [
      [undefined, [10, 50], [20, 75]],
      ['flex', [5, 25], [10, 37.5]],
      ['priority', [20, 100], [40, 150]],
      ['ultrafast', [60, 300], [120, 450]],
    ]) {
      const named = tier === undefined ? {} : { serviceTier: tier };
      assert.deepEqual(rates('gpt-6-astra', { inputTokens: 1000, ...named }).slice(0, 2), short, `${tier} short`);
      assert.deepEqual(rates('gpt-6-astra', { inputTokens: 300_000, ...named }).slice(0, 2), long, `${tier} long`);
    }
  });

  it('writes each model\'s rates out, because they are no single multiple', () => {
    // GPT-4o's Fast is 1.7x, GPT-5.2's 2x, GPT-4.1's 1.75x: a multiplier would be wrong for two of three.
    assert.deepEqual(rates('gpt-4o', { inputTokens: 1000, serviceTier: 'priority' }), [4.25, 17, 'fast']);
    assert.deepEqual(rates('gpt-5.2', { inputTokens: 1000, serviceTier: 'priority' }), [3.5, 28, 'fast']);
    assert.deepEqual(rates('gpt-4.1', { inputTokens: 1000, serviceTier: 'priority' }), [3.5, 14, 'fast']);
    assert.deepEqual(rates('gpt-5.3-codex', { inputTokens: 1000, serviceTier: 'fast' }), [3.5, 28, 'fast']);
  });

  it('keeps the row\'s cache ratios, which is what the tables show', () => {
    const m = multipliersFor(model('gpt-4o'), ON);
    close(4.25 * m.cacheRead, 2.125, 'GPT-4o Fast cached input');
    const flex = effectivePricing(model('gpt-5.4'), ON, { inputTokens: 1000, serviceTier: 'flex' });
    // The page prints "$0.13", a tenth of $1.25 rounded to the cent; the bill uses the exact tenth.
    close(flex.inputPerMTok * multipliersFor(model('gpt-5.4'), ON).cacheRead, 0.125, 'GPT-5.4 Flex cached input');
  });

  it('gives a tier no long band where its table publishes none', () => {
    // GPT-5.5's Fast long-context columns read "-".
    assert.deepEqual(rates('gpt-5.5', { inputTokens: 300_000, serviceTier: 'priority' }), [12.5, 75, 'fast']);
  });

  it('prices a tier the row has no table for at the standard rate', () => {
    // GPT-4o is in the Fast table and not the Flex one; nothing but Astra and 6.1 Sol is Ultrafast.
    assert.deepEqual(rates('gpt-4o', { inputTokens: 1000, serviceTier: 'flex' }), [2.5, 10, undefined]);
    assert.deepEqual(rates('gpt-6-sol', { inputTokens: 1000, serviceTier: 'ultrafast' }), [2, 10, undefined]);
    assert.deepEqual(rates('claude-opus-5-5', { inputTokens: 1000, serviceTier: 'flex' }), [4, 20, undefined]);
  });

  it('declares no tier band below its own table\'s base, and only the three tiers', () => {
    for (const row of MODELS.filter((m) => m.serviceTiers !== undefined)) {
      for (const [tier, sheet] of Object.entries(row.serviceTiers)) {
        assert.ok(['flex', 'fast', 'ultrafast'].includes(tier), `${row.id}: unknown tier ${tier}`);
        assert.equal(row.provider, 'openai', `${row.id}: service tiers are OpenAI's`);
        for (const band of sheet.tiers ?? []) {
          assert.ok(band.inputPerMTok >= sheet.inputPerMTok, `${row.id} ${tier}: band ${band.id} below the table's base`);
        }
      }
    }
  });
});

describe('the tier reaches the bill', () => {
  const line = (tier) => JSON.stringify({
    model: 'gpt-6-astra',
    ts: '2026-11-01T10:00:00Z',
    ...(tier === undefined ? {} : { service_tier: tier }),
    usage: { input_tokens: 100_000, output_tokens: 10_000, input_tokens_details: { cached_tokens: 0 } },
  });

  it('reads service_tier off a logged response and prices the call by it', () => {
    assert.equal(parseUsageLine(line('flex')).serviceTier, 'flex');
    assert.equal(parseUsageLine(line(undefined)).serviceTier, undefined);
    const bill = (tier) => profileUsage(line(tier), { catalogue: BUNDLED_CATALOGUE }).total.totalUsd;
    close(bill(undefined), 0.1 * 10 + 0.01 * 50, 'standard');
    close(bill('default'), 0.1 * 10 + 0.01 * 50, 'default, which a downgraded Fast request also says');
    close(bill('flex'), 0.1 * 5 + 0.01 * 25, 'flex, half');
    close(bill('priority'), 0.1 * 20 + 0.01 * 100, 'priority, the Fast table');
  });
});

describe('the gateway measures the tier that answered', () => {
  it('from a whole Chat Completions response', () => {
    const usage = usageFromResponse('openai', {
      service_tier: 'flex',
      usage: { prompt_tokens: 100, completion_tokens: 10 },
    });
    assert.equal(usage.serviceTier, 'flex');
    assert.equal(usageFromResponse('openai', { usage: { prompt_tokens: 100, completion_tokens: 10 } }).serviceTier, undefined);
  });

  it('from a stream, which names it on every chunk', () => {
    const reader = streamingUsageReader('openai');
    reader.push('data: {"choices":[{"delta":{"content":"hi"}}],"service_tier":"priority"}\n\n');
    reader.push('data: {"choices":[],"service_tier":"priority","usage":{"prompt_tokens":100,"completion_tokens":7}}\n\n');
    reader.push('data: [DONE]\n\n');
    const usage = reader.done();
    assert.equal(usage.serviceTier, 'priority');
    assert.equal(usage.outputTokens, 7);
  });
});

describe('the gateway estimates the tier a request asks for', () => {
  it('judges a budget by the Flex or Fast table the request names', () => {
    const estimate = (serviceTier) => gatewayDecision(
      { provider: 'openai', model: 'gpt-6-astra', inputTokens: 100_000, maxOutputTokens: 0, label: null, serviceTier },
      { limitUsd: 100, consumedUsd: 0, provenance: 'measured', asOfMs: ON.getTime() },
      { catalogue: BUNDLED_CATALOGUE, policy: { onCannotTell: 'fail-closed' }, on: ON },
    ).estimatedUsd;
    close(estimate(null), 1, 'standard: 100,000 at $10');
    close(estimate('flex'), 0.5, 'flex: 100,000 at $5');
    close(estimate('priority'), 2, 'priority: 100,000 at $20');
  });
});
