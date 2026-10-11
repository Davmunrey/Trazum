import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  effectivePricing,
  isOffered,
  multipliersFor,
  parseUsageLine,
  profileUsage,
} from '../dist/index.js';

/**
 * Moonshot and xAI, re-read on 2026-10-11 from their own pages in Markdown.
 *
 * The September review read the HTML, which renders its tables in the
 * browser, and so saw no context windows and added nothing. Three facts came
 * back with the Markdown:
 *
 * - **Kimi K3 bills a cache write as its own line, by TTL**: $3.00 for a
 *   5-minute entry and $6.00 for an hour against a $3.00 input, read at $0.30.
 *   The K2 series bills no write and reads at its own hit price.
 * - **Every xAI text model has two rates split where the prompt reaches
 *   200,000 tokens**, inclusive, for the whole request. A request of exactly
 *   200,000 pays the higher rate, which is why the condition is its own kind
 *   and not "above 199,999" written by hand.
 * - **`grok-4` was retired on 2026-05-15 at 12:00 PT and has billed at Grok
 *   4.3's prices since.** A log spanning the date is billed both ways.
 *
 * Neither provider publishes a minimum prefix for its cache. Those rows carry
 * a null minimum and say so; the bill still prices their cache, and the advice
 * that would need the minimum stays quiet (providers.test.js holds that).
 */

const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
const model = (id) => {
  const found = BUNDLED_CATALOGUE.byId.get(id);
  assert.ok(found, `${id} is not in the catalogue`);
  return found;
};
const bill = (lines, on) =>
  profileUsage(lines.map((line) => JSON.stringify(line)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    ...(on ? { on } : {}),
  });
const NOW = new Date('2026-10-05T12:00:00Z');

describe('Kimi, as Moonshot publishes it', () => {
  // id: [input, cache hit, output, batch input, batch output, context]; batch null where not offered.
  const PUBLISHED = {
    'kimi-k3': [3, 0.3, 15, null, null, 1_048_576],
    'kimi-k2.7-code': [0.95, 0.19, 4, 0.57, 2.4, 262_144],
    'kimi-k2.7-code-highspeed': [1.9, 0.38, 8, null, null, 262_144],
    'kimi-k2.6': [0.95, 0.16, 4, 0.57, 2.4, 262_144],
  };

  for (const [id, [input, hit, output, batchIn, batchOut, context]] of Object.entries(PUBLISHED)) {
    it(`${id}: input, cache hit, output, batch and window`, () => {
      const m = model(id);
      const rates = effectivePricing(m, NOW, { inputTokens: 10_000 });
      const ratios = multipliersFor(m, NOW);
      close(rates.inputPerMTok, input, `${id} input`);
      close(rates.outputPerMTok, output, `${id} output`);
      close(rates.inputPerMTok * ratios.cacheRead, hit, `${id} cache hit`);
      if (batchIn === null) {
        assert.equal(ratios.batch, null, `${id} offers a batch discount the page does not`);
      } else {
        close(rates.inputPerMTok * ratios.batch, batchIn, `${id} batch input`);
        close(rates.outputPerMTok * ratios.batch, batchOut, `${id} batch output`);
      }
      assert.equal(m.contextWindow, context);
      assert.equal(m.cacheMinTokens, null, 'a minimum the page does not publish');
      assert.equal(m.tiers, undefined, 'Kimi prices by token, not by prompt length');
      assert.ok(isOffered(m));
    });
  }

  it('K3 writes at $3.00 for five minutes and $6.00 for an hour; the K2 series writes at input', () => {
    const k3 = multipliersFor(model('kimi-k3'), NOW);
    close(3 * k3.cacheWrite5m, 3, 'K3 5-minute write');
    close(3 * k3.cacheWrite1h, 6, 'K3 1-hour write');
    for (const id of ['kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6']) {
      const ratios = multipliersFor(model(id), NOW);
      assert.equal(ratios.cacheWrite5m, 1, `${id} bills a write the page says it does not`);
    }
  });

  it('bills a Chat Completions log with the cache inside the prompt, writes as writes', () => {
    // Kimi's own table: cached, written and uncached are disjoint and sum to prompt_tokens.
    const line = {
      model: 'kimi-k3',
      ts: '2026-10-05T12:00:00Z',
      usage: {
        prompt_tokens: 100_000,
        completion_tokens: 1_000,
        prompt_tokens_details: { cached_tokens: 60_000, cache_write_tokens: 30_000 },
      },
    };
    const parsed = parseUsageLine(JSON.stringify(line));
    assert.equal(parsed.inputTokens, 10_000);
    assert.equal(parsed.cacheReadTokens, 60_000);
    assert.equal(parsed.cacheWrite5mTokens, 30_000);
    const report = bill([line]);
    // 10,000 at $3, 60,000 at $0.30, 30,000 written at $3 (Kimi's default 5-minute entry), 1,000 at $15.
    close(report.total.totalUsd, 0.03 + 0.018 + 0.09 + 0.015, 'a K3 call');
    // K3 sells two entries at two prices and the line names neither, so the 5-minute default is an assumption, said.
    assert.equal(report.total.assumedWriteTtlCalls, 1);
  });

  it('bills the Messages shape on K3 by the TTL it names', () => {
    const report = bill([
      {
        model: 'kimi-k3',
        ts: '2026-10-05T12:00:00Z',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 10_000 },
        },
      },
    ]);
    close(report.total.totalUsd, 0.06, '10,000 written for an hour at $6');
    assert.equal(report.total.assumedWriteTtlCalls, 0);
  });

  it('kimi-k2 stays priced and is no longer offered', () => {
    const k2 = model('kimi-k2');
    assert.equal(isOffered(k2), false, 'a model discontinued on 2026-05-25 is still recommended');
    close(k2.inputPerMTok, 0.6, 'the last published input');
    assert.match(k2.notes, /Discontinued by Moonshot on 2026-05-25/);
  });
});

