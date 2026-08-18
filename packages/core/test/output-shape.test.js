import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, outputShapes, profileUsage } from '../dist/index.js';

/**
 * Where the output spend concentrates.
 *
 * Output was 87% of the bill on the support prompt this repository measures
 * itself against, and the report could say that much and then stopped. The
 * actionable part is the shape: a tail worth hunting and a task whose answers are
 * inherently long produce the same total, and only the distribution tells them
 * apart.
 */

const ON = new Date('2026-08-16T00:00:00Z');

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: ON,
  });

const call = (outputTokens, over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  usage: { input_tokens: 1000, output_tokens: outputTokens },
  ...over,
});

describe('finding the group that holds half the output spend', () => {
  it('reports the smallest group of calls holding at least half of it', () => {
    /**
     * 1,880 calls of 200 output tokens and 120 of 8,000: 376,000 against 960,000.
     * The heavy 6% hold 71.9% of the spend, and the walk down from the longest
     * answers stops inside their bucket — so the group is exactly those calls, at
     * a bucket edge, and the shares are arithmetic checked here by hand.
     */
    const records = [
      ...Array.from({ length: 1880 }, () => call(200)),
      ...Array.from({ length: 120 }, () => call(8000)),
    ];
    const [shape] = profile(records).outputShapes;

    assert.equal(shape.heavyCalls, 120);
    assert.ok(Math.abs(shape.heavyCallShare - 120 / 2000) < 1e-9);
    assert.ok(Math.abs(shape.heavySpendShare - 960_000 / 1_336_000) < 1e-9);
    assert.equal(shape.aboveTokens, 8000, 'the threshold is not a bucket edge');
  });

  it('says at least half, and means it', () => {
    // By construction the walk cannot stop below the target: the group always
    // holds >= 50% of the spend, whatever the distribution.
    for (const heavy of [1, 7, 50, 400]) {
      const records = [
        ...Array.from({ length: 1000 - heavy }, () => call(150)),
        ...Array.from({ length: heavy }, () => call(6000)),
      ];
      const [shape] = profile(records).outputShapes;
      assert.ok(shape.heavySpendShare >= 0.5 - 1e-9, `${heavy} heavy: ${shape.heavySpendShare}`);
    }
  });

  it('reports a flat workload as flat, not as a tail of everyone', () => {
    /**
     * Every call answers 900 tokens, so the group holding half the spend is half
     * the calls (rounded up by the shared bucket — here all of them, since they
     * share one bucket). The share of calls is what the CLI keys its message on,
     * and a flat workload must land far above any tail threshold.
     */
    const [shape] = profile(Array.from({ length: 2000 }, () => call(900))).outputShapes;
    assert.ok(shape.heavyCallShare > 0.5, `flat workload read as a tail: ${shape.heavyCallShare}`);
  });

  it('drops slices whose output is a sliver of the bill', () => {
    /**
     * The classifier answering 40 tokens is real and its shape is noise: acting on
     * it cannot move the bill. minShare defaults to 5% of the whole bill.
     */
    const records = [
      ...Array.from({ length: 500 }, () => call(2000, { label: 'chat' })),
      ...Array.from({ length: 50 }, () => call(40, { label: 'classify' })),
    ];
    const labels = profile(records).outputShapes.map((s) => s.label);
    assert.ok(labels.includes('chat'));
    assert.ok(!labels.includes('classify'), 'a sliver of the bill got a row');
  });

  it('prices nothing against a model it could not price', () => {
    const report = profile(
      Array.from({ length: 100 }, () => call(2000, { model: 'some-finetune-nobody-published' })),
    );
    assert.deepEqual(report.outputShapes, []);
  });

  it('keeps two models under one label apart', () => {
    // The shape is per slice for the same reason a route is: a distribution mixed
    // across two prices describes neither.
    const records = [
      ...Array.from({ length: 400 }, () => call(2000)),
      ...Array.from({ length: 400 }, () => call(2000, { model: 'claude-sonnet-5' })),
    ];
    const models = new Set(profile(records).outputShapes.map((s) => s.model));
    assert.equal(models.size, 2);
  });

  it('is exact about the bucket edge it names', () => {
    /**
     * "Calls answering with more than N tokens" is only true because N is always a
     * bucket lower edge and every call in an included bucket is at or above it.
     * Checked across shapes rather than asserted once: an off-by-one in the bucket
     * arithmetic would name an edge calls sit below.
     */
    const records = [
      ...Array.from({ length: 900 }, () => call(100 + (Math.floor(Math.random() * 3) * 64))),
      ...Array.from({ length: 60 }, () => call(5000)),
    ];
    const rows = outputShapes(
      records.map((r) => ({
        model: r.model,
        inputTokens: r.usage.input_tokens,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        writeTtlKnown: true,
        outputTokens: r.usage.output_tokens,
        label: r.label,
        session: null,
      })),
      1000,
      { catalogue: BUNDLED_CATALOGUE, on: ON, minShare: 0 },
    );
    for (const shape of rows) {
      assert.equal(shape.aboveTokens % 64 === 0 || shape.aboveTokens % 1024 === 0, true);
    }
  });
});

describe('the ceilings a max_tokens cap actually wants', () => {
  // Buckets are 64 tokens wide below 8,192, so the ceilings are exact edges:
  // 100 → within 128, 500 → within 512, 9,000 → within 9,216.
  const lineOf = (outputTokens) =>
    JSON.stringify({
      model: 'claude-opus-5',
      label: 'chat',
      usage: { input_tokens: 10, output_tokens: outputTokens },
    });

  it('names the bucket edge covering half and 95% of the measured answers', () => {
    const log = [
      ...Array.from({ length: 10 }, () => lineOf(100)),
      ...Array.from({ length: 9 }, () => lineOf(500)),
      lineOf(9_000),
    ].join('\n');
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    const shape = report.outputShapes[0];
    // 10 of 20 calls fit within the 128 edge; 19 of 20 within 512.
    assert.equal(shape.medianWithinTokens, 128);
    assert.equal(shape.p95WithinTokens, 512);
  });

  it('refuses a ceiling for the open-ended bucket instead of inventing one', () => {
    const log = Array.from({ length: 4 }, () => lineOf(200_000)).join('\n');
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    const shape = report.outputShapes[0];
    assert.equal(shape.medianWithinTokens, null);
    assert.equal(shape.p95WithinTokens, null);
  });
});
