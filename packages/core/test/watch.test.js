import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COVERAGE_FLOOR, DAY_MS, evaluateWatch, firedKey } from '../dist/index.js';

/**
 * What has crossed, and what cannot be judged yet.
 *
 * The reports here are built by hand rather than pulled, because the rule
 * being tested is about thresholds and coverage, not about pricing.
 */

const day = (n) => Date.UTC(2026, 7, n);

const report = (over = {}) => ({
  schemaVersion: 1,
  provider: 'anthropic',
  granularity: 'bucketed',
  span: { fromMs: day(1), toMs: day(3) },
  total: { totalUsd: 100, calls: null, inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
  byModel: [],
  byDay: [
    { day: '2026-08-01', usd: 60, calls: null },
    { day: '2026-08-02', usd: 40, calls: null },
  ],
  unpricedModels: [],
  gaps: [],
  unavailable: [],
  ...over,
});

/** Well after the days in the fixture, so they count as whole. */
const AFTER = day(5);

describe('evaluateWatch', () => {
  it('fires on a measured crossing, and says the figure is measured', () => {
    const result = evaluateWatch({ report: report(), thresholds: { maxUsd: 80 }, nowMs: AFTER });
    assert.equal(result.crossings.length, 1);
    const [crossing] = result.crossings;
    assert.equal(crossing.gate, 'maxUsd');
    assert.equal(crossing.measuredUsd, 100);
    assert.equal(crossing.limitUsd, 80);
    // A machine reader gets the provenance too — the field exists so a later
    // version cannot smuggle an estimate past a consumer by staying silent.
    assert.equal(crossing.provenance, 'measured');
  });

  it('stays quiet under the threshold, and never forecasts one', () => {
    const result = evaluateWatch({ report: report(), thresholds: { maxUsd: 120 }, nowMs: AFTER });
    assert.deepEqual(result.crossings, []);
    // Nothing in the result says anything about where the figure is heading.
    assert.deepEqual(Object.keys(result).sort(), ['abstentions', 'crossings', 'gap']);
  });

  it('names the day that crossed, not just the period', () => {
    const result = evaluateWatch({ report: report(), thresholds: { maxDayUsd: 50 }, nowMs: AFTER });
    assert.equal(result.crossings.length, 1);
    assert.equal(result.crossings[0].day, '2026-08-01');
    assert.equal(result.crossings[0].measuredUsd, 60);
  });

  it('abstains on a day still being measured rather than passing it', () => {
    // Judged at noon on the 2nd: that day is half measured, and a threshold
    // over half a day is a threshold over something else.
    const noonOnTheSecond = day(2) + DAY_MS / 2;
    const result = evaluateWatch({
      report: report({ byDay: [{ day: '2026-08-02', usd: 10, calls: null }] }),
      thresholds: { maxDayUsd: 50 },
      nowMs: noonOnTheSecond,
    });
    assert.deepEqual(result.crossings, []);
    assert.equal(result.abstentions.length, 1);
    assert.equal(result.abstentions[0].reason, 'window-too-short');
    assert.equal(result.abstentions[0].detail.neededMs, DAY_MS);
    assert.ok(result.abstentions[0].detail.coveredMs < DAY_MS);
  });

  it('fires on a day already over budget, whatever the hour', () => {
    // A day that is over budget at noon does not become less over budget at
    // midnight, so the coverage floor must not suppress a real crossing.
    const noon = day(2) + DAY_MS / 2;
    const result = evaluateWatch({
      report: report({ byDay: [{ day: '2026-08-02', usd: 500, calls: null }] }),
      thresholds: { maxDayUsd: 50 },
      nowMs: noon,
    });
    assert.equal(result.crossings.length, 1);
    assert.deepEqual(result.abstentions, []);
  });

  it('does not re-alert on a crossing a previous cycle already reported', () => {
    const fired = new Set([firedKey('maxUsd', null), firedKey('maxDayUsd', '2026-08-01')]);
    const result = evaluateWatch({
      report: report(),
      thresholds: { maxUsd: 80, maxDayUsd: 50 },
      nowMs: AFTER,
      alreadyFired: fired,
    });
    assert.deepEqual(result.crossings, []);
  });

  it('still speaks for a new day when an older one already alerted', () => {
    const result = evaluateWatch({
      report: report({
        byDay: [
          { day: '2026-08-01', usd: 60, calls: null },
          { day: '2026-08-02', usd: 90, calls: null },
        ],
      }),
      thresholds: { maxDayUsd: 50 },
      nowMs: AFTER,
      alreadyFired: new Set([firedKey('maxDayUsd', '2026-08-01')]),
    });
    assert.equal(result.crossings.length, 1);
    assert.equal(result.crossings[0].day, '2026-08-02');
  });

  it('abstains rather than passing when the source cannot serve the dimension', () => {
    const clockless = evaluateWatch({
      report: report({ span: null }),
      thresholds: { maxUsd: 1 },
      nowMs: AFTER,
    });
    assert.deepEqual(clockless.crossings, []);
    assert.equal(clockless.abstentions[0].reason, 'dimension-unavailable');

    // A cache gate with no cache verdict computed is unjudged, not passed.
    const noCache = evaluateWatch({
      report: report(),
      thresholds: { maxCacheLossUsd: 1 },
      nowMs: AFTER,
    });
    assert.equal(noCache.abstentions[0].gate, 'maxCacheLossUsd');
  });

  it('fires when caching lost more than the limit, measured', () => {
    const result = evaluateWatch({
      report: report(),
      thresholds: { maxCacheLossUsd: 5 },
      cacheDeltaUsd: 12,
      nowMs: AFTER,
    });
    assert.equal(result.crossings[0].gate, 'maxCacheLossUsd');
    assert.equal(result.crossings[0].measuredUsd, 12);
  });

  it('names the stretch it did not watch, rather than implying coverage', () => {
    const result = evaluateWatch({
      report: report(),
      thresholds: {},
      nowMs: AFTER,
      lastCoveredToMs: day(0),
    });
    assert.equal(result.gap.fromMs, day(0));
    assert.equal(result.gap.toMs, day(1));

    // No gap when the new window carries on from the last one.
    const continuous = evaluateWatch({
      report: report(),
      thresholds: {},
      nowMs: AFTER,
      lastCoveredToMs: day(1),
    });
    assert.equal(continuous.gap, null);
  });

  it('keeps the coverage floor short of perfection, so a gate can ever fire', () => {
    // A usage API's last bucket is often minutes behind; requiring the whole
    // day would mean a day gate that never judges anything.
    assert.ok(COVERAGE_FLOOR > 0 && COVERAGE_FLOOR < 1);
  });
});
