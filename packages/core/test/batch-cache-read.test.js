import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUNDLED_CATALOGUE,
  catalogueFromOverlay,
  effectivePricing,
  multipliersFor,
  parsePricingOverlay,
  profileUsage,
} from '../dist/index.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../src');

/**
 * What a batch call's cache reads cost.
 *
 * A batch call was billed at the row's batch ratio on input and output, and
 * its cache reads at the row's cache ratio of that halved input. That is what
 * most Batch tables print, and not what three of Google's do. The Batch tab
 * of Gemini 3.1 Pro Preview reads "Context caching price: Same as Standard",
 * and the tabs of Gemini 2.5 Pro and 2.5 Flash print the standard figures
 * without saying so. On those three a batch call's cache reads were billed at
 * half of what Google charges: a bill that was too low, which is the
 * direction this product refuses.
 *
 * Every figure below is the paid-tier cell of Google's pricing page
 * (aistudio.google.com/docs/pricing), read 2026-11-17, in dollars per million
 * tokens: the Standard tab's cache price, then the Batch tab's input and
 * cache prices.
 */
const NOVEMBER = new Date('2026-11-17T12:00:00Z');
const PAGE = [
  // id, standard cache, batch input, batch cache
  ['gemini-4-carbon', 0.1, 1, 0.05],
  ['gemini-4-argon', 0.1, 1, 0.05],
  ['gemini-4-hydrogen', 0.075, 0.75, 0.0375],
  ['gemini-3.8-flash', 0.075, 0.375, 0.0375],
  ['gemini-3.6-flash', 0.075, 0.375, 0.0375],
  ['gemini-3.5-flash-lite', 0.03, 0.15, 0.015],
  ['gemini-3.1-pro-preview', 0.2, 1, 0.2],
  ['gemini-2.5-pro', 0.125, 0.625, 0.125],
  ['gemini-2.5-flash', 0.03, 0.15, 0.03],
];
const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
const row = (id) => BUNDLED_CATALOGUE.byId.get(id);
/** The cache-read price of a call, per million tokens, as every cost path computes it. */
const cachePrice = (id, on, how = {}) => {
  const rates = effectivePricing(row(id), on, how);
  return rates.inputPerMTok * multipliersFor(row(id), on, rates).cacheRead;
};
const bill = (records, on = NOVEMBER) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), { catalogue: BUNDLED_CATALOGUE, on });

