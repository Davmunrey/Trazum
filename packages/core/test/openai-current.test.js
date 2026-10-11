import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  effectivePricing,
  multipliersFor,
  normalizeOpenAIUsage,
  openaiUsageRecords,
  parseUsageLine,
  profileUsage,
} from '../dist/index.js';

/**
 * OpenAI's current generation, and the API it is called through.
 *
 * Three facts, each off OpenAI's own pages (pricing, every model's page and
 * the prompt-caching guide, read 2026-10-10 and 2026-10-11):
 *
 * - **The Responses API reports usage as `input_tokens` with the cached
 *   tokens inside it**, broken out in `input_tokens_details`. Only the Chat
 *   Completions spelling (`prompt_tokens_details`) was read, so a Responses
 *   log, OpenAI's default API, billed every cached token at the full input
 *   rate and said caching was never used.
 * - **GPT-5.6 and later bill cache writes**, at 1.25x input, reported as
 *   `cache_write_tokens` inside the same total, and an entry lives at least
 *   30 minutes with no longer one to buy.
 * - **Over 272,000 input tokens a request costs 2x input and cache and 1.5x
 *   output**, for the whole request.
 */

const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
const bill = (lines) =>
  profileUsage(lines.map((line) => JSON.stringify(line)).join('\n'), { catalogue: BUNDLED_CATALOGUE });

describe('a Responses API usage object', () => {
  it('takes the cached tokens out of input_tokens, as the Chat Completions shape always did', () => {
    const parsed = parseUsageLine(
      JSON.stringify({
        model: 'gpt-5',
        usage: {
          input_tokens: 100_000,
          output_tokens: 1_000,
          input_tokens_details: { cached_tokens: 90_000 },
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 101_000,
        },
      }),
    );
    assert.equal(parsed.inputTokens, 10_000, 'cached tokens were billed as plain input');
    assert.equal(parsed.cacheReadTokens, 90_000);
    const report = bill([
      {
        model: 'gpt-5',
        ts: '2026-10-05T12:00:00Z',
        usage: { input_tokens: 100_000, output_tokens: 1_000, input_tokens_details: { cached_tokens: 90_000 } },
      },
    ]);
    // 10,000 at $1.25, 90,000 at $0.125, 1,000 at $10.
    close(report.total.totalUsd, 0.0125 + 0.01125 + 0.01, 'a Responses call on GPT-5');
  });

  it('takes the cache writes out too, and bills them as writes', () => {
    const parsed = parseUsageLine(
      JSON.stringify({
        model: 'gpt-6-astra',
        usage: {
          input_tokens: 100_000,
          output_tokens: 1_000,
          input_tokens_details: { cached_tokens: 50_000, cache_write_tokens: 10_000 },
        },
      }),
    );
    assert.equal(parsed.inputTokens, 40_000);
    assert.equal(parsed.cacheReadTokens, 50_000);
    assert.equal(parsed.cacheWrite5mTokens, 10_000);
    assert.equal(parsed.writeTtlKnown, true, 'an OpenAI write has one TTL, and nothing was assumed');
  });
});

describe('GPT-5.6 and later, as OpenAI publishes them', () => {
  // id: [input, cached, write, output] short, then long; batch is half of each.
  const PUBLISHED = {
    'gpt-6-astra': [[10, 1, 12.5, 50], [20, 2, 25, 75]],
    'gpt-6.1-sol': [[2, 0.1, 2.5, 10], [4, 0.2, 5, 15]],
    'gpt-6-sol': [[2, 0.2, 2.5, 10], [4, 0.4, 5, 15]],
    'gpt-6-luna': [[0.1, 0.01, 0.125, 0.5], [0.2, 0.02, 0.25, 0.75]],
    'gpt-5.6-sol': [[4, 0.4, 5, 20], [8, 0.8, 10, 30]],
    'gpt-5.6-terra': [[2, 0.2, 2.5, 12], [4, 0.4, 5, 18]],
    'gpt-5.6-luna': [[0.2, 0.02, 0.25, 1.2], [0.4, 0.04, 0.5, 1.8]],
  };
  const at = new Date('2026-10-05T12:00:00Z');

  for (const [id, [short, long]] of Object.entries(PUBLISHED)) {
    it(`${id}: both bands, the cache read and write, batch, the line at 272,000`, () => {
      const model = BUNDLED_CATALOGUE.byId.get(id);
      assert.ok(model, `${id} is not in the catalogue`);
      const m = multipliersFor(model, at);
      for (const [band, size, [input, cached, write, output]] of [
        ['short', 272_000, short],
        ['long', 272_001, long],
      ]) {
        const rates = effectivePricing(model, at, { inputTokens: size });
        close(rates.inputPerMTok, input, `${id} ${band} input`);
        close(rates.outputPerMTok, output, `${id} ${band} output`);
        close(rates.inputPerMTok * m.cacheRead, cached, `${id} ${band} cached input`);
        close(rates.inputPerMTok * m.cacheWrite5m, write, `${id} ${band} cache write`);
        close(rates.outputPerMTok * m.batch, output / 2, `${id} ${band} batch output`);
      }
      assert.equal(model.contextWindow, 1_050_000);
      assert.equal(model.cacheMinTokens, 1024);
      assert.deepEqual(model.cacheTtl, { writeMs: 30 * 60_000, longerMs: null });
    });
  }

  it('bills a long request at the long band on all of it, cache included', () => {
    const report = bill([
      {
        model: 'gpt-6-astra',
        ts: '2026-10-05T12:00:00Z',
        usage: {
          input_tokens: 300_000,
          output_tokens: 1_000,
          input_tokens_details: { cached_tokens: 200_000, cache_write_tokens: 50_000 },
        },
      },
    ]);
    // 50,000 uncached at $20, 200,000 cached at $2, 50,000 written at $25, 1,000 out at $75.
    close(report.total.totalUsd, 1 + 0.4 + 1.25 + 0.075, 'a long GPT-6 Astra request');
  });
});

