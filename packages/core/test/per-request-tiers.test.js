import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  anthropicUsageRecords,
  bucketedProfile,
  effectivePricing,
  multipliersFor,
  normalizeAnthropicUsage,
  normalizeOpenAIUsage,
  openaiUsageRecords,
  profileUsage,
} from '../dist/index.js';

/**
 * A model priced by prompt length, billed one request at a time.
 *
 * Claude Haiku 5.5 is the first such model in the catalogue. Anthropic's
 * pricing page, read 2026-10-10: $0.10/$0.50 for a prompt up to 100,000
 * tokens and $0.50/$2.50 over it, the length counting every input token the
 * request carried, cache reads and writes included, "each request priced on
 * its own". It waited for this change, because nothing that priced a usage
 * log passed one request's prompt to `effectivePricing`, and every call would
 * have fallen to the dearer rate: five times what most of them paid.
 *
 * Two kinds of record reach the pricing. A call says its own prompt, and is
 * decided. A row out of a usage report sums requests and says only a bound:
 * no request in it was larger than the whole row. A row at or under the line
 * is therefore decided too; a row over it is not, is billed at the dearer
 * rate, and carries what the same tokens cost at the cheaper one, so a report
 * can print the range rather than a ceiling it does not explain.
 */

const HAIKU = BUNDLED_CATALOGUE.byId.get('claude-haiku-5-5');
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
const line = (usage, extra = {}) =>
  JSON.stringify({ model: 'claude-haiku-5-5', ts: '2026-10-05T12:00:00Z', usage, ...extra });

describe('Claude Haiku 5.5, as Anthropic publishes it', () => {
  it('is priced, with both bands and the ratios the page lists', () => {
    assert.ok(HAIKU, 'claude-haiku-5-5 is not in the catalogue');
    const at = new Date('2026-10-05T12:00:00Z');
    const short = effectivePricing(HAIKU, at, { inputTokens: 1_000 });
    const long = effectivePricing(HAIKU, at, { inputTokens: 200_000 });
    assert.deepEqual([short.inputPerMTok, short.outputPerMTok], [0.1, 0.5]);
    assert.deepEqual([long.inputPerMTok, long.outputPerMTok], [0.5, 2.5]);

    const m = multipliersFor(HAIKU, at);
    // Hits $0.01 and $0.05, writes $0.125/$0.20 and $0.625/$1, batch half.
    close(short.inputPerMTok * m.cacheRead, 0.01, 'cache hit, short');
    close(long.inputPerMTok * m.cacheRead, 0.05, 'cache hit, long');
    close(short.inputPerMTok * m.cacheWrite5m, 0.125, '5m write, short');
    close(long.inputPerMTok * m.cacheWrite5m, 0.625, '5m write, long');
    close(short.inputPerMTok * m.cacheWrite1h, 0.2, '1h write, short');
    close(long.inputPerMTok * m.cacheWrite1h, 1, '1h write, long');
    close(long.outputPerMTok * m.batch, 1.25, 'batch output, long');
    assert.equal(HAIKU.contextWindow, 1_000_000);
    assert.equal(HAIKU.cacheMinTokens, 512);
  });

  it('draws the line where the page does: over 100,000, not at it', () => {
    const at = new Date('2026-10-05T12:00:00Z');
    assert.equal(effectivePricing(HAIKU, at, { inputTokens: 100_000 }).tier.applied, null);
    assert.equal(effectivePricing(HAIKU, at, { inputTokens: 100_001 }).tier.applied, 'over-100k');
  });
});

describe('Gemini 3.1 Pro Preview, as Google publishes it', () => {
  it('is priced in two bands with the ratios the page lists, under both of its ids', () => {
    const pro = BUNDLED_CATALOGUE.byId.get('gemini-3.1-pro-preview');
    assert.ok(pro, 'gemini-3.1-pro-preview is not in the catalogue');
    assert.equal(BUNDLED_CATALOGUE.byId.get('gemini-3.1-pro-preview-customtools'), pro);
    const at = new Date('2026-10-05T12:00:00Z');
    const short = effectivePricing(pro, at, { inputTokens: 200_000 });
    const long = effectivePricing(pro, at, { inputTokens: 200_001 });
    assert.deepEqual([short.inputPerMTok, short.outputPerMTok], [2, 12]);
    assert.deepEqual([long.inputPerMTok, long.outputPerMTok], [4, 18]);
    const m = multipliersFor(pro, at);
    // Cache $0.20 and $0.40; batch $1/$6 and $2/$9.
    close(short.inputPerMTok * m.cacheRead, 0.2, 'cache, short');
    close(long.inputPerMTok * m.cacheRead, 0.4, 'cache, long');
    close(short.outputPerMTok * m.batch, 6, 'batch output, short');
    close(long.outputPerMTok * m.batch, 9, 'batch output, long');
    assert.equal(pro.contextWindow, 1_048_576);
    assert.equal(pro.cacheMinTokens, 4096);
  });
});

