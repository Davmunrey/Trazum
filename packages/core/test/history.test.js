import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildHistory, storedReportFrom, MIN_RUN } from '../dist/index.js';

/**
 * The long run: series from stored reports, shapes named, no forecasts.
 * Reports are built by hand so every figure is checkable by eye.
 */

const DAY = 86_400_000;

const stored = (name, week, over = {}) => ({
  name,
  span: { fromMs: week * 7 * DAY, toMs: (week * 7 + 6) * DAY },
  totalUsd: 100,
  calls: 100,
  byLabel: new Map([['support', 50]]),
  byModel: new Map([['claude-opus-5', 100]]),
  cacheReadShare: 0.5,
  ...over,
});

describe('buildHistory', () => {
  it('orders periods by span and keeps undated reports out of every series, named', () => {
    const doc = buildHistory([
      stored('w3.json', 3),
      stored('w1.json', 1),
      { ...stored('undated.json', 0), span: null },
      stored('w2.json', 2),
    ]);
    assert.deepEqual(doc.periods.map((p) => p.name), ['w1.json', 'w2.json', 'w3.json']);
    assert.deepEqual(doc.undatedReports, ['undated.json']);
  });

  it('names a workload climbing for consecutive periods, since a named report', () => {
    // support: 40, 44, 48, 52 — three consecutive rises across four weeks.
    const weeks = [40, 44, 48, 52].map((usd, i) =>
      stored(`w${i}.json`, i, { byLabel: new Map([['support', usd]]) }),
    );
    const doc = buildHistory(weeks);
    const run = doc.runs.find((r) => r.kind === 'label-spend-climbing');
    assert.ok(run, 'three rises reach the floor');
    assert.equal(run.subject, 'support');
    assert.equal(run.periods, 3);
    assert.equal(run.sinceName, 'w0.json');
    assert.equal(run.from, 40);
    assert.equal(run.to, 52);
    // The run is a shape, not a forecast: nothing predicts w4.
    assert.equal(MIN_RUN, 3);
  });

  it('stays silent under the floor: two rises is a comparison, not a trend', () => {
    const weeks = [40, 44, 48].map((usd, i) =>
      stored(`w${i}.json`, i, { byLabel: new Map([['support', usd]]) }),
    );
    assert.deepEqual(buildHistory(weeks).runs, []);
  });

  it('sees a model share climbing even when every total looks flat', () => {
    // Total stays 100; opus share climbs 0.25 → 0.40 → 0.55 → 0.70.
    const weeks = [25, 40, 55, 70].map((opus, i) =>
      stored(`w${i}.json`, i, {
        byModel: new Map([['claude-opus-5', opus], ['claude-haiku-4-5', 100 - opus]]),
      }),
    );
    const doc = buildHistory(weeks);
    const run = doc.runs.find((r) => r.kind === 'model-share-climbing' && r.subject === 'claude-opus-5');
    assert.ok(run);
    assert.ok(Math.abs(run.from - 0.25) < 1e-9);
    assert.ok(Math.abs(run.to - 0.7) < 1e-9);
  });

  it('sees the cache share decaying slowly enough that no single week said so', () => {
    const weeks = [0.5, 0.45, 0.4, 0.35].map((share, i) =>
      stored(`w${i}.json`, i, { cacheReadShare: share }),
    );
    const doc = buildHistory(weeks);
    const run = doc.runs.find((r) => r.kind === 'cache-share-decaying');
    assert.ok(run);
    assert.equal(run.periods, 3);
  });

  it('a broken run does not count: movement must be consecutive', () => {
    // Rise, dip, rise, rise — the longest run is 2, under the floor.
    const weeks = [40, 44, 42, 46, 50].map((usd, i) =>
      stored(`w${i}.json`, i, { byLabel: new Map([['support', usd]]) }),
    );
    assert.deepEqual(buildHistory(weeks).runs, []);
  });

  it('names the same action planned twice and never executed', () => {
    const action = { kind: 'route', label: 'support', model: 'claude-opus-5', savingUsd: 10, stakeUsd: null, assumes: [], check: null, detail: {} };
    const plan = (createdAt) => ({
      schemaVersion: 1, span: null, pricingLastReviewed: '2026-06-24',
      actions: [action], projectedSavingUsd: 10, measuredStakeUsd: 0, totalUsd: 100, createdAt,
    });
    const doc = buildHistory([], [plan('2026-08-01T00:00:00Z'), plan('2026-08-08T00:00:00Z')]);
    assert.equal(doc.repeatedPlanActions.length, 1);
    const repeat = doc.repeatedPlanActions[0];
    assert.equal(repeat.appearances, 2);
    assert.equal(repeat.firstPlanned, '2026-08-01T00:00:00Z');
    assert.equal(repeat.lastPlanned, '2026-08-08T00:00:00Z');
  });
});

describe('storedReportFrom', () => {
  it('reads a profile document and refuses anything else by returning null', () => {
    const doc = storedReportFrom('week.json', {
      schemaVersion: 1,
      span: { fromMs: 0, toMs: 6 * DAY },
      total: { totalUsd: 100, calls: 10, inputTokens: 800_000, cacheReadTokens: 200_000, cacheWriteTokens: 0 },
      byLabelAndModel: [
        { label: 'support', model: 'claude-opus-5', breakdown: { totalUsd: 60 } },
        { label: 'chat', model: 'claude-haiku-4-5', breakdown: { totalUsd: 40 } },
      ],
    });
    assert.equal(doc.byLabel.get('support'), 60);
    assert.equal(doc.byModel.get('claude-haiku-4-5'), 40);
    assert.ok(Math.abs(doc.cacheReadShare - 0.2) < 1e-9);

    assert.equal(storedReportFrom('nope.json', { hello: 1 }), null);
    assert.equal(storedReportFrom('nope.json', null), null);
    // A plan document is not a profile document.
    assert.equal(storedReportFrom('plan.json', { schemaVersion: 1, actions: [] }), null);
  });
});
