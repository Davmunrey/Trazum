import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  billFigures,
  billLevers,
  buildPlan,
  buildWeeklySummary,
  profileUsage,
  strayFigures,
  weekWindows,
  weeklyMarker,
} from '../dist/index.js';

/**
 * The weekly summary (#757): two made-up weeks, and every figure worked out by
 * hand from the rates beside it.
 *
 * Claude Sonnet 5.5 is $2 per million input tokens and $10 per million output.
 * Claude Haiku 5.5 is $0.10/$0.50 up to 100,000 input tokens in a call and
 * $0.50/$2.50 over it, and batch is half.
 *
 * The week before (2026-11-06 to 2026-11-12), all Sonnet 5.5:
 *   - `classify`, two calls of 1,000,000 input: 2 x $2.00 = $4.00
 *   - `draft`, one call of 500,000 input and 100,000 output: $1.00 + $1.00 = $2.00
 *   total $6.00 over 3 calls.
 * The week (2026-11-13 to 2026-11-19):
 *   - `classify`, five calls of 1,000,000 input: 5 x $2.00 = $10.00
 *   - `draft`, the same one call: $2.00
 *   total $12.00 over 6 calls. The bill moved +$6.00, which is 6 / 6 = +100.0%.
 * The first change, `classify` to Haiku 5.5 and batched: those five calls on
 * Haiku are over 100,000 input each, so 5 x 1,000,000 x $0.50 = $2.50, batched
 * $1.25; the saving is $10.00 - $1.25 = $8.75. The second, `draft`: Haiku is
 * 500,000 x $0.50 + 100,000 x $2.50 = $0.50, batched $0.25; the saving is
 * $2.00 - $0.25 = $1.75.
 */

const ON = new Date('2026-11-19T12:00:00Z');
const UNTIL = Date.parse('2026-11-20T00:00:00Z');

const call = (ts, label, input, output = 0, model = 'claude-sonnet-5-5') =>
  JSON.stringify({ ts, model, label, usage: { input_tokens: input, output_tokens: output } });

const LOG = [
  call('2026-11-06T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-09T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-12T23:59:59Z', 'draft', 500_000, 100_000),
  call('2026-11-13T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-14T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-15T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-16T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-19T09:00:00Z', 'classify', 1_000_000),
  call('2026-11-17T09:00:00Z', 'draft', 500_000, 100_000),
].join('\n');

/** The two reports, the plan and the summary, the way the command builds them. */
function weekOf(log = LOG, until = UNTIL) {
  const windows = weekWindows(until);
  const at = (week) =>
    profileUsage(log, { catalogue: BUNDLED_CATALOGUE, on: ON, sinceMs: week.sinceMs, untilMs: week.untilMs });
  const current = at(windows.current);
  const previous = at(windows.previous);
  const plan = buildPlan(current, billLevers(current, { catalogue: BUNDLED_CATALOGUE, on: ON }), '2026-11-19');
  return { windows, current, previous, plan, summary: buildWeeklySummary(current, previous, plan, windows) };
}

describe('weekWindows', () => {
  it('is two back-to-back weeks that share no instant', () => {
    const { current, previous } = weekWindows(UNTIL);
    assert.equal(current.untilMs - current.sinceMs, 7 * 86_400_000);
    assert.equal(previous.untilMs, current.sinceMs, 'a gap or an overlap between the weeks');
    assert.deepEqual([current.firstDay, current.lastDay], ['2026-11-13', '2026-11-19']);
    assert.deepEqual([previous.firstDay, previous.lastDay], ['2026-11-06', '2026-11-12']);
  });
});

