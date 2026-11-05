import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  MODELS,
  anthropicUsageRecords,
  claudeCodeRecords,
  effectivePricing,
  gatewayDecision,
  inferenceGeoOf,
  parseUsageLine,
  profileUsage,
  streamingUsageReader,
  usageFromResponse,
} from '../dist/index.js';

/**
 * US-only inference, priced at the multiplier Anthropic publishes.
 *
 * platform.claude.com/docs/en/about-claude/pricing, "Data residency pricing",
 * read 2026-11-05: "For Claude 4.6 and later models, specifying US-only
 * inference through the `inference_geo` parameter incurs a 1.1x multiplier on
 * all token pricing categories, including input tokens, output tokens, cache
 * writes, and cache reads." It stacks with fast mode, and on Haiku 5.5 with the
 * long-prompt band. Every response and every Claude Code log line names the
 * geography in `usage.inference_geo`, and Trazum dropped the field, so every
 * US-only call was priced a tenth under its cost.
 */

const ON = new Date('2026-11-01T10:00:00Z');
const byId = (id) => MODELS.find((model) => model.id === id);
const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

/** The Claude generation an Anthropic id names, as a comparable number: 4.6 is 406. */
const generation = (id) => {
  const named = /^claude-(?:opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(id);
  if (named !== null) return Number(named[1]) * 100 + Number(named[2] ?? 0);
  const old = /^claude-(\d+)-(\d+)-/.exec(id);
  if (old !== null) return Number(old[1]) * 100 + Number(old[2]);
  throw new Error(`${id}: no Claude generation in the id`);
};

describe('the multiplier in the catalogue', () => {
  it('sits on every Claude row from 4.6 on, at 1.1, and on no other row', () => {
    /* The page draws the line at a generation, so this does too: a new
       Claude model that arrives without the multiplier fails here. */
    for (const model of MODELS) {
      const us = model.inferenceGeoMultipliers?.us;
      if (model.provider === 'anthropic' && generation(model.id) >= 406) {
        assert.equal(us, 1.1, `${model.id} is Claude 4.6 or later and bills US-only inference at 1.1x`);
      } else {
        assert.equal(us, undefined, `${model.id} has no published US-only multiplier`);
      }
    }
    assert.ok(MODELS.filter((model) => model.inferenceGeoMultipliers?.us !== undefined).length >= 13);
  });

  it('reads "us" in any case, and nothing else, as the US geography', () => {
    assert.equal(inferenceGeoOf('us'), 'us');
    assert.equal(inferenceGeoOf(' US '), 'us');
    for (const other of ['global', 'not_available', 'eu', '', null, undefined, 1]) {
      assert.equal(inferenceGeoOf(other), undefined, JSON.stringify(other));
    }
  });
});

describe('the price of a US-only call', () => {
  const rates = (id, context) => {
    const r = effectivePricing(byId(id), ON, context);
    return [r.inputPerMTok, r.outputPerMTok, r.inferenceGeo];
  };

  it('is 1.1x on Claude 4.6 and later, and the row’s own price anywhere else', () => {
    assert.deepEqual(rates('claude-opus-4-6', { inferenceGeo: 'us' }), [5.5, 27.5, 'us']);
    assert.deepEqual(rates('claude-sonnet-4-6', { inferenceGeo: 'us' }), [3.3, 16.5, 'us']);
    assert.deepEqual(rates('claude-opus-5-5', { inferenceGeo: 'us' }), [4.4, 22, 'us']);
    for (const geo of ['global', 'not_available', undefined]) {
      assert.deepEqual(rates('claude-opus-4-6', geo === undefined ? {} : { inferenceGeo: geo }), [5, 25, undefined], String(geo));
    }
    /* Opus 4.5 is before the line: the API rejects the parameter, so the
       log cannot say "us", and if it did nothing published would price it. */
    assert.deepEqual(rates('claude-opus-4-5', { inferenceGeo: 'us' }), [5, 25, undefined]);
  });

  it('stacks with fast mode, as the page says', () => {
    const fast = effectivePricing(byId('claude-opus-5'), ON, { inferenceGeo: 'us', speed: 'fast' });
    assert.deepEqual([fast.inputPerMTok, fast.outputPerMTok], [11, 55]);
    assert.equal(fast.tier.applied, 'fast');
  });

  it('applies to Haiku 5.5’s long band, and to the floor of an undecided one', () => {
    const decided = effectivePricing(byId('claude-haiku-5-5'), ON, { inferenceGeo: 'us', inputTokens: 150_000 });
    close(decided.inputPerMTok, 0.55, 'long band input');
    assert.equal(decided.tier.applied, 'over-100k');
    const undecided = effectivePricing(byId('claude-haiku-5-5'), ON, { inferenceGeo: 'us', inputTokensAtMost: 500_000 });
    assert.equal(undecided.tier.decided, false);
    close(undecided.inputPerMTok, 0.55, 'ceiling');
    close(undecided.tier.floor.inputPerMTok, 0.11, 'floor');
  });
});

describe('the geography reaches the bill', () => {
  /* One million of each, so the dollars read straight off the rates. */
  const transcript = (geo) => JSON.stringify({
    type: 'assistant', timestamp: '2026-11-01T10:00:00Z', sessionId: 's', requestId: `r-${geo ?? 'none'}`,
    message: {
      id: `m-${geo ?? 'none'}`, model: 'claude-opus-4-6', content: [],
      usage: {
        input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000,
        cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 0 },
        ...(geo ? { inference_geo: geo } : {}),
      },
    },
  });

  it('keeps usage.inference_geo through a Claude Code transcript and prices every category by it', () => {
    const records = claudeCodeRecords([transcript('us'), transcript('global'), transcript(undefined)].join('\n')).records;
    assert.deepEqual(records.map((record) => record.usage.inference_geo), ['us', 'global', undefined]);
    const report = profileUsage(records.map((record) => JSON.stringify(record)).join('\n'), { catalogue: BUNDLED_CATALOGUE });
    // Global: $5 input + $25 output + $0.50 cache read + $6.25 5m write. US-only: 1.1x of each.
    const global = 5 + 25 + 0.5 + 6.25;
    close(report.total.totalUsd, 1.1 * global + 2 * global, 'three calls');
  });

  it('reads the geography from a logged API response, nested or flat', () => {
    const nested = parseUsageLine(JSON.stringify({ model: 'claude-opus-4-6', usage: { input_tokens: 1, output_tokens: 1, inference_geo: 'us' } }));
    const flat = parseUsageLine(JSON.stringify({ model: 'claude-opus-4-6', input_tokens: 1, output_tokens: 1, inference_geo: 'us' }));
    assert.equal(nested.inferenceGeo, 'us');
    assert.equal(flat.inferenceGeo, 'us');
  });

  it('prices a US-only row of the usage report at the multiplier', () => {
    const row = (geo) => ({
      uncached_input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 0,
      cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
      model: 'claude-opus-4-6', service_tier: 'standard', inference_geo: geo, speed: 'standard',
    });
    const conversion = anthropicUsageRecords(JSON.stringify({
      data: [{ starting_at: '2026-11-01T00:00:00Z', ending_at: '2026-11-02T00:00:00Z', results: [row('us'), row('global')] }],
      has_more: false,
    }));
    assert.equal(conversion.usOnlyRows, 1);
    assert.equal(conversion.usOnlyFloor, 0);
    const report = profileUsage(conversion.records.map((record) => JSON.stringify(record)).join('\n'), { catalogue: BUNDLED_CATALOGUE });
    close(report.total.totalUsd, 1.1 * 30 + 30, 'one US-only and one global row');
  });
});

