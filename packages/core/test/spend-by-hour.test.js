import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage } from '../dist/index.js';

/**
 * The shape of the UTC day. $1.00 = 200k input tokens on Claude Opus 5, so
 * every bucket below is checkable by eye.
 */

const ON = new Date('2026-08-18T00:00:00Z');

const at = (hour, usd = 1) =>
  JSON.stringify({
    model: 'claude-opus-5',
    ts: `2026-08-01T${String(hour).padStart(2, '0')}:30:00Z`,
    usage: { input_tokens: usd * 200_000, output_tokens: 0 },
  });

const profile = (lines) =>
  profileUsage(lines.join('\n'), { catalogue: BUNDLED_CATALOGUE, on: ON });

describe('spend by hour of the UTC day', () => {
  it('buckets exact per-record dollars by hour, only for hours with traffic', () => {
    const report = profile([at(9), at(9, 2), at(17)]);
    assert.deepEqual(report.spendByHour, [
      { hour: 9, usd: 3, calls: 2 },
      { hour: 17, usd: 1, calls: 1 },
    ]);
  });

  it('is independent of the order of the log', () => {
    const forward = [at(1), at(5, 3), at(23, 2)];
    assert.deepEqual(profile(forward).spendByHour, profile([...forward].reverse()).spendByHour);
  });

  it('sums to the bill exactly once', () => {
    const report = profile([at(3), at(3, 2), at(11, 4)]);
    const summed = report.spendByHour.reduce((total, hour) => total + hour.usd, 0);
    assert.ok(Math.abs(summed - report.total.totalUsd) < 1e-9);
  });

  it('is empty when the log carries no clock — not a flat day', () => {
    const report = profile([
      JSON.stringify({ model: 'claude-opus-5', usage: { input_tokens: 200_000, output_tokens: 0 } }),
    ]);
    assert.deepEqual(report.spendByHour, []);
  });

  it('excludes unpriced calls from the money, like every other series', () => {
    const report = profile([
      at(4),
      JSON.stringify({ model: 'ft:unknown', ts: '2026-08-01T04:30:00Z', usage: { input_tokens: 900_000 } }),
    ]);
    assert.deepEqual(report.spendByHour, [{ hour: 4, usd: 1, calls: 1 }]);
  });
});
