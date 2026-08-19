import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUNDLED_CATALOGUE, assignSources, fleetRollup, profileUsage } from '@trazum/core';

/**
 * The fleet arithmetic. Hand figures as everywhere: Claude Opus 5 at $5/MTok
 * input makes 200k input tokens $1.00; Claude Haiku 4.5 makes them $0.20.
 */

const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...over,
});

const report = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
  });

describe('assignSources', () => {
  it('assigns by the most specific glob, across sources', () => {
    const { bySource, unmatched } = assignSources(
      ['services/api/a.jsonl', 'services/web/b.jsonl', 'stray.jsonl'],
      { api: ['services/api/**'], everything: ['services/**'] },
    );
    assert.deepEqual(bySource.get('api'), ['services/api/a.jsonl']);
    assert.deepEqual(bySource.get('everything'), ['services/web/b.jsonl']);
    // A file matching no source is named, never silently in no report.
    assert.deepEqual(unmatched, ['stray.jsonl']);
  });
});

describe('fleetRollup', () => {
  it('sums the fleet and names the source that is actually bleeding', () => {
    const rollup = fleetRollup([
      { name: 'api', report: report([call(), call(), call()]) },
      { name: 'web', report: report([call()]) },
    ]);
    assert.ok(Math.abs(rollup.totalUsd - 4) < 1e-9);
    assert.equal(rollup.worst.name, 'api');
    assert.ok(Math.abs(rollup.worst.share - 0.75) < 1e-9);
  });

  it('has no worst of nothing', () => {
    const rollup = fleetRollup([{ name: 'idle', report: report([]) }]);
    assert.equal(rollup.worst, null);
  });

  it('flags mismatched spans, because a share of a sum is not a rate', () => {
    const even = fleetRollup([
      { name: 'a', report: report([call({ ts: '2026-08-01T09:00:00Z' }), call({ ts: '2026-08-10T09:00:00Z' })]) },
      { name: 'b', report: report([call({ ts: '2026-08-02T09:00:00Z' }), call({ ts: '2026-08-10T09:00:00Z' })]) },
    ]);
    assert.equal(even.mismatchedSpans, false);

    const uneven = fleetRollup([
      { name: 'month', report: report([call({ ts: '2026-08-01T09:00:00Z' }), call({ ts: '2026-08-30T09:00:00Z' })]) },
      { name: 'days', report: report([call({ ts: '2026-08-01T09:00:00Z' }), call({ ts: '2026-08-03T09:00:00Z' })]) },
    ]);
    assert.equal(uneven.mismatchedSpans, true);

    const clockless = fleetRollup([
      { name: 'dated', report: report([call({ ts: '2026-08-01T09:00:00Z' })]) },
      { name: 'undated', report: report([call()]) },
    ]);
    assert.equal(clockless.mismatchedSpans, true);
  });

  it('names the same label running on different models across sources', () => {
    const rollup = fleetRollup([
      { name: 'team-a', report: report([call({ label: 'support' })]) },
      { name: 'team-b', report: report([call({ label: 'support', model: 'claude-haiku-4-5' })]) },
    ]);
    assert.equal(rollup.splitBrains.length, 1);
    assert.equal(rollup.splitBrains[0].label, 'support');
    const models = rollup.splitBrains[0].sources.map((s) => s.model).sort();
    assert.deepEqual(models, ['claude-haiku-4-5', 'claude-opus-5']);
  });

  it('does not call one team on one model a split brain', () => {
    const rollup = fleetRollup([
      { name: 'a', report: report([call({ label: 'support' })]) },
      { name: 'b', report: report([call({ label: 'support' })]) },
    ]);
    assert.deepEqual(rollup.splitBrains, []);
  });

  it("judges the split on each source's dearest model, not a stray experiment", () => {
    // team-b runs support on Opus for $5.00 and once on Haiku for $0.20: its
    // model is Opus, so there is no split against team-a's Opus.
    const rollup = fleetRollup([
      { name: 'team-a', report: report([call({ label: 'support' })]) },
      {
        name: 'team-b',
        report: report([
          call({ label: 'support', usage: { input_tokens: 1_000_000, output_tokens: 0 } }),
          call({ label: 'support', model: 'claude-haiku-4-5' }),
        ]),
      },
    ]);
    assert.deepEqual(rollup.splitBrains, []);
  });

  it('names sources underwater on cache only when the aggregate paid off', () => {
    const sources = [
      { name: 'winner', report: report([call()]) },
      { name: 'loser', report: report([call()]) },
    ];
    const paying = fleetRollup(sources, {
      cacheDeltas: new Map([['winner', -8], ['loser', 3]]),
      aggregateCacheDelta: -5,
    });
    assert.deepEqual(paying.cacheUnderwater, [{ name: 'loser', deltaUsd: 3 }]);

    // Aggregate lost money: the whole-fleet report already shouts, and
    // repeating it per source would be the same alarm in pieces.
    const losing = fleetRollup(sources, {
      cacheDeltas: new Map([['winner', 1], ['loser', 3]]),
      aggregateCacheDelta: 4,
    });
    assert.deepEqual(losing.cacheUnderwater, []);
  });
});