describe('a cache entry that lives thirty minutes', () => {
  const session = (model, gapMinutes) =>
    [0, 1, 2].map((turn) => ({
      model,
      session: 's1',
      label: 'agent',
      ts: new Date(Date.UTC(2026, 9, 5, 12, turn * gapMinutes)).toISOString(),
      usage:
        model.startsWith('gpt')
          ? { input_tokens: 5_000, output_tokens: 100, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 4_000 } }
          : {
              input_tokens: 1_000,
              output_tokens: 100,
              cache_creation: { ephemeral_5m_input_tokens: 4_000, ephemeral_1h_input_tokens: 0 },
            },
    }));

  it('outlives a ten-minute pause on GPT-6 Sol, where a five-minute entry would not', () => {
    const openai = bill(session('gpt-6-sol', 10)).cacheTtlFit[0];
    assert.equal(openai.verdict, 'fits', 'a 30-minute entry was judged against five minutes');
    assert.equal(openai.entryTtlMs, 30 * 60_000);
    assert.equal(openai.longerTtlMs, null);
    const anthropic = bill(session('claude-sonnet-5-5', 10)).cacheTtlFit[0];
    assert.equal(anthropic.verdict, 'expires-before-reuse');
    assert.equal(anthropic.longerTtlMs, 60 * 60_000);
  });

  it('and expires on a forty-five minute one, with no longer entry to suggest', () => {
    const fit = bill(session('gpt-6-sol', 45)).cacheTtlFit[0];
    assert.equal(fit.verdict, 'expires-before-reuse');
    assert.equal(fit.longerTtlMs, null);
  });
});

describe('the usage report, through both doors', () => {
  const report = (over = {}) =>
    JSON.stringify({
      object: 'page',
      data: [
        {
          object: 'bucket',
          start_time: 1_759_622_400,
          end_time: 1_759_708_800,
          results: [
            {
              object: 'organization.usage.completions.result',
              model: 'gpt-6-sol',
              input_tokens: 1_000,
              input_cached_tokens: 400,
              input_cache_write_tokens: 75,
              input_cache_write_12h_tokens: 25,
              input_uncached_tokens: 500,
              output_tokens: 500,
              num_model_requests: 5,
              batch: false,
              service_tier: 'default',
              ...over,
            },
          ],
        },
      ],
      has_more: false,
    });

  it('from-openai writes the 30-minute write where it is priced and names the 12-hour one', () => {
    const conversion = openaiUsageRecords(report());
    assert.deepEqual(conversion.records[0].usage.prompt_tokens_details, { cached_tokens: 400, cache_write_tokens: 75 });
    assert.equal(conversion.cacheWrite12hTokens, 25);
    const parsed = parseUsageLine(JSON.stringify(conversion.records[0]));
    // 500 uncached and the 25 twelve-hour tokens, priced as plain input: a floor, named.
    assert.equal(parsed.inputTokens, 525);
    assert.equal(parsed.cacheWrite5mTokens, 75);
  });

  it('connect does the same with the bucket', () => {
    const pull = normalizeOpenAIUsage(JSON.parse(report()));
    const bucket = pull.buckets[0];
    assert.equal(bucket.inputTokens, 525);
    assert.equal(bucket.cacheReadTokens, 400);
    assert.equal(bucket.cacheWrite5mTokens, 75);
  });
});