describe('Grok, as xAI publishes it', () => {
  // id: [[input, cached, output] under 200k, then at 200k and over], batch ratio or null, context.
  const PUBLISHED = {
    'grok-4.7': [[2, 0.5, 6], [4, 1, 12], null, 500_000],
    'grok-4.6': [[2, 0.5, 6], [4, 1, 12], null, 500_000],
    'grok-4.5': [[2, 0.3, 6], [4, 0.6, 12], null, 500_000],
    'grok-4.3': [[1.25, 0.2, 2.5], [2.5, 0.4, 5], 0.8, 1_000_000],
    'grok-4.20-0309-reasoning': [[1.25, 0.2, 2.5], [2.5, 0.4, 5], 0.8, 1_000_000],
    'grok-4.20-0309-non-reasoning': [[1.25, 0.2, 2.5], [2.5, 0.4, 5], 0.8, 1_000_000],
    'grok-4.20-multi-agent-0309': [[1.25, 0.2, 2.5], [2.5, 0.4, 5], 0.8, 1_000_000],
    'grok-build-0.1': [[1, 0.2, 2], [2, 0.4, 4], null, 256_000],
  };

  for (const [id, [short, long, batch, context]] of Object.entries(PUBLISHED)) {
    it(`${id}: both bands, the cached input in each, batch, the line at exactly 200,000`, () => {
      const m = model(id);
      const ratios = multipliersFor(m, NOW);
      for (const [band, size, [input, cached, output]] of [
        ['under', 199_999, short],
        ['at the line', 200_000, long],
        ['over', 500_000, long],
      ]) {
        const rates = effectivePricing(m, NOW, { inputTokens: size });
        close(rates.inputPerMTok, input, `${id} ${band} input`);
        close(rates.outputPerMTok, output, `${id} ${band} output`);
        close(rates.inputPerMTok * ratios.cacheRead, cached, `${id} ${band} cached input`);
      }
      assert.equal(ratios.batch, batch, `${id} batch`);
      assert.equal(m.contextWindow, context);
      assert.equal(m.cacheMinTokens, null);
      assert.ok(isOffered(m));
    });
  }

  it('says the line in xAI\'s words, and decides a summed row only when its whole prompt is under it', () => {
    const grok = model('grok-4.3');
    const under = effectivePricing(grok, NOW, { inputTokensAtMost: 199_999 });
    assert.equal(under.tier.decided, true);
    close(under.inputPerMTok, 1.25, 'a row under the line');
    // A row of exactly 200,000 could be one request of 200,000, which reaches the line.
    const at = effectivePricing(grok, NOW, { inputTokensAtMost: 200_000 });
    assert.equal(at.tier.decided, false, 'a row that could hold a request at the line was decided under it');
    close(at.inputPerMTok, 2.5, 'the ceiling');
    assert.deepEqual(at.tier.floor, { inputPerMTok: 1.25, outputPerMTok: 2.5 });
    assert.match(at.tier.because, /200,000 input tokens or more/);
  });

  it('bills a request at the line at the higher rate on all of it, cache included', () => {
    const report = bill([
      {
        model: 'grok-4.3',
        ts: '2026-10-05T12:00:00Z',
        usage: { prompt_tokens: 200_000, completion_tokens: 1_000, prompt_tokens_details: { cached_tokens: 150_000 } },
      },
      {
        model: 'grok-4.3',
        ts: '2026-10-05T12:01:00Z',
        usage: { prompt_tokens: 199_999, completion_tokens: 1_000, prompt_tokens_details: { cached_tokens: 150_000 } },
      },
    ]);
    // At the line: 50,000 at $2.50, 150,000 at $0.40, 1,000 at $5.
    const atLine = 0.125 + 0.06 + 0.005;
    // A token under: 49,999 at $1.25, 150,000 at $0.20, 1,000 at $2.50.
    const under = (49_999 * 1.25) / 1e6 + 0.03 + 0.0025;
    close(report.total.totalUsd, atLine + under, 'two requests a token apart');
  });
});