describe('the gateway measures the geography it was answered in', () => {
  it('from a whole response', () => {
    assert.equal(usageFromResponse('anthropic', { usage: { input_tokens: 10, output_tokens: 5, inference_geo: 'us' } }).inferenceGeo, 'us');
    assert.equal(usageFromResponse('anthropic', { usage: { input_tokens: 10, output_tokens: 5 } }).inferenceGeo, undefined);
  });

  it('from a stream, whichever event carries it', () => {
    const reader = streamingUsageReader('anthropic');
    reader.push('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":1,"inference_geo":"us"}}}\n\n');
    reader.push('event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n');
    reader.push('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    assert.equal(reader.done().inferenceGeo, 'us');
  });

  it('judges a request that pins the US at the US price', () => {
    const standing = { limitUsd: 100, consumedUsd: 10, provenance: 'measured', asOfMs: ON.getTime() };
    const call = (inferenceGeo) => ({
      provider: 'anthropic', model: 'claude-opus-4-6', inputTokens: 100_000, maxOutputTokens: 10_000,
      label: null, session: null, ...(inferenceGeo === undefined ? {} : { inferenceGeo }),
    });
    const decide = (c) => gatewayDecision(c, standing, { catalogue: BUNDLED_CATALOGUE, policy: { onCannotTell: 'fail-closed' }, on: ON });
    const pinned = decide(call('us'));
    const global = decide(call(undefined));
    assert.equal(typeof pinned.estimatedUsd, 'number', JSON.stringify(pinned));
    close(pinned.estimatedUsd, 1.1 * global.estimatedUsd, 'the pinned estimate');
  });
});
