import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage } from '../dist/index.js';

/**
 * The shape of a call's input.
 *
 * A total says "input is 63% of this bill" and stops. Whether that is every
 * call carrying a large prompt or a few calls carrying an enormous one decides
 * between capping something and rewriting a prompt — and the two look
 * identical in a total.
 *
 * Buckets are 512 tokens wide below 65,536, so every ceiling below is a
 * multiple of 512 and checkable by hand: a 1,000-token call falls in the
 * bucket [512, 1024) and its ceiling is 1,024.
 */

const ON = new Date('2026-08-18T00:00:00Z');

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: ON,
  });

const call = (inputTokens, over = {}) => ({
  model: 'claude-opus-5',
  label: 'rag',
  usage: { input_tokens: inputTokens, output_tokens: 0 },
  ...over,
});

const many = (count, inputTokens, over = {}) =>
  Array.from({ length: count }, () => call(inputTokens, over));

describe('the shape of a slice’s input', () => {
  it('reports the ceiling half the calls fit within, on a bucket edge', () => {
    // Fifty calls of 1,000 tokens: the bucket is [512, 1024), so both the
    // median and the p95 ceiling are 1,024 — never the 1,000 itself, which
    // would be a precision the histogram does not have.
    const [shape] = profile(many(50, 1_000)).inputShapes;
    assert.ok(shape, 'no shape was reported for a slice that is the whole bill');
    assert.equal(shape.medianWithinTokens, 1_024);
    assert.equal(shape.p95WithinTokens, 1_024);
    assert.equal(shape.p95OverMedian, 1);
    assert.equal(shape.calls, 50);
  });

  it('names a skew a total cannot show', () => {
    // Forty ordinary calls at 1,000 tokens and five at 100,000. The median
    // call is unremarkable; the p95 is two orders of magnitude bigger, and
    // that difference is the finding.
    const shape = profile([...many(40, 1_000), ...many(5, 100_000)]).inputShapes[0];
    assert.equal(shape.medianWithinTokens, 1_024);
    // 100,000 falls in the wide band: buckets are 8,192 wide from 65,536, so
    // 100,000 sits in [98,304, 106,496) and the ceiling is 106,496.
    assert.equal(shape.p95WithinTokens, 106_496);
    assert.ok(shape.p95OverMedian > 100, String(shape.p95OverMedian));
  });

  it('counts cache reads and writes as input, because the model read them', () => {
    // A 60k-token request is a 60k-token request whether it was cached or not:
    // the size is what a context window and a retrieval cap are about.
    const shape = profile(
      many(30, 0, {
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 60_000 },
      }),
    ).inputShapes[0];
    assert.equal(shape.medianWithinTokens, 60_416); // 60,000 → bucket [59,904, 60,416)
    assert.equal(shape.cachedShare, 1);
  });

  it('says how much of the size was billed at the cache rate', () => {
    // Half read, half fresh. Without this, a large slice that is caching
    // correctly reads as an emergency.
    const shape = profile(
      many(30, 0, {
        usage: { input_tokens: 30_000, output_tokens: 0, cache_read_input_tokens: 30_000 },
      }),
    ).inputShapes[0];
    assert.ok(Math.abs(shape.cachedShare - 0.5) < 1e-9, String(shape.cachedShare));
  });

  it('refuses a percentile over too few calls', () => {
    // Nineteen calls: a p95 there is the largest of nineteen wearing a
    // percentile's name, and the sentence it feeds would describe one call.
    assert.deepEqual(profile(many(19, 1_000)).inputShapes, []);
    assert.equal(profile(many(20, 1_000)).inputShapes.length, 1);
  });

  it('drops a slice too small to matter to the bill', () => {
    // 'rag' is 40 calls of 200k tokens ($40.00); 'tiny' is 20 calls of 100
    // tokens, far under 5% of the bill and not worth a line.
    const report = profile([
      ...many(40, 200_000),
      ...many(20, 100, { label: 'tiny' }),
    ]);
    assert.deepEqual(
      report.inputShapes.map((s) => s.label),
      ['rag'],
    );
  });

  it('prices the input side at each token class’s own rate', () => {
    // 30 calls of 200k input on Claude Opus 5 at $5/MTok: $1.00 each, $30.00.
    const shape = profile(many(30, 200_000)).inputShapes[0];
    assert.ok(Math.abs(shape.inputUsd - 30) < 1e-9, String(shape.inputUsd));
    assert.ok(Math.abs(shape.shareOfBill - 1) < 1e-9, String(shape.shareOfBill));
  });

  it('splits by label and model, the grain a decision is made at', () => {
    const report = profile([
      ...many(25, 200_000),
      ...many(25, 200_000, { label: 'chat', model: 'claude-haiku-4-5' }),
    ]);
    assert.deepEqual(
      report.inputShapes.map((s) => `${s.label}\n${s.model}`),
      ['rag\nclaude-opus-5', 'chat\nclaude-haiku-4-5'],
    );
  });

  it('leaves an unpriced model out, since its bill was never computed', () => {
    const report = profile([
      ...many(25, 200_000),
      ...many(25, 200_000, { label: 'internal', model: 'ft:acme-internal' }),
    ]);
    assert.deepEqual(
      report.inputShapes.map((s) => s.label),
      ['rag'],
    );
  });
});