describe('grok-4, before and after xAI retired it', () => {
  const RETIRED = '2026-05-15T19:00:00Z';
  const call = (ts, promptTokens) => ({
    model: 'grok-4',
    ts,
    usage: { prompt_tokens: promptTokens, completion_tokens: 0 },
  });

  it('bills at $3/$15 up to the instant and at Grok 4.3\'s prices from it', () => {
    const grok = model('grok-4');
    const before = effectivePricing(grok, new Date('2026-05-15T18:59:59Z'), { inputTokens: 1_000 });
    close(before.inputPerMTok, 3, 'input before');
    close(before.outputPerMTok, 15, 'output before');
    close(before.inputPerMTok * multipliersFor(grok, new Date('2026-05-15T18:59:59Z')).cacheRead, 0.75, 'cached before');
    const after = effectivePricing(grok, new Date(RETIRED), { inputTokens: 1_000 });
    close(after.inputPerMTok, 1.25, 'input from the instant');
    close(after.outputPerMTok, 2.5, 'output from the instant');
    close(after.inputPerMTok * multipliersFor(grok, new Date(RETIRED)).cacheRead, 0.2, 'cached from the instant');
  });

  it('carries 4.3\'s long-context line only in the period it bills at 4.3', () => {
    const grok = model('grok-4');
    close(effectivePricing(grok, new Date('2026-05-01T00:00:00Z'), { inputTokens: 250_000 }).inputPerMTok, 3, 'before: one rate');
    close(effectivePricing(grok, new Date('2026-06-01T00:00:00Z'), { inputTokens: 250_000 }).inputPerMTok, 2.5, 'after: 4.3 long');
  });

  it('bills a log that spans the retirement both ways, and the dated id with it', () => {
    const report = bill(
      [
        call('2026-05-15T18:59:59Z', 100_000),
        { ...call('2026-05-15T19:00:00Z', 100_000), model: 'grok-4-0709' },
      ],
      new Date('2026-10-05T12:00:00Z'),
    );
    // 100,000 tokens either side, under 4.3's line: $0.30 at $3, then $0.125 at $1.25.
    close(report.total.totalUsd, 0.3 + 0.125, 'the same prompt either side of the instant');
  });

  it('is no longer offered', () => {
    assert.equal(isOffered(model('grok-4')), false);
  });
});