describe('a batch call\'s cache reads on Google', () => {
  it('cost what each row\'s Batch tab prints, for all nine rows', () => {
    const google = BUNDLED_CATALOGUE.models.filter((model) => model.provider === 'google').map((model) => model.id);
    assert.deepEqual([...google].sort(), PAGE.map(([id]) => id).sort(), 'a Google row has no figures from the page here');
    for (const [id, standardCache, batchInput, batchCache] of PAGE) {
      // A 100,000-token prompt: under every row's long-prompt band, where one has it.
      const prompt = { inputTokens: 100_000 };
      near(cachePrice(id, NOVEMBER, prompt), standardCache, `${id} standard cache`);
      near(effectivePricing(row(id), NOVEMBER, { ...prompt, batch: true }).inputPerMTok, batchInput, `${id} batch input`);
      near(cachePrice(id, NOVEMBER, { ...prompt, batch: true }), batchCache, `${id} batch cache`);
    }
  });

  it('are not halved where the tab says "Same as Standard", in both of 3.1 Pro Preview\'s bands', () => {
    // Up to 200k: batch input $1.00, cache $0.20. Over it: $2.00 and $0.40.
    near(cachePrice('gemini-3.1-pro-preview', NOVEMBER, { batch: true, inputTokens: 100_000 }), 0.2, 'short prompt');
    near(cachePrice('gemini-3.1-pro-preview', NOVEMBER, { batch: true, inputTokens: 300_000 }), 0.4, 'long prompt');
    near(cachePrice('gemini-3.1-pro-preview', NOVEMBER, { inputTokens: 300_000 }), 0.4, 'long prompt, standard');
  });

  it('change the bill by exactly the half that was missing', () => {
    /**
     * One batch call on 3.1 Pro Preview: 50,000 fresh input, 100,000 read from
     * the cache, 2,000 out, a 150,000-token prompt. At the Batch tab's prices,
     * $1.00, $0.20 and $6.00 per million:
     *   0.05 x 1.00 + 0.1 x 0.20 + 0.002 x 6.00 = 0.05 + 0.02 + 0.012 = $0.082.
     * Until now the read was billed at $0.10: $0.072.
     */
    const call = {
      model: 'gemini-3.1-pro-preview',
      ts: '2026-11-17T10:00:00Z',
      batch: true,
      usage: { input_tokens: 50_000, cache_read_input_tokens: 100_000, output_tokens: 2_000 },
    };
    const report = bill([call]);
    near(report.total.totalUsd, 0.082, 'the batch call');
    near(report.total.cacheReadUsd, 0.02, 'its cache read');
    // The same call off the Batch API: 0.05 x 2 + 0.1 x 0.20 + 0.002 x 12 = $0.144.
    const { batch: _batch, ...standard } = call;
    near(bill([standard]).total.totalUsd, 0.144, 'the standard call');
  });

  it('follow the two 2.5 models to their targets\' Batch tabs on 2026-12-01', () => {
    /**
     * Google routes `gemini-2.5-pro` to Gemini 3.8 Flash and `gemini-2.5-flash`
     * to Gemini 3.5 Flash-Lite from that day, each "billed at" its target's
     * rates, and both targets' Batch tabs halve the cache price.
     */
    const lastMinute = new Date('2026-11-30T23:59:59Z');
    const firstMinute = new Date('2026-12-01T00:00:00Z');
    near(cachePrice('gemini-2.5-pro', lastMinute, { batch: true }), 0.125, '2.5 Pro, its own tab');
    near(cachePrice('gemini-2.5-pro', firstMinute, { batch: true }), 0.0375, '2.5 Pro at 3.8 Flash rates');
    near(cachePrice('gemini-2.5-flash', lastMinute, { batch: true }), 0.03, '2.5 Flash, its own tab');
    near(cachePrice('gemini-2.5-flash', firstMinute, { batch: true }), 0.015, '2.5 Flash at 3.5 Flash-Lite rates');
    // Nothing else about 2.5 Flash moves that day.
    for (const at of [lastMinute, firstMinute]) {
      near(effectivePricing(row('gemini-2.5-flash'), at).inputPerMTok, 0.3, '2.5 Flash input');
      near(effectivePricing(row('gemini-2.5-flash'), at).outputPerMTok, 2.5, '2.5 Flash output');
      near(cachePrice('gemini-2.5-flash', at), 0.03, '2.5 Flash standard cache');
    }

    // A log that spans the day is billed both ways: 1M read on each side, as batch calls.
    const read = (ts) => ({ model: 'gemini-2.5-pro', ts, batch: true, usage: { input_tokens: 0, cache_read_input_tokens: 1_000_000, output_tokens: 0 } });
    near(bill([read('2026-11-30T23:00:00Z'), read('2026-12-01T01:00:00Z')]).total.cacheReadUsd, 0.125 + 0.0375, 'across the day');
  });
});

