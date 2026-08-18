import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage } from '../dist/index.js';

/**
 * The time window — the drill-down in time.
 *
 * Every dollar asserted here is hand arithmetic against the published rates:
 * on Claude Opus 5, input is $5/MTok, so 1,000,000 input tokens are $5.00 and
 * 200,000 are $1.00. Never a snapshot — a snapshot of a wrong number passes
 * forever.
 */

const ON = new Date('2026-08-18T00:00:00Z');
const DAY1 = Date.parse('2026-08-01T10:00:00Z');
const DAY2 = Date.parse('2026-08-02T10:00:00Z');
const DAY3 = Date.parse('2026-08-03T10:00:00Z');

/** One call costing exactly $1.00: 200k input tokens on Claude Opus 5. */
const call = (tsMs, over = {}) =>
  JSON.stringify({
    model: 'claude-opus-5',
    ...(tsMs === null ? {} : { ts: new Date(tsMs).toISOString() }),
    usage: { input_tokens: 200_000, output_tokens: 0 },
    ...over,
  });

const profile = (lines, options = {}) =>
  profileUsage(lines.join('\n'), { catalogue: BUNDLED_CATALOGUE, on: ON, ...options });

describe('the window keeps only what falls inside it', () => {
  it('filters by [since, until) and the total is the window alone', () => {
    const report = profile([call(DAY1), call(DAY2), call(DAY3)], {
      sinceMs: Date.parse('2026-08-02T00:00:00Z'),
      untilMs: Date.parse('2026-08-03T00:00:00Z'),
    });
    assert.equal(report.total.calls, 1);
    // $1.00: 200k input tokens at $5/MTok, the day-2 call and nothing else.
    assert.ok(Math.abs(report.total.totalUsd - 1.0) < 1e-9);
    assert.deepEqual(report.timeWindow, {
      sinceMs: Date.parse('2026-08-02T00:00:00Z'),
      untilMs: Date.parse('2026-08-03T00:00:00Z'),
      undatedExcluded: 0,
    });
  });

  it('is half-open: at since is inside, at until is outside', () => {
    const report = profile([call(DAY1), call(DAY2)], { sinceMs: DAY1, untilMs: DAY2 });
    assert.equal(report.total.calls, 1);
    assert.ok(Math.abs(report.total.totalUsd - 1.0) < 1e-9);
  });

  it('either bound alone works', () => {
    const since = profile([call(DAY1), call(DAY2), call(DAY3)], { sinceMs: DAY2 });
    assert.equal(since.total.calls, 2);
    const until = profile([call(DAY1), call(DAY2), call(DAY3)], { untilMs: DAY2 });
    assert.equal(until.total.calls, 1);
  });

  it('the span and spendByDay describe the window, not the log', () => {
    const report = profile([call(DAY1), call(DAY2), call(DAY3)], { untilMs: DAY3 });
    assert.equal(report.span.calls, 2);
    assert.equal(new Date(report.span.toMs).toISOString().slice(0, 10), '2026-08-02');
    assert.deepEqual(
      report.spendByDay.map((d) => d.day),
      ['2026-08-01', '2026-08-02'],
    );
  });
});

describe('a record with no clock cannot be placed, and says so', () => {
  it('is excluded and counted, never in the totals and never dropped silently', () => {
    const report = profile([call(DAY1), call(null)], { sinceMs: DAY1 });
    assert.equal(report.total.calls, 1);
    assert.ok(Math.abs(report.total.totalUsd - 1.0) < 1e-9);
    assert.equal(report.timeWindow.undatedExcluded, 1);
    // Excluded is not corrupt: the line was readable, it just has no clock.
    assert.deepEqual(report.skippedLines, []);
  });

  it('without a window the same record is included and timeWindow is null', () => {
    const report = profile([call(DAY1), call(null)]);
    assert.equal(report.total.calls, 2);
    assert.equal(report.timeWindow, null);
  });

  it('counts only the drilled-down label, not every clockless call in the log', () => {
    const report = profile(
      [
        call(DAY1, { label: 'chat' }),
        call(null, { label: 'chat' }),
        call(null, { label: 'batch' }),
      ],
      { sinceMs: DAY1, label: 'chat' },
    );
    assert.equal(report.total.calls, 1);
    assert.equal(report.timeWindow.undatedExcluded, 1);
  });

  it('a corrupt line still lands in skippedLines whatever the window', () => {
    const report = profileUsage(
      [call(DAY1), '{"model":"claude-opus-5","usage":{"input_tokens":"200000"}}'].join('\n'),
      { catalogue: BUNDLED_CATALOGUE, on: ON, sinceMs: DAY1 },
    );
    assert.deepEqual(report.skippedLines, [2]);
    assert.equal(report.timeWindow.undatedExcluded, 0);
  });
});
