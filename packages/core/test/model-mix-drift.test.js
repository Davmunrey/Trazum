import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage } from '../dist/index.js';

/**
 * The mix moving inside one log.
 *
 * A bill can grow with no workload growing: traffic migrating from the cheap
 * model to the expensive one. Hand arithmetic: 200k input tokens are $1.00 on
 * Claude Opus 5 and $0.20 on Claude Haiku 4.5, and the halves split the day
 * list chronologically down the middle.
 */

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: new Date('2026-08-18T00:00:00Z'),
  });

const on = (day, model, usd = 1) => ({
  model,
  label: 'chat',
  ts: `2026-08-${String(day).padStart(2, '0')}T10:00:00Z`,
  usage: { input_tokens: usd * (model === 'claude-haiku-4-5' ? 1_000_000 : 200_000), output_tokens: 0 },
});

describe('the model mix, moving inside one log', () => {
  it('states each model’s share of each half, exactly', () => {
    // Days 1-2: all Haiku. Days 3-4: all Opus. The migration in its purest form.
    const drift = profile([
      on(1, 'claude-haiku-4-5'),
      on(2, 'claude-haiku-4-5'),
      on(3, 'claude-opus-5'),
      on(4, 'claude-opus-5'),
    ]).modelMixDrift;
    assert.ok(drift, 'four days of drift went unreported');
    assert.equal(drift.firstDays, 2);
    assert.equal(drift.lastDays, 2);
    const haiku = drift.models.find((m) => m.model === 'claude-haiku-4-5');
    const opus = drift.models.find((m) => m.model === 'claude-opus-5');
    assert.equal(haiku.firstShare, 1);
    assert.equal(haiku.lastShare, 0);
    assert.equal(opus.firstShare, 0);
    assert.equal(opus.lastShare, 1);
  });

  it('orders by movement, biggest first', () => {
    // Opus moves 0% -> 50% of the half's spend; Haiku the mirror. A third
    // model stays put and sorts last.
    const drift = profile([
      on(1, 'claude-haiku-4-5'),
      on(1, 'claude-sonnet-5'),
      on(2, 'claude-haiku-4-5'),
      on(2, 'claude-sonnet-5'),
      on(3, 'claude-opus-5'),
      on(3, 'claude-sonnet-5'),
      on(4, 'claude-opus-5'),
      on(4, 'claude-sonnet-5'),
    ]).modelMixDrift;
    assert.equal(drift.models.at(-1).model, 'claude-sonnet-5');
  });

  it('is null under four dated days — one day against one day is weather, not climate', () => {
    assert.equal(
      profile([on(1, 'claude-haiku-4-5'), on(2, 'claude-opus-5'), on(3, 'claude-opus-5')]).modelMixDrift,
      null,
    );
  });

  it('is null when the log carries no clock at all', () => {
    const undated = { model: 'claude-opus-5', label: 'chat', usage: { input_tokens: 200_000, output_tokens: 0 } };
    assert.equal(profile([undated, undated, undated, undated]).modelMixDrift, null);
  });

  it('splits an odd day count with the extra day in the second half', () => {
    const drift = profile([1, 2, 3, 4, 5].map((d) => on(d, 'claude-opus-5'))).modelMixDrift;
    assert.equal(drift.firstDays, 2);
    assert.equal(drift.lastDays, 3);
  });

  it('turns shares back into money, so a rendering can say what moved in dollars', () => {
    const drift = profile([
      on(1, 'claude-haiku-4-5'),
      on(2, 'claude-haiku-4-5'),
      on(3, 'claude-opus-5'),
      on(4, 'claude-opus-5'),
    ]).modelMixDrift;
    // Haiku: 1M tokens at $1/MTok = $1.00/day, two days = $2.00 first half.
    // Opus: 200k at $5/MTok = $1.00/day, two days = $2.00 second half.
    assert.ok(Math.abs(drift.firstUsd - 2) < 1e-9, String(drift.firstUsd));
    assert.ok(Math.abs(drift.lastUsd - 2) < 1e-9, String(drift.lastUsd));
    const opus = drift.models.find((m) => m.model === 'claude-opus-5');
    assert.ok(Math.abs(opus.lastUsd - 2) < 1e-9, String(opus.lastUsd));
  });

  it('keeps unpriced models out — their dollars were never computed', () => {
    const drift = profile([
      on(1, 'claude-haiku-4-5'),
      on(2, 'claude-haiku-4-5'),
      on(3, 'claude-opus-5'),
      on(4, 'claude-opus-5'),
      { model: 'ft:acme', label: 'chat', ts: '2026-08-03T10:00:00Z', usage: { input_tokens: 9_000_000 } },
    ]).modelMixDrift;
    assert.ok(!drift.models.some((m) => m.model === 'ft:acme'));
  });
});
