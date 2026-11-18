import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, MODELS, multipliersFor, profileUsage } from '../dist/index.js';

/**
 * The lines of a bill that are said apart from its total.
 *
 * Every test here exists because mutation testing changed a line of `add` in
 * `usage.ts`, where a record's tokens are multiplied by its rates, and nothing
 * failed (#745). The totals were held; the figures a report prints beside them
 * were not: what the batch calls cost, what the undecided band could cost
 * each way, what cut-off answers cost, and how many searches had no price.
 * Each rule is quoted from the field's own comment in `usage.ts`, and each
 * expected figure is either another line of the same bill or one of the
 * catalogue's numbers read here from the row.
 */

const ON = new Date('2026-11-10T12:00:00Z');
const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-12, `${what}: ${actual}, expected ${expected}`);
const line = (model, usage, extra = {}) => JSON.stringify({ model, timestamp: ON.toISOString(), ...extra, usage });
const bill = (...lines) => profileUsage(lines.join('\n'), { catalogue: BUNDLED_CATALOGUE, on: ON }).total;
const tokenLines = (total) => total.inputUsd + total.cacheReadUsd + total.cacheWriteUsd + total.outputUsd;
/** Every kind of token at once, so a rate applied to the wrong kind shows. */
const USAGE = {
  input_tokens: 300_000,
  output_tokens: 40_000,
  cache_read_input_tokens: 500_000,
  cache_creation: { ephemeral_5m_input_tokens: 70_000, ephemeral_1h_input_tokens: 90_000 },
};

/** A row with a batch API whose cache writes cost something other than its input, so a ratio turned over shows. */
const batched = MODELS.find((m) => {
  const ratios = multipliersFor(m);
  return m.history === undefined && m.promo === undefined && m.retired === undefined
    && (m.tiers ?? []).every((tier) => tier.when.kind === 'speed')
    && ratios.batch !== null && ratios.cacheWrite5m !== 1 && ratios.cacheWrite1h !== 1 && ratios.cacheRead !== 1;
});

describe('what the batch calls cost', () => {
  it('is in the catalogue to be held', () => assert.ok(batched));

  it('is their four token lines, cache included, and nothing of the calls that did not run on it', () => {
    // usage.ts, batchUsd: "What the calls priced at the Batch API rate cost in
    // tokens: already inside the four token lines above".
    const batch = line(batched.id, USAGE, { batch: true });
    const alone = bill(batch);
    assert.ok(alone.cacheReadUsd > 0 && alone.cacheWriteUsd > 0);
    near(alone.batchUsd, tokenLines(alone), 'a log of one batch call');
    const mixed = bill(batch, line(batched.id, USAGE));
    near(mixed.batchUsd, alone.batchUsd, 'beside a call that did not run on the Batch API');
    assert.equal(bill(line(batched.id, USAGE)).batchUsd, 0);
  });
});

describe('what a row of the undecided band could cost each way', () => {
  // A row priced by prompt length, with one band and nothing else that moves its price.
  const banded = MODELS.find((m) => m.history === undefined && m.promo === undefined
    && m.tiers?.length === 1 && m.tiers[0].when.kind === 'input-tokens-above');

  it('is the row\'s whole share of the total at the dearer rate, and the same tokens at the base', () => {
    // usage.ts, tierCeilingUsd and tierFloorUsd: "`tierCeilingUsd` is what they
    // contribute to it and `tierFloorUsd` what the same tokens come to at the
    // cheaper rate." A row of five requests says no one prompt's length.
    assert.ok(banded, 'no banded row in the catalogue to hold');
    const total = bill(line(banded.id, USAGE, { requests: 5 }));
    assert.equal(total.tierCeilingCalls, 1);
    near(total.tierCeilingUsd, total.totalUsd, 'the ceiling');
    const ratios = multipliersFor(banded);
    const input = banded.inputPerMTok;
    const expected = (
      USAGE.input_tokens * input
      + USAGE.cache_read_input_tokens * input * ratios.cacheRead
      + USAGE.cache_creation.ephemeral_5m_input_tokens * input * ratios.cacheWrite5m
      + USAGE.cache_creation.ephemeral_1h_input_tokens * input * ratios.cacheWrite1h
      + USAGE.output_tokens * banded.outputPerMTok
    ) / 1_000_000;
    near(total.tierFloorUsd, expected, 'the floor');
    assert.ok(total.tierFloorUsd < total.tierCeilingUsd);
  });
});

describe('what the answers that hit the output ceiling cost', () => {
  it('is their output, and not the output of an answer that finished', () => {
    // usage.ts, truncatedOutputUsd: "Calls whose answer hit the output ceiling, and what their output cost."
    const cut = line(batched.id, USAGE, { stop_reason: 'max_tokens' });
    const finished = line(batched.id, USAGE, { stop_reason: 'end_turn' });
    const alone = bill(cut);
    assert.ok(alone.outputUsd > 0);
    near(alone.truncatedOutputUsd, alone.outputUsd, 'one cut-off answer');
    near(bill(cut, finished).truncatedOutputUsd, alone.outputUsd, 'beside one that finished');
    assert.equal(bill(finished).truncatedOutputUsd, 0);
    assert.equal(bill(line(batched.id, USAGE)).truncatedOutputUsd, 0, 'a log that does not say');
  });
});

describe('searches on a row that publishes no fee for them', () => {
  const unpriced = MODELS.find((m) => m.webSearchPerThousandUsd === undefined);

  it('are counted one by one, and a call that made none adds none', () => {
    // usage.ts, webSearchUnpricedRequests: "searches counted on a model whose row publishes no per-search fee".
    assert.ok(unpriced, 'every row prices a search');
    const one = line(unpriced.id, { input_tokens: 10, output_tokens: 10, server_tool_use: { web_search_requests: 1 } });
    const none = line(unpriced.id, { input_tokens: 10, output_tokens: 10 });
    assert.equal(bill(one).webSearchUnpricedRequests, 1);
    assert.equal(bill(none).webSearchUnpricedRequests, 0);
    assert.equal(bill(one, none).webSearchUnpricedRequests, 1);
  });
});
