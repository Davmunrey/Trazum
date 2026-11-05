import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  effectivePricing,
  isOffered,
  multipliersFor,
  parseUsageLine,
  profileUsage,
  usageFromResponse,
} from '../dist/index.js';

/**
 * OpenAI, re-read on 2026-11-05 (developers.openai.com: pricing.md,
 * guides/prompt-caching.md and each model's page, in their Markdown form).
 *
 * Two findings. GPT-5.6 and later now sell a 12-hour cache entry in the
 * Responses API at 2.5x input, reported as `ttl_12h_tokens` beside
 * `ttl_30m_tokens`; read as a 30-minute write it cost half its price. And
 * sixteen earlier models still billed and still in logs were not priced at all.
 */

const ON = new Date('2026-11-01T10:00:00Z');
const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
const bill = (lines) => profileUsage(lines.map((line) => JSON.stringify(line)).join('\n'), { catalogue: BUNDLED_CATALOGUE });
// 100,000 tokens: under the 272K line, so every rate is the short band's.
const responsesCall = (details) => ({
  model: 'gpt-6-astra',
  ts: '2026-11-01T10:00:00Z',
  usage: { input_tokens: 100_000, output_tokens: 0, input_tokens_details: { cached_tokens: 0, ...details } },
});

describe('the 12-hour cache write', () => {
  it('reads the split and prices each lifetime at its own rate', () => {
    const line = responsesCall({
      cache_write_tokens: 100_000,
      cache_write_tokens_details: { ttl_30m_tokens: 40_000, ttl_12h_tokens: 60_000 },
    });
    const parsed = parseUsageLine(JSON.stringify(line));
    assert.equal(parsed.inputTokens, 0);
    assert.equal(parsed.cacheWrite5mTokens, 40_000);
    assert.equal(parsed.cacheWrite1hTokens, 60_000);
    assert.equal(parsed.writeTtlKnown, true);
    const report = bill([line]);
    // 40,000 at $12.50 (1.25x) and 60,000 at $25 (2.5x) on GPT-6 Astra.
    close(report.total.totalUsd, 0.04 * 12.5 + 0.06 * 25, 'a split write');
    assert.equal(report.total.assumedWriteTtlCalls, 0);
  });

  it('takes an unsplit write on an OpenAI model as the 30-minute kind, said as known', () => {
    const report = bill([responsesCall({ cache_write_tokens: 100_000 })]);
    close(report.total.totalUsd, 0.1 * 12.5, 'an unsplit write');
    assert.equal(report.total.assumedWriteTtlCalls, 0, 'OpenAI splits whenever a 12-hour write is possible');
  });

  it('leaves the lifetime unknown when the split contradicts its total, and says so', () => {
    const line = responsesCall({
      cache_write_tokens: 100_000,
      cache_write_tokens_details: { ttl_30m_tokens: 10_000, ttl_12h_tokens: 10_000 },
    });
    assert.equal(parseUsageLine(JSON.stringify(line)).writeTtlKnown, false);
    assert.equal(bill([line]).total.assumedWriteTtlCalls, 1);
  });

  it('is priced the same way by the gateway, with the writes taken out of the prompt', () => {
    const usage = usageFromResponse('openai', {
      usage: {
        prompt_tokens: 10_000,
        completion_tokens: 10,
        prompt_tokens_details: { cached_tokens: 2_000, cache_write_tokens: 5_000 },
      },
    });
    assert.deepEqual(
      [usage.inputTokens, usage.cacheReadTokens, usage.cacheWriteTokens, usage.cacheWrite5mTokens, usage.cacheWrite1hTokens],
      [3_000, 2_000, 5_000, 5_000, 0],
      'Chat Completions writes stayed inside the prompt, billed as plain input',
    );
  });
});

