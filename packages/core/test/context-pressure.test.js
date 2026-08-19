import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, contextPressure, profileUsage } from '../dist/index.js';

/**
 * How close the largest call is to the model's ceiling.
 *
 * Hand arithmetic: Claude Haiku 4.5's context window is 200,000 tokens, so a
 * 170,000-token call is at 85% of it — checkable by eye, which is the point.
 * Claude Opus 5's window is 1,000,000, so the same call there is at 17% and
 * must not be reported.
 */

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: new Date('2026-08-18T00:00:00Z'),
  });

const call = (inputTokens, over = {}) => ({
  model: 'claude-haiku-4-5',
  label: 'chat',
  usage: { input_tokens: inputTokens, output_tokens: 0 },
  ...over,
});

const pressure = (records, options) =>
  contextPressure(profile(records), BUNDLED_CATALOGUE, options);

describe('how close the largest call is to the context window', () => {
  it('reports the share, from the largest call and the model’s own window', () => {
    const [row] = pressure([call(50_000), call(170_000)]);
    assert.ok(row, 'a call at 85% of the window went unreported');
    assert.equal(row.maxCallInputTokens, 170_000);
    assert.equal(row.contextWindow, 200_000);
    assert.ok(Math.abs(row.share - 0.85) < 1e-9, String(row.share));
    assert.equal(row.calls, 2);
  });

  it('stays silent below half the window — the ceiling is not the next problem', () => {
    assert.deepEqual(pressure([call(99_000)]), []);
  });

  it('judges each slice against its own model’s window, not a generic one', () => {
    // 170k tokens: 85% of Haiku's 200k window, 17% of Opus's 1M one. The same
    // call is an emergency on one model and irrelevant on the other.
    const rows = pressure([
      call(170_000),
      call(170_000, { label: 'big-model', model: 'claude-opus-5' }),
    ]);
    assert.deepEqual(rows.map((r) => r.label), ['chat']);
  });

  it('counts cache reads and writes toward the call, since the model read them', () => {
    // 100k fresh + 80k read = a 180k-token request: 90% of the window.
    const [row] = pressure([
      call(0, { usage: { input_tokens: 100_000, output_tokens: 0, cache_read_input_tokens: 80_000 } }),
    ]);
    assert.ok(Math.abs(row.share - 0.9) < 1e-9, String(row.share));
  });

  it('orders by share, closest to the ceiling first', () => {
    const rows = pressure([
      call(120_000, { label: 'warm' }),
      call(190_000, { label: 'hot' }),
    ]);
    assert.deepEqual(rows.map((r) => r.label), ['hot', 'warm']);
  });

  it('leaves an unpriced model out — it has no window to compare against', () => {
    assert.deepEqual(pressure([call(170_000, { model: 'ft:acme-internal' })]), []);
  });

  it('honours a caller’s own threshold', () => {
    assert.equal(pressure([call(99_000)], { minShare: 0.4 }).length, 1);
  });
});
