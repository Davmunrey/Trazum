import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  ClaudeModelPricingError,
  catalogueFromOverlay,
  overlayFromClaudeModelPricing,
  profileUsage,
} from '../dist/index.js';

/**
 * Claude Code's `modelPricing` managed setting as a pricing overlay (#856).
 *
 * The rules are the settings reference's, read 2026-11-20: a multiplier above
 * 0 and at most 10 scales every cost, a row included; a row needs all four
 * rates; a row Claude Code cannot parse is dropped and the rest kept. The
 * figures below are worked out by hand from the table, never read back from the
 * code under test.
 */

const REVIEWED = '2026-11-20';
const convert = (modelPricing, options = {}) =>
  overlayFromClaudeModelPricing({ modelPricing }, { reviewed: REVIEWED, ...options });

/** One call's dollars under a catalogue, priced the way the bill prices a log line. */
const usd = (catalogue, model, usage) =>
  profileUsage(JSON.stringify({ model, usage }), { catalogue, on: new Date('2026-11-20') }).total.totalUsd;

describe('a modelPricing row', () => {
  it('sets the four rates, with the multiplier on top', () => {
    const { overlay, fromRows } = convert({
      multiplier: 0.85,
      overrides: { 'claude-sonnet-4-6': { input: 2.4, output: 12, cacheRead: 0.24, cacheWrite: 3 } },
    });
    assert.deepEqual(fromRows, ['claude-sonnet-4-6']);
    const row = overlay.models['claude-sonnet-4-6'];
    // 2.4 x 0.85 and 12 x 0.85.
    assert.equal(row.inputPerMTok, 2.04);
    assert.equal(row.outputPerMTok, 10.2);
    // Ratios of the row's own input, which the multiplier leaves alone: 0.24 / 2.4 and 3 / 2.4.
    assert.equal(row.multipliers.cacheRead, 0.1);
    assert.equal(row.multipliers.cacheWrite5m, 1.25);
    assert.equal(row.multipliers.cacheWrite1h, 1.25);
  });

  it('prices a call at the contracted rates once the overlay is applied', () => {
    const { overlay } = convert({
      multiplier: 0.85,
      overrides: { 'claude-sonnet-4-6': { input: 2.4, output: 12, cacheRead: 0.24, cacheWrite: 3 } },
    });
    const catalogue = catalogueFromOverlay(JSON.stringify(overlay), 'overlay.json');
    // By hand, at 0.85 of the row: 1M input at 2.04 = 2.04; 100k output at
    // 10.2 = 1.02; 2M cache reads at 0.204 = 0.408; 400k five-minute writes at
    // 2.55 = 1.02. Total 4.488.
    const total = usd(catalogue, 'claude-sonnet-4-6', {
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cache_read_input_tokens: 2_000_000,
      cache_creation: { ephemeral_5m_input_tokens: 400_000, ephemeral_1h_input_tokens: 0 },
    });
    assert.ok(Math.abs(total - 4.488) < 1e-9, `${total}`);
  });

  it('applies to the snapshots of the model it names', () => {
    const { overlay } = convert({
      overrides: { 'claude-sonnet-4-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 } },
    });
    const catalogue = catalogueFromOverlay(JSON.stringify(overlay), 'overlay.json');
    // The dated id is an alias of the row's model, so it prices at the row: 1M input at 2.
    assert.equal(usd(catalogue, 'claude-sonnet-4-5-20250929', { input_tokens: 1_000_000, output_tokens: 0 }), 2);
  });

  it('carries no US-only rate on a row, as Claude Code uses a row as written', () => {
    const { overlay, usOnlyDropped } = convert({
      overrides: { 'claude-sonnet-4-6': { input: 2.4, output: 12, cacheRead: 0.24, cacheWrite: 3 } },
    });
    assert.deepEqual(overlay.models['claude-sonnet-4-6'].inferenceGeoMultipliers, { us: 1 });
    assert.deepEqual(usOnlyDropped, ['claude-sonnet-4-6']);
  });
});

describe('the multiplier alone', () => {
  it('scales every Claude model at list price, and no other provider', () => {
    const { overlay, fromMultiplier, multiplier } = convert({ multiplier: 0.9 });
    assert.equal(multiplier, 0.9);
    const claude = BUNDLED_CATALOGUE.models.filter((model) => model.provider === 'anthropic').map((model) => model.id);
    assert.deepEqual(fromMultiplier.sort(), [...claude].sort());
    assert.deepEqual(Object.keys(overlay.models).sort(), [...claude].sort());
    // Haiku 4.5 lists at 1 and 5: 0.9 and 4.5.
    assert.equal(overlay.models['claude-haiku-4-5'].inputPerMTok, 0.9);
    assert.equal(overlay.models['claude-haiku-4-5'].outputPerMTok, 4.5);
    // The cache ratios are untouched: they scale with the input.
    assert.equal(overlay.models['claude-haiku-4-5'].multipliers, undefined);
  });

  it('is dropped, as Claude Code drops it, when it is out of range', () => {
    for (const multiplier of [0, -1, 11, '0.8']) {
      const result = convert({ multiplier });
      assert.equal(result.multiplier, undefined);
      assert.deepEqual(result.skipped, [{ key: 'multiplier', reason: 'invalid', detail: 'not a number above 0 and at most 10' }]);
      assert.deepEqual(Object.keys(result.overlay.models), []);
    }
  });
});

describe('what the table cannot say', () => {
  it('names the models whose fast-mode and batch rates stay the catalogue\'s', () => {
    const { fastKept, batchFromRatio } = convert({
      overrides: { 'claude-fable-5-2': { input: 7, output: 35, cacheRead: 0.175, cacheWrite: 8.75 } },
    });
    assert.deepEqual(fastKept, ['claude-fable-5-2']);
    assert.deepEqual(batchFromRatio, ['claude-fable-5-2']);
  });

  it('leaves out, by name, a key it cannot place, a row Claude Code would drop, a zero and a second row for one model', () => {
    const row = { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 };
    const { skipped, fromRows, overlay } = convert({
      overrides: {
        'us.anthropic.claude-sonnet-4-6-v1:0': row,
        'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.4 },
        'claude-haiku-4-5': { ...row, cacheRead: 0 },
        'claude-sonnet-4-5-20250929': row,
        'claude-sonnet-4-5': { ...row, input: 2.2 },
      },
    });
    assert.deepEqual(skipped, [
      { key: 'us.anthropic.claude-sonnet-4-6-v1:0', reason: 'unknown-model' },
      { key: 'claude-opus-5-5', reason: 'invalid', detail: 'no "cacheWrite"' },
      { key: 'claude-haiku-4-5', reason: 'zero' },
      // The model's own id wins over its snapshot, as Claude Code's exact match does.
      { key: 'claude-sonnet-4-5-20250929', reason: 'duplicate', detail: 'claude-sonnet-4-5' },
    ]);
    assert.deepEqual(fromRows, ['claude-sonnet-4-5']);
    assert.equal(overlay.models['claude-sonnet-4-5'].inputPerMTok, 2.2);
    assert.equal(overlay.models['us.anthropic.claude-sonnet-4-6-v1:0'], undefined);
  });

  it('refuses a rate above what Claude Code accepts', () => {
    const { skipped } = convert({
      overrides: { 'claude-sonnet-4-6': { input: 10_001, output: 12, cacheRead: 0.24, cacheWrite: 3 } },
    });
    assert.deepEqual(skipped, [{ key: 'claude-sonnet-4-6', reason: 'invalid', detail: '"input" is not a number from 0 to 10000' }]);
  });
});

describe('the document', () => {
  it('reads modelPricing from a whole settings file and nothing else from it', () => {
    const settings = {
      permissions: { deny: ['Bash(curl:*)'] },
      env: { SECRET: 'not read' },
      modelPricing: { multiplier: 0.5 },
    };
    const { overlay } = overlayFromClaudeModelPricing(settings, { reviewed: REVIEWED });
    assert.doesNotMatch(JSON.stringify(overlay), /curl|not read|SECRET/);
    assert.equal(overlay.lastReviewed, REVIEWED);
  });

  it('takes the bare object too', () => {
    const { multiplier } = overlayFromClaudeModelPricing({ multiplier: 0.5 }, { reviewed: REVIEWED });
    assert.equal(multiplier, 0.5);
  });

  it('refuses a file without it, and a date that is not one', () => {
    assert.throws(() => overlayFromClaudeModelPricing({ permissions: {} }, { reviewed: REVIEWED }), ClaudeModelPricingError);
    assert.throws(() => overlayFromClaudeModelPricing([], { reviewed: REVIEWED }), ClaudeModelPricingError);
    assert.throws(() => overlayFromClaudeModelPricing({ modelPricing: { multiplier: 0.5 } }, { reviewed: '20/11/2026' }), /YYYY-MM-DD/);
    assert.throws(() => overlayFromClaudeModelPricing({ modelPricing: { overrides: [] } }, { reviewed: REVIEWED }), /"overrides"/);
  });

  it('writes an overlay the overlay parser accepts, with the date and source on every row', () => {
    const { overlay } = convert(
      { multiplier: 0.85, overrides: { 'claude-sonnet-4-6': { input: 2.4, output: 12, cacheRead: 0.24, cacheWrite: 3 } } },
      { source: 'managed-settings.json' },
    );
    const catalogue = catalogueFromOverlay(JSON.stringify(overlay), 'overlay.json');
    assert.equal(catalogue.lastReviewed, REVIEWED);
    for (const id of Object.keys(overlay.models)) {
      assert.match(overlay.models[id].notes, /Contracted rates from managed-settings\.json, reviewed 2026-11-20\.$/, id);
    }
  });
});