describe('the earlier OpenAI models, priced from their own pages', () => {
  // id: [input, output, cached (null: none published), context]
  const PUBLISHED = {
    'gpt-5.5': [5, 30, 0.5, 1_050_000],
    'gpt-5.5-pro': [30, 180, null, 1_050_000],
    'gpt-5.4': [2.5, 15, 0.25, 1_050_000],
    'gpt-5.4-pro': [30, 180, null, 1_050_000],
    'gpt-5.4-mini': [0.75, 4.5, 0.075, 400_000],
    'gpt-5.4-nano': [0.2, 1.25, 0.02, 400_000],
    'gpt-5.2': [1.75, 14, 0.175, 400_000],
    'gpt-5.2-pro': [21, 168, null, 400_000],
    'gpt-5.1': [1.25, 10, 0.125, 400_000],
    'gpt-5-pro': [15, 120, null, 400_000],
    'gpt-4.1': [2, 8, 0.5, 1_047_576],
    'gpt-4.1-mini': [0.4, 1.6, 0.1, 1_047_576],
    'gpt-4o': [2.5, 10, 1.25, 128_000],
    'gpt-4o-mini': [0.15, 0.6, 0.075, 128_000],
    o3: [2, 8, 0.5, 200_000],
    'o3-pro': [20, 80, null, 200_000],
  };

  for (const [id, [input, output, cached, context]] of Object.entries(PUBLISHED)) {
    it(`${id}: ${input}/${output}, cached ${cached ?? 'none'}, ${context.toLocaleString('en-US')} context, batch half`, () => {
      const model = BUNDLED_CATALOGUE.byId.get(id);
      assert.ok(model, `${id} is not in the catalogue`);
      const rates = effectivePricing(model, ON, { inputTokens: 1000 });
      close(rates.inputPerMTok, input, `${id} input`);
      close(rates.outputPerMTok, output, `${id} output`);
      const m = multipliersFor(model, ON);
      if (cached === null) assert.equal(model.caching, 'none');
      else close(rates.inputPerMTok * m.cacheRead, cached, `${id} cached input`);
      close(m.batch, 0.5, `${id} batch`);
      assert.equal(model.contextWindow, context);
    });
  }

  it('bills GPT-5.5 and 5.4 over 272K at 2x input and 1.5x output, as their pages say', () => {
    for (const [id, long] of [['gpt-5.5', [10, 45]], ['gpt-5.4', [5, 22.5]], ['gpt-5.5-pro', [60, 270]], ['gpt-5.4-pro', [60, 270]]]) {
      const rates = effectivePricing(BUNDLED_CATALOGUE.byId.get(id), ON, { inputTokens: 272_001 });
      assert.deepEqual([rates.inputPerMTok, rates.outputPerMTok], long, id);
    }
  });

  it('resolves the dated snapshots a log carries, and not the shut-down one priced differently', () => {
    assert.equal(BUNDLED_CATALOGUE.byId.get('gpt-4o-2024-08-06')?.id, 'gpt-4o');
    assert.equal(BUNDLED_CATALOGUE.byId.get('gpt-4o-mini-2024-07-18')?.id, 'gpt-4o-mini');
    assert.equal(BUNDLED_CATALOGUE.byId.get('o3-2025-04-16')?.id, 'o3');
    assert.equal(BUNDLED_CATALOGUE.byId.get('gpt-4o-2024-05-13'), undefined);
  });

  it('never recommends a model its page marks deprecated', () => {
    for (const id of ['gpt-5.4-nano', 'gpt-5.1', 'gpt-5-pro', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o3-pro']) {
      assert.equal(isOffered(BUNDLED_CATALOGUE.byId.get(id)), false, `${id} is offered`);
    }
    for (const id of ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.2']) {
      assert.equal(isOffered(BUNDLED_CATALOGUE.byId.get(id)), true, `${id} is not offered`);
    }
  });
});

describe('GPT-5.6 Cyber, found by the price-drift check', () => {
  it('is priced from the pricing page and its own page, and never recommended', () => {
    const model = BUNDLED_CATALOGUE.byId.get('gpt-5.6-cyber');
    assert.ok(model, 'gpt-5.6-cyber is not in the catalogue');
    const rates = effectivePricing(model, ON, { inputTokens: 100_000 });
    assert.deepEqual([rates.inputPerMTok, rates.outputPerMTok], [12.5, 75]);
    const m = multipliersFor(model, ON);
    close(rates.inputPerMTok * m.cacheRead, 1.25, 'cached input');
    close(rates.inputPerMTok * m.cacheWrite5m, 15.625, '30-minute write');
    close(rates.inputPerMTok * m.cacheWrite1h, 31.25, '12-hour write');
    assert.equal(m.batch, null, 'the model page says the Batch endpoint is not supported');
    assert.equal(model.contextWindow, 400_000);
    assert.equal(isOffered(model), false, 'a model behind an approval programme is offered');
  });

  it('bills a 12-hour write at its own rate', () => {
    const line = { ...responsesCall({ cache_write_tokens: 100_000, cache_write_tokens_details: { ttl_30m_tokens: 0, ttl_12h_tokens: 100_000 } }), model: 'gpt-5.6-cyber' };
    close(bill([line]).total.totalUsd, 0.1 * 31.25, 'a 12-hour write on GPT-5.6 Cyber');
  });
});

describe('GPT-5.6 Sol, as its page describes it on 2026-11-05', () => {
  it('answers to the gpt-5.6 alias the page says routes to it', () => {
    assert.equal(BUNDLED_CATALOGUE.byId.get('gpt-5.6')?.id, 'gpt-5.6-sol');
  });

  it('carries the promotional price the page charges, and says it is promotional', () => {
    const model = BUNDLED_CATALOGUE.byId.get('gpt-5.6-sol');
    const rates = effectivePricing(model, ON, { inputTokens: 1000 });
    assert.deepEqual([rates.inputPerMTok, rates.outputPerMTok], [4, 20]);
    // No post-promotion figure is published, so none is derived from the percentages.
    assert.equal(model.promo, undefined);
    assert.match(model.notes, /promotional until 2026-11-30/);
  });
});