describe('a bound decides when it can and says so when it cannot', () => {
  const at = new Date('2026-10-05T12:00:00Z');

  it('a row whose whole prompt is under the line is under it, request by request', () => {
    const rates = effectivePricing(HAIKU, at, { inputTokensAtMost: 60_000 });
    assert.equal(rates.inputPerMTok, 0.1);
    assert.equal(rates.tier.decided, true);
    assert.equal(rates.tier.floor, undefined);
  });

  it('a row over the line is a ceiling, with the floor beside it and the reason in words', () => {
    const rates = effectivePricing(HAIKU, at, { inputTokensAtMost: 5_000_000 });
    assert.equal(rates.inputPerMTok, 0.5, 'an undecided row was billed at the cheaper rate');
    assert.equal(rates.tier.decided, false);
    assert.deepEqual(rates.tier.floor, { inputPerMTok: 0.1, outputPerMTok: 0.5 });
    assert.match(rates.tier.because, /100,000 input tokens/);
    assert.match(rates.tier.because, /sums requests/);
  });

  it('never reads a bound as a size', () => {
    /*
      The tempting mistake. A day of 2,000 short prompts sums far past 100,000
      tokens without one request getting near it; reading the sum as a size
      would bill every one of them at five times its price, decided.
    */
    const rates = effectivePricing(HAIKU, at, { inputTokensAtMost: 2_000 * 900 });
    assert.equal(rates.tier.decided, false, 'a sum was taken for one prompt');
  });
});

describe('a usage log, priced one request at a time', () => {
  it('bills each call on its own prompt, cache reads and writes counted', () => {
    const log = [
      // 10,000 + 80,000 read = 90,000: under the line.
      line({ input_tokens: 10_000, cache_read_input_tokens: 80_000, output_tokens: 2_000 }),
      // 20,000 + 100,000 read = 120,000: over it, though only 20,000 were new.
      line({ input_tokens: 20_000, cache_read_input_tokens: 100_000, output_tokens: 2_000 }),
      // 1,000 + 150,000 written = 151,000: a write counts toward the length too.
      line({
        input_tokens: 1_000,
        output_tokens: 0,
        cache_creation: { ephemeral_5m_input_tokens: 150_000, ephemeral_1h_input_tokens: 0 },
      }),
    ].join('\n');
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    const under = 0.001 + 0.0008 + 0.001;
    const over = 0.01 + 0.005 + 0.005;
    const written = 0.0005 + 0.09375;
    close(report.total.totalUsd, under + over + written, 'total');
    assert.equal(report.total.tierCeilingCalls, 0, 'a call that said its prompt was billed at a ceiling');
    assert.equal(report.total.tierCeilingUsd, 0);
  });

  it('bills a summed row at the dearer rate, and keeps what it would be at the cheaper', () => {
    const log = [
      line({ input_tokens: 400_000, cache_read_input_tokens: 1_000_000, output_tokens: 50_000 }, { requests: null }),
      // Seven requests, 30,000 tokens between them: every one was under.
      line({ input_tokens: 30_000, output_tokens: 5_000 }, { requests: 7 }),
    ].join('\n');
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    const ceiling = 0.2 + 0.05 + 0.125;
    const floor = 0.04 + 0.01 + 0.025;
    const decided = 0.003 + 0.0025;
    close(report.total.totalUsd, ceiling + decided, 'total');
    assert.equal(report.total.tierCeilingCalls, 1);
    close(report.total.tierCeilingUsd, ceiling, 'ceiling');
    close(report.total.tierFloorUsd, floor, 'floor');
    const model = report.byModel.find((row) => row.model === 'claude-haiku-5-5');
    assert.equal(model.breakdown.tierCeilingCalls, 1, 'the per-model slice lost the ceiling');
  });

  it('reads `requests` only when it is that field', () => {
    // A string, a zero and a fraction are somebody else's `requests`: one call.
    for (const requests of ['5', 0, 2.5, true]) {
      const report = profileUsage(
        line({ input_tokens: 400_000, output_tokens: 0 }, { requests }),
        { catalogue: BUNDLED_CATALOGUE },
      );
      assert.equal(report.total.tierCeilingCalls, 0, `requests: ${JSON.stringify(requests)} made a sum`);
      close(report.total.totalUsd, 0.2, `requests: ${JSON.stringify(requests)}`);
    }
  });

  it('carries a usage report through as sums, so its rows are ceilings, not decisions', () => {
    const { records } = anthropicUsageRecords(JSON.stringify({
      has_more: false,
      next_page: null,
      data: [
        {
          starting_at: '2026-10-05T00:00:00Z',
          ending_at: '2026-10-06T00:00:00Z',
          results: [{ model: 'claude-haiku-5-5', uncached_input_tokens: 400_000, output_tokens: 50_000 }],
        },
      ],
    }));
    const report = profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), { catalogue: BUNDLED_CATALOGUE });
    assert.equal(report.total.tierCeilingCalls, 1);
    close(report.total.tierCeilingUsd, 0.2 + 0.125, 'ceiling');
    close(report.total.tierFloorUsd, 0.04 + 0.025, 'floor');
  });

  it('and an OpenAI bucket of one request is one call', () => {
    const { records } = openaiUsageRecords(JSON.stringify({
      object: 'page',
      data: [
        {
          object: 'bucket',
          start_time: 1_759_622_400,
          end_time: 1_759_708_800,
          results: [
            {
              object: 'organization.usage.completions.result',
              model: 'claude-haiku-5-5',
              input_tokens: 150_000,
              output_tokens: 1_000,
              num_model_requests: 1,
            },
          ],
        },
      ],
    }));
    assert.equal(records[0].requests, undefined, 'a bucket of one request was written as a sum');
    const report = profileUsage(JSON.stringify(records[0]), { catalogue: BUNDLED_CATALOGUE });
    assert.equal(report.total.tierCeilingCalls, 0);
    close(report.total.totalUsd, 0.075 + 0.0025, 'one request over the line, decided');
  });
});