describe('everywhere else', () => {
  it('a batch call still reads the cache at the row\'s own share of the batch input', () => {
    // Anthropic and OpenAI print it that way. Opus 5: $5 input, $2.50 on batch, read at 10%.
    const opus = row('claude-opus-5');
    const standard = multipliersFor(opus, NOVEMBER);
    assert.equal(multipliersFor(opus, NOVEMBER, { batch: true }), standard, 'a row with no Batch-tab figure answered differently for a batch call');
    for (const model of BUNDLED_CATALOGUE.models) {
      const declared = model.multipliers?.batchCacheRead !== undefined
        || (model.history ?? []).some((period) => period.multipliers?.batchCacheRead !== undefined);
      if (declared) continue;
      assert.equal(
        multipliersFor(model, NOVEMBER, { batch: true }).cacheRead,
        multipliersFor(model, NOVEMBER).cacheRead,
        `${model.id} reads the cache differently on batch with nothing in its row saying so`,
      );
    }
    // And only the three rows the page gives a reason for say so.
    const declaring = BUNDLED_CATALOGUE.models
      .filter((model) => model.multipliers?.batchCacheRead !== undefined
        || (model.history ?? []).some((period) => period.multipliers?.batchCacheRead !== undefined))
      .map((model) => model.id);
    assert.deepEqual(declaring.sort(), ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3.1-pro-preview']);
  });

  it('a standard call never takes the batch figure', () => {
    for (const how of [undefined, {}, { batch: false }, { inputTokens: 10 }]) {
      near(multipliersFor(row('gemini-3.1-pro-preview'), NOVEMBER, how).cacheRead, 0.1, JSON.stringify(how));
    }
    near(multipliersFor(row('gemini-3.1-pro-preview'), NOVEMBER, { batch: true }).cacheRead, 0.2, 'batch');
    // The other ratios are the row's, whichever way the call ran.
    const batch = multipliersFor(row('gemini-3.1-pro-preview'), NOVEMBER, { batch: true });
    assert.deepEqual(
      { ...batch, cacheRead: 0.1 },
      { ...multipliersFor(row('gemini-3.1-pro-preview'), NOVEMBER) },
    );
  });

  it('a row with no Batch API ignores the figure, as it ignores the batch flag', () => {
    const catalogue = catalogueFromOverlay(
      JSON.stringify({
        lastReviewed: '2026-11-17',
        models: { 'gemini-3.1-pro-preview': { multipliers: { cacheRead: 0.1, cacheWrite5m: 1, cacheWrite1h: 1, batch: null, batchCacheRead: 0.2 } } },
      }),
    );
    const model = catalogue.byId.get('gemini-3.1-pro-preview');
    const rates = effectivePricing(model, NOVEMBER, { batch: true });
    assert.equal(rates.batch, undefined, 'a row with no batch rate priced a call as batch');
    near(multipliersFor(model, NOVEMBER, rates).cacheRead, 0.1, 'cache read');
    near(multipliersFor(model, NOVEMBER, { batch: true }).cacheRead, 0.1, 'cache read, asked directly');
  });
});

describe('the overlay', () => {
  const overlay = (multipliers) =>
    JSON.stringify({ lastReviewed: '2026-11-17', models: { 'gemini-3.8-flash': { multipliers } } });

  it('can say a Batch table charges the cache differently', () => {
    const catalogue = catalogueFromOverlay(overlay({ cacheRead: 0.1, batch: 0.5, batchCacheRead: 0.2 }));
    const model = catalogue.byId.get('gemini-3.8-flash');
    near(multipliersFor(model, NOVEMBER, { batch: true }).cacheRead, 0.2, 'from the overlay');
    near(multipliersFor(model, NOVEMBER).cacheRead, 0.1, 'standard');
  });

  it('refuses a free or negative batch cache read, and a mistyped key', () => {
    for (const bad of [0, -0.1, '0.2', null]) {
      assert.throws(() => parsePricingOverlay(overlay({ batchCacheRead: bad })), /PricingOverlayError/, JSON.stringify(bad));
    }
    assert.throws(() => parsePricingOverlay(overlay({ batchCacheread: 0.2 })), /PricingOverlayError/);
  });
});

describe('every figure priced from a record', () => {
  it('asks for the ratios of the call it priced', () => {
    /**
     * The bill and each finding under it price a record: the total, a session's
     * cost, a truncated retry, a repeat, a conversation's growth. A finding that
     * priced a batch call's cache read at the standard ratio would disagree
     * with the total it sits under, so no file may price a record with
     * `effectivePricing(model, at, ...)` and then ask for the ratios without
     * saying how the call ran.
     */
    const offenders = [];
    let asked = 0;
    for (const name of readdirSync(SRC).filter((file) => file.endsWith('.ts'))) {
      const source = readFileSync(join(SRC, name), 'utf8');
      // The files that price one record or one bucket of them: they hold its context.
      if (!/promptSizeOf\(/.test(source) && !/effectivePricing\(\s*model,\s*at,/.test(source)) continue;
      if (name === 'billing.ts') continue;
      for (const match of source.matchAll(/multipliersFor\(model, at([^()]*)\)/g)) {
        asked += 1;
        if (match[1].trim() === '') offenders.push(`${name}: multipliersFor(model, at)`);
      }
    }
    assert.ok(asked >= 9, `only ${asked} dated lookups found: the scan no longer sees the cost paths`);
    assert.deepEqual(offenders, [], 'a record is priced without saying how its call ran');
  });
});
