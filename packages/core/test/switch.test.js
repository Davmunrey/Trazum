import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, ownRate, profileUsage, switchAnalysis } from '../dist/index.js';

/**
 * The switching decision, held to the doctrine: the delta rests on the
 * reprice, break-even is division on the past with its refusals named, the
 * evaluation is priced at the log's own mean call, and the sign convention
 * is proven with money in both directions — the exact defect this module's
 * `savingUsd` field exists to prevent is shipping a break-even for a switch
 * that loses money.
 */

const ON = new Date('2026-08-20T12:00:00Z');

const line = (ts, model, label, input, output) =>
  JSON.stringify({ ts, model, label, usage: { input_tokens: input, output_tokens: output } });

// Ten days of Opus traffic: expensive, timestamped, one label.
const OPUS_LOG = [
  line('2026-08-01T10:00:00Z', 'claude-opus-5', 'support', 40000, 2000),
  line('2026-08-06T10:00:00Z', 'claude-opus-5', 'support', 42000, 2100),
  line('2026-08-10T10:00:00Z', 'claude-opus-5', 'support', 41000, 1900),
];

const report = () => profileUsage(OPUS_LOG.join('\n'), { catalogue: BUNDLED_CATALOGUE, on: ON });

describe('switchAnalysis prices the decision', () => {
  it('a move to a cheaper model is a positive saving, and break-even divides the past', () => {
    const analysis = switchAnalysis(report(), 'claude-haiku-4-5', {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
      migrationUsd: 10,
    });
    assert.ok(analysis !== null);
    assert.ok(analysis.savingUsd > 0, 'moving Opus traffic to Haiku must read as a saving');
    // The sign boundary, said twice: reprice keeps target-minus-current.
    assert.ok(analysis.reprice.deltaUsd < 0);
    assert.equal(analysis.savingUsd, -analysis.reprice.deltaUsd);
    // First to last timestamp spans nine days into a ten-day ceiling.
    assert.equal(analysis.measuredDays, 9);
    assert.ok(analysis.breakEven !== null && 'days' in analysis.breakEven);
    const perDay = analysis.savingUsd / 9;
    assert.ok(Math.abs(analysis.breakEven.days - 10 / perDay) < 1e-9);
  });

  it('a move to a dearer model refuses the break-even by name', () => {
    // Haiku traffic "switched" to Opus: the saving is negative and a
    // migration cost has nothing to recover. Refused, not zeroed.
    const cheap = profileUsage(
      [
        line('2026-08-01T10:00:00Z', 'claude-haiku-4-5', 'classify', 3000, 100),
        line('2026-08-05T10:00:00Z', 'claude-haiku-4-5', 'classify', 2800, 90),
      ].join('\n'),
      { catalogue: BUNDLED_CATALOGUE, on: ON },
    );
    const analysis = switchAnalysis(cheap, 'claude-opus-5', {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
      migrationUsd: 10,
    });
    assert.ok(analysis !== null);
    assert.ok(analysis.savingUsd < 0);
    assert.deepEqual(analysis.breakEven, { migrationUsd: 10, refused: 'no-saving' });
  });

  it('a log with no clock has no rate, and says so', () => {
    const noTs = profileUsage(
      [
        JSON.stringify({ model: 'claude-opus-5', label: 'support', usage: { input_tokens: 40000, output_tokens: 2000 } }),
      ].join('\n'),
      { catalogue: BUNDLED_CATALOGUE, on: ON },
    );
    const analysis = switchAnalysis(noTs, 'claude-haiku-4-5', {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
      migrationUsd: 10,
    });
    assert.ok(analysis !== null);
    assert.equal(analysis.measuredDays, null);
    assert.equal(analysis.dailySavingUsd, null);
    assert.deepEqual(analysis.breakEven, { migrationUsd: 10, refused: 'no-clock' });
  });

  it('prices the evaluation at the log its own mean call, two-plus-one', () => {
    const analysis = switchAnalysis(report(), 'claude-haiku-4-5', {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
      evalCases: 20,
    });
    assert.ok(analysis !== null && analysis.evalCost !== null);
    const { meanCurrentCallUsd, meanTargetCallUsd, totalUsd, cases } = analysis.evalCost;
    assert.equal(cases, 20);
    assert.ok(Math.abs(totalUsd - 20 * (2 * meanCurrentCallUsd + meanTargetCallUsd)) < 1e-12);
    // And without a declared case count there is no invented one.
    const bare = switchAnalysis(report(), 'claude-haiku-4-5', { catalogue: BUNDLED_CATALOGUE, on: ON });
    assert.equal(bare?.evalCost, null);
  });

  it('an unknown target is null, never a zero-priced comparison', () => {
    assert.equal(
      switchAnalysis(report(), 'qwen-imaginary-99', { catalogue: BUNDLED_CATALOGUE, on: ON }),
      null,
    );
  });
});

describe('ownRate divides the two declared numbers and nothing else', () => {
  it('derives $/MTok from GPU rate and measured throughput', () => {
    // $2.50/h over 250 tok/s: 900,000 tokens/hour → $2.7778 per MTok.
    const { usdPerMTok } = ownRate({ gpuUsdPerHour: 2.5, tokensPerSecond: 250 });
    assert.ok(Math.abs(usdPerMTok - (2.5 / (250 * 3600)) * 1_000_000) < 1e-12);
  });

  it('utilisation scales the serving hour, not the price', () => {
    const full = ownRate({ gpuUsdPerHour: 2.5, tokensPerSecond: 250 });
    const half = ownRate({ gpuUsdPerHour: 2.5, tokensPerSecond: 250, utilization: 0.5 });
    assert.ok(Math.abs(half.usdPerMTok - full.usdPerMTok * 2) < 1e-9);
  });

  it('refuses the inputs a guess would paper over', () => {
    assert.throws(() => ownRate({ gpuUsdPerHour: 0, tokensPerSecond: 250 }), /positive/);
    assert.throws(() => ownRate({ gpuUsdPerHour: 2.5, tokensPerSecond: -1 }), /positive/);
    assert.throws(() => ownRate({ gpuUsdPerHour: 2.5, tokensPerSecond: 250, utilization: 0 }), /utilization/);
    assert.throws(() => ownRate({ gpuUsdPerHour: 2.5, tokensPerSecond: 250, utilization: 1.5 }), /utilization/);
  });
});