describe('a connected report, bucket by bucket', () => {
  const anthropic = (results, start = '2026-10-05T00:00:00Z', end = '2026-10-06T00:00:00Z') => ({
    data: [{ starting_at: start, ending_at: end, results }],
    has_more: false,
    next_page: null,
  });

  it('bills a bucket that sums requests at the ceiling and keeps the floor', () => {
    const report = bucketedProfile(
      normalizeAnthropicUsage(
        anthropic([{ model: 'claude-haiku-5-5', uncached_input_tokens: 400_000, output_tokens: 50_000 }]),
      ),
      { catalogue: BUNDLED_CATALOGUE },
    );
    const slice = report.byModel.find((s) => s.model === 'claude-haiku-5-5');
    assert.equal(slice.tierCeilingBuckets, 1);
    close(slice.tierCeilingUsd, 0.325, 'ceiling');
    close(slice.tierFloorUsd, 0.065, 'floor');
    close(report.total.totalUsd, 0.325, 'the total is the ceiling');
  });

  it('decides a bucket of exactly one request', () => {
    const report = bucketedProfile(
      normalizeOpenAIUsage({
        object: 'page',
        data: [
          {
            object: 'bucket',
            start_time: 1_759_622_400,
            end_time: 1_759_708_800,
            results: [{ model: 'claude-haiku-5-5', input_tokens: 150_000, output_tokens: 1_000, num_model_requests: 1 }],
          },
        ],
      }),
      { catalogue: BUNDLED_CATALOGUE },
    );
    const slice = report.byModel.find((s) => s.model === 'claude-haiku-5-5');
    assert.equal(slice.tierCeilingBuckets, 0);
    close(slice.totalUsd, 0.075 + 0.0025, 'one request over the line');
  });

  it('bills each bucket at its own date, not the day the report ran', () => {
    /*
      The bug `profile` lost in 2.4.3 and this path kept: every bucket priced
      at the report's date, so a pull across a published price change came out
      entirely at whichever price applied the day it ran.
    */
    const repriced = {
      id: 'repriced',
      displayName: 'Repriced',
      inputPerMTok: 1,
      outputPerMTok: 1,
      contextWindow: 100_000,
      cacheMinTokens: 1024,
      capability: 'mid',
      tier: 'sonnet',
      history: [{ until: '2026-09-10T00:00:00Z', inputPerMTok: 3, outputPerMTok: 3 }],
    };
    const catalogue = {
      models: [repriced],
      byId: new Map([[repriced.id, repriced]]),
      lastReviewed: '2026-10-11',
      overriddenModels: [],
      addedModels: [],
    };
    const pull = normalizeAnthropicUsage({
      data: [
        {
          starting_at: '2026-09-01T00:00:00Z',
          ending_at: '2026-09-02T00:00:00Z',
          results: [{ model: 'repriced', uncached_input_tokens: 1_000_000, output_tokens: 0 }],
        },
        {
          starting_at: '2026-09-20T00:00:00Z',
          ending_at: '2026-09-21T00:00:00Z',
          results: [{ model: 'repriced', uncached_input_tokens: 1_000_000, output_tokens: 0 }],
        },
      ],
      has_more: false,
      next_page: null,
    });
    const report = bucketedProfile(pull, { catalogue, on: new Date('2026-10-11T00:00:00Z') });
    close(report.total.totalUsd, 3 + 1, 'each bucket at its own price');
  });
});
