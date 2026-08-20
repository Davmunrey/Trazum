import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  CONNECTORS,
  bucketedCacheEconomics,
  bucketedProfile,
  connectorFor,
  normalizeAnthropicUsage,
  normalizeOpenAIUsage,
} from '../dist/index.js';

/**
 * The bill read from the provider.
 *
 * Hand arithmetic as everywhere: Claude Opus 5 at $5/MTok input makes 200k
 * input tokens $1.00, and at $25/MTok output makes 40k output tokens $1.00.
 * The date is pinned so a lapsing promotion never fails a test nobody changed.
 */

const ON = new Date('2026-08-16T00:00:00Z');

const anthropicBucket = (over = {}) => ({
  starting_at: '2026-08-01T00:00:00Z',
  ending_at: '2026-08-02T00:00:00Z',
  results: [
    {
      model: 'claude-opus-5',
      uncached_input_tokens: 200_000,
      cache_read_input_tokens: 0,
      output_tokens: 40_000,
      ...over,
    },
  ],
});

const priced = (payload, normalize = normalizeAnthropicUsage) =>
  bucketedProfile(normalize(payload), { catalogue: BUNDLED_CATALOGUE, on: ON });

describe('the connector registry', () => {
  it('names the credential environment and the narrowest key that works', () => {
    for (const connector of CONNECTORS) {
      assert.ok(connector.credentialEnv.length > 0, `${connector.id} names no environment variable`);
      assert.ok(connector.keyKind.length > 0, `${connector.id} does not say which key it needs`);
      // Every bucketed source owes the reader the findings it cannot support.
      assert.ok(connector.unavailable.length > 0);
      for (const entry of connector.unavailable) {
        assert.ok(entry.because.length > 0, `${entry.finding} is unavailable without a reason`);
        assert.ok(entry.unlockedBy.length > 0, `${entry.finding} does not say what would unlock it`);
      }
    }
    assert.equal(connectorFor('nope'), null);
  });

  it('keeps the asymmetry between providers rather than papering over it', () => {
    // OpenAI serves a request count; Anthropic's usage report does not. A
    // report that made both look alike would be inventing one of them.
    assert.equal(connectorFor('openai').servesCallCounts, true);
    assert.equal(connectorFor('anthropic').servesCallCounts, false);
  });
});

describe('normalizeAnthropicUsage', () => {
  it('prices a bucket at the catalogue rates', () => {
    const report = priced({ data: [anthropicBucket()] });
    // $1.00 of input + $1.00 of output.
    assert.ok(Math.abs(report.total.totalUsd - 2) < 1e-9, String(report.total.totalUsd));
    assert.equal(report.byModel[0].model, 'claude-opus-5');
    assert.equal(report.granularity, 'bucketed');
  });

  it('reports an unknown call count as null, never as zero', () => {
    const report = priced({ data: [anthropicBucket()] });
    // Zero would read as "no traffic" against $2.00 of spend.
    assert.equal(report.total.calls, null);
    assert.equal(report.byModel[0].calls, null);
    assert.equal(report.byDay[0].calls, null);
  });

  it('keeps the two cache-write TTLs apart, and says when the source did not', () => {
    const split = priced({
      data: [
        anthropicBucket({
          cache_creation: { ephemeral_5m_input_tokens: 200_000, ephemeral_1h_input_tokens: 200_000 },
        }),
      ],
    });
    const slice = split.byModel[0];
    assert.equal(slice.writeTtlKnown, true);
    // 200k at 1.25x ($1.25) plus 200k at 2x ($2.00) on top of input and output.
    assert.ok(Math.abs(slice.cacheWriteUsd - 3.25) < 1e-9, String(slice.cacheWriteUsd));
    // The TTL was stated, so the worst case is the same figure.
    assert.ok(Math.abs(slice.cacheWriteUsdIfAssumed1h - slice.cacheWriteUsd) < 1e-9);

    // The legacy flat field: the cheaper rate is assumed for the headline and
    // the worst case is carried, exactly as the per-call path does.
    const flat = priced({ data: [anthropicBucket({ cache_creation_input_tokens: 200_000 })] });
    const flatSlice = flat.byModel[0];
    assert.equal(flatSlice.writeTtlKnown, false);
    assert.ok(Math.abs(flatSlice.cacheWriteUsd - 1.25) < 1e-9, String(flatSlice.cacheWriteUsd));
    assert.ok(Math.abs(flatSlice.cacheWriteUsdIfAssumed1h - 2) < 1e-9);
  });

  it('names an entry it cannot read instead of dropping it silently', () => {
    const pull = normalizeAnthropicUsage({
      data: [
        anthropicBucket(),
        { starting_at: 'not a date', results: [] },
        { starting_at: '2026-08-03T00:00:00Z', ending_at: '2026-08-04T00:00:00Z', results: [{ output_tokens: 10 }] },
      ],
    });
    assert.equal(pull.gaps.length, 2);
    assert.ok(pull.gaps.every((gap) => gap.kind === 'unreadable-entry'));
    assert.ok(pull.gaps.some((gap) => /no readable time window/.test(gap.detail)));
    assert.ok(pull.gaps.some((gap) => /names no model/.test(gap.detail)));
  });

  it('refuses a payload that is not a usage report', () => {
    assert.throws(() => normalizeAnthropicUsage({ hello: 1 }), /usage report endpoint/);
  });

  it('sums repeated buckets for the same window and model', () => {
    const pull = normalizeAnthropicUsage({ data: [anthropicBucket(), anthropicBucket()] });
    assert.equal(pull.buckets.length, 1);
    assert.equal(pull.buckets[0].inputTokens, 400_000);
  });
});