describe('buildWeeklySummary, against two made-up weeks', () => {
  const { summary } = weekOf();

  it('states the week\'s bill and the week before\'s, as measured', () => {
    assert.ok(Math.abs(summary.totalUsd - 12) < 1e-9, `${summary.totalUsd}`);
    assert.equal(summary.calls, 6);
    assert.ok(summary.comparison !== null);
    assert.ok(Math.abs(summary.comparison.previousUsd - 6) < 1e-9);
    assert.equal(summary.comparison.previousCalls, 3);
    assert.ok(Math.abs(summary.comparison.deltaUsd - 6) < 1e-9);
    assert.ok(Math.abs(summary.comparison.deltaPct - 100) < 1e-9);
  });

  it('puts a call on the edge of the week in the week it belongs to', () => {
    // 23:59:59 on the 12th is the week before; the half-open window is why.
    assert.equal(summary.comparison.previousCalls, 3);
  });

  it('names the three ranked changes with their projections and what was measured before them', () => {
    assert.equal(summary.changes.length, 2, 'the plan holds two actions');
    const [first, second] = summary.changes;
    assert.equal(first.label, 'classify');
    assert.ok(Math.abs(first.projectedSavingUsd - 8.75) < 1e-9, `${first.projectedSavingUsd}`);
    assert.ok(Math.abs(first.sliceUsd - 10) < 1e-9);
    assert.equal(first.sliceCalls, 5);
    assert.equal(first.measuredStakeUsd, null, 'a projection carried a measured stake');
    assert.equal(second.label, 'draft');
    assert.ok(Math.abs(second.projectedSavingUsd - 1.75) < 1e-9, `${second.projectedSavingUsd}`);
    assert.deepEqual([first.rank, second.rank], [1, 2]);
  });

  it('says there is no week to compare when the week before holds no call', () => {
    const { summary: alone } = weekOf(LOG.split('\n').slice(3).join('\n'));
    assert.equal(alone.comparison, null, 'a comparison against nothing was built');
  });

  it('keeps a model it cannot price out of the bill and counts it', () => {
    const { summary: withUnknown } = weekOf(`${LOG}\n${call('2026-11-15T10:00:00Z', 'x', 1000, 0, 'no-such-model')}`);
    assert.deepEqual(withUnknown.unpricedModels, ['no-such-model']);
    assert.equal(withUnknown.unpricedCalls, 1);
    assert.ok(Math.abs(withUnknown.totalUsd - 12) < 1e-9);
  });

  it('counts a call with no clock as left out, not as this week\'s', () => {
    const { summary: undated } = weekOf(`${LOG}\n${JSON.stringify({ model: 'claude-sonnet-5-5', usage: { input_tokens: 1_000_000, output_tokens: 0 } })}`);
    assert.equal(undated.undatedExcluded, 1);
    assert.ok(Math.abs(undated.totalUsd - 12) < 1e-9);
  });
});

describe('the figures a summary may print', () => {
  const { current, previous, plan } = weekOf();
  const figures = billFigures(current, previous, plan);

  it('are the ones the bills hold', () => {
    for (const usd of ['$12.00', '$6.00', '$10.00', '$2.00', '$8.75', '$1.75']) {
      assert.ok(figures.usd.has(usd), `${usd} is in the bill and not in the allowed set`);
    }
    assert.ok(figures.pct.has('100.0'));
  });

  it('name a figure that is in neither week\'s bill', () => {
    assert.deepEqual(strayFigures('The bill was $12.00, up 100.0%.', figures), []);
    assert.deepEqual(strayFigures('The bill was $13.20.', figures), ['$13.20']);
    assert.deepEqual(strayFigures('It grew 110.0% on $6.00.', figures), ['110.0%']);
    assert.deepEqual(strayFigures('$1,234 is not here either', figures), ['$1,234']);
  });

  it('do not read a workload\'s name as a figure', () => {
    assert.deepEqual(strayFigures('Route `50% off $99.99` to a cheaper model.', figures), []);
  });
});

describe('the marker a weekly summary ends in', () => {
  it('names the last day of the week, so a re-run finds its own post', () => {
    assert.equal(weeklyMarker('2026-11-19'), '<!-- trazum-weekly:2026-11-19 -->');
  });
});