describe('normalizeOpenAIUsage', () => {
  const bucket = (over = {}) => ({
    start_time: Math.floor(Date.UTC(2026, 7, 1) / 1000),
    end_time: Math.floor(Date.UTC(2026, 7, 2) / 1000),
    results: [
      { model: 'gpt-5', input_tokens: 200_000, output_tokens: 0, num_model_requests: 40, ...over },
    ],
  });

  it('carries the request count the source actually serves', () => {
    const pull = normalizeOpenAIUsage({ data: [bucket()] });
    assert.equal(pull.buckets[0].calls, 40);
  });

  it('subtracts cached tokens from the input total instead of billing them twice', () => {
    // OpenAI reports cached tokens inside input_tokens; at face value the same
    // tokens would be charged once at the full rate and once at the cache rate.
    const pull = normalizeOpenAIUsage({
      data: [bucket({ input_tokens: 200_000, input_cached_tokens: 150_000 })],
    });
    assert.equal(pull.buckets[0].inputTokens, 50_000);
    assert.equal(pull.buckets[0].cacheReadTokens, 150_000);
  });

  it('accepts epoch seconds as a window', () => {
    const pull = normalizeOpenAIUsage({ data: [bucket()] });
    assert.equal(new Date(pull.window.fromMs).toISOString(), '2026-08-01T00:00:00.000Z');
  });
});

describe('bucketedProfile', () => {
  it('keeps an unpriced model named, with its tokens, and out of the money', () => {
    const report = priced({
      data: [
        anthropicBucket(),
        {
          starting_at: '2026-08-02T00:00:00Z',
          ending_at: '2026-08-03T00:00:00Z',
          results: [{ model: 'someone-elses-model', uncached_input_tokens: 900_000, output_tokens: 10 }],
        },
      ],
    });
    assert.ok(Math.abs(report.total.totalUsd - 2) < 1e-9, 'the unpriced model adds no dollars');
    assert.equal(report.unpricedModels.length, 1);
    assert.equal(report.unpricedModels[0].model, 'someone-elses-model');
    assert.equal(report.unpricedModels[0].inputTokens, 900_000);
  });

  it('carries the day series and the span', () => {
    const report = priced({
      data: [
        anthropicBucket(),
        { ...anthropicBucket(), starting_at: '2026-08-05T00:00:00Z', ending_at: '2026-08-06T00:00:00Z' },
      ],
    });
    assert.deepEqual(report.byDay.map((d) => d.day), ['2026-08-01', '2026-08-05']);
    assert.equal(new Date(report.span.fromMs).toISOString(), '2026-08-01T00:00:00.000Z');
    assert.equal(new Date(report.span.toMs).toISOString(), '2026-08-06T00:00:00.000Z');
  });

  it('carries every unavailable finding into the report', () => {
    const report = priced({ data: [anthropicBucket()] });
    const findings = report.unavailable.map((u) => u.finding);
    assert.ok(findings.includes('truncationRetries'));
    assert.ok(findings.includes('contextPressure'));
    assert.ok(findings.includes('calls'));
  });
});

describe('bucketedCacheEconomics', () => {
  it('judges a cache that paid for itself and one that did not', () => {
    // Reads of 1M at 0.1x cost $0.50 against $5.00 as ordinary input.
    const paid = bucketedCacheEconomics(
      priced({
        data: [
          anthropicBucket({
            uncached_input_tokens: 0,
            output_tokens: 0,
            cache_read_input_tokens: 1_000_000,
          }),
        ],
      }),
    );
    assert.equal(paid.verdict, 'paid-off');
    assert.ok(Math.abs(paid.deltaUsd + 4.5) < 1e-9, String(paid.deltaUsd));

    // Writes of 1M at 2x with no reads: $10.00 against $5.00.
    const lost = bucketedCacheEconomics(
      priced({
        data: [
          anthropicBucket({
            uncached_input_tokens: 0,
            output_tokens: 0,
            cache_creation: { ephemeral_1h_input_tokens: 1_000_000 },
          }),
        ],
      }),
    );
    assert.equal(lost.verdict, 'lost-money');
    assert.ok(Math.abs(lost.deltaUsd - 5) < 1e-9, String(lost.deltaUsd));
  });

  it('carries the worst case when the source did not state the write TTL', () => {
    // 1M written flat and 900k read back: pays off at 1.25x, loses at 2x.
    const economics = bucketedCacheEconomics(
      priced({
        data: [
          anthropicBucket({
            uncached_input_tokens: 0,
            output_tokens: 0,
            cache_creation_input_tokens: 1_000_000,
            cache_read_input_tokens: 900_000,
          }),
        ],
      }),
    );
    assert.equal(economics.verdict, 'paid-off');
    assert.equal(economics.worstCaseVerdict, 'lost-money');
  });

  it('says no-cache rather than paid-off when nothing was cached', () => {
    assert.equal(bucketedCacheEconomics(priced({ data: [anthropicBucket()] })).verdict, 'no-cache');
  });
});
