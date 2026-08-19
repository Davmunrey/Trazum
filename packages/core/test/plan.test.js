import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, billLevers, buildPlan, planLabelName, profileUsage } from '../dist/index.js';

/**
 * The plan: ranked, costed, non-additive composition done once, correctly.
 *
 * Hand figures as everywhere: Claude Opus 5 at $5/MTok input makes 400k input
 * tokens $2.00 a call. The date is pinned inside Sonnet 5's introductory
 * window so a lapsing promotion cannot fail a test nobody changed.
 */

const ON = new Date('2026-08-16T00:00:00Z');

const report = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: ON,
  });

const plan = (records) => {
  const r = report(records);
  return buildPlan(r, billLevers(r, { catalogue: BUNDLED_CATALOGUE, on: ON }), '2026-06-24');
};

const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'support',
  usage: { input_tokens: 400_000, output_tokens: 0 },
  ...over,
});

describe('buildPlan', () => {
  it('pre-combines route and batch on one slice, never summing them', () => {
    const r = report([call(), call(), call()]);
    const levers = billLevers(r, { catalogue: BUNDLED_CATALOGUE, on: ON });
    const [slice] = levers.slices;
    assert.ok(slice.route !== null && slice.batch !== null, 'fixture must offer both levers');
    const doc = buildPlan(r, levers, '2026-06-24');
    const action = doc.actions.find((a) => a.kind === 'route+batch');
    assert.ok(action, 'both levers on one slice arrive as one action');
    // The one composition that does not add: the combined figure, not the sum.
    assert.equal(action.savingUsd, slice.combinedUsd);
    assert.ok(action.savingUsd < slice.route.savingUsd + slice.batch.savingUsd);
    // A projection carries no stake, ever — one field or the other, never both.
    assert.equal(action.stakeUsd, null);
    assert.deepEqual(action.detail.routeTo, slice.route.candidate);
    assert.ok(action.assumes.some((a) => a.kind === 'model-capability'));
    assert.ok(action.assumes.some((a) => a.kind === 'batch-window'));
    assert.match(action.check, /trazum route/);
  });

  it("prices the truncation action from the measured retry bill, as stake not saving", () => {
    // Two cut answers, each retried 30s later in the same session: the stake
    // is the wasted call plus the retry, measured, and there is no projection.
    const cut = (sess, minute) => call({
      label: 'digest',
      session: sess,
      ts: `2026-08-05T10:${String(minute).padStart(2, '0')}:00Z`,
      stop_reason: 'max_tokens',
      usage: { input_tokens: 200_000, output_tokens: 40_000 },
    });
    const retry = (sess, minute) => ({ ...cut(sess, minute), stop_reason: 'end_turn' });
    const doc = plan([cut('s1', 0), retry('s1', 1), cut('s2', 10), retry('s2', 11)]);
    const action = doc.actions.find((a) => a.kind === 'fix-truncation');
    assert.ok(action);
    assert.equal(action.savingUsd, null);
    // Each call is $1.00 input + $1.00 output = $2.00: $4 wasted, $4 retried.
    assert.ok(Math.abs(action.stakeUsd - 8) < 1e-9, String(action.stakeUsd));
    assert.ok(Math.abs(action.detail.measured.wastedUsd - 4) < 1e-9);
    assert.ok(Math.abs(action.detail.measured.retryUsd - 4) < 1e-9);
    assert.deepEqual(
      action.assumes.map((a) => a.kind).sort(),
      ['max-tokens-fits', 'retry-pattern-real'],
    );
  });

  it('turns only a settled cache loss into an action, never an unsettled verdict', () => {
    // Explicit 1h writes, zero reads: lost money with the TTL on record.
    const settled = plan([
      call({ label: 'rag', usage: { input_tokens: 10_000, output_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 500_000 } } }),
    ]);
    const action = settled.actions.find((a) => a.kind === 'fix-caching');
    assert.ok(action, 'a settled loss is an action');
    assert.equal(action.savingUsd, null);
    assert.ok(action.stakeUsd > 0);
    assert.deepEqual(action.assumes.map((a) => a.kind), ['traffic-pattern-holds']);

    // The legacy field hides the TTL. Writes of 1M and reads of 500k pay off
    // read as 5m writes (-$0.20) and lose read as 1h writes (+$0.55): the
    // verdict is unsettled, and "add the field" is the report's advice, not
    // a plan's.
    const unsettled = plan([
      call({ label: 'rag', usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 500_000 } }),
    ]);
    assert.equal(unsettled.actions.find((a) => a.kind === 'fix-caching'), undefined);
  });

  it('ranks by money, projected and staked alike, and totals them separately', () => {
    const cut = (minute) => call({
      label: 'digest',
      session: 's1',
      ts: `2026-08-05T10:${String(minute).padStart(2, '0')}:00Z`,
      stop_reason: 'max_tokens',
      usage: { input_tokens: 200_000, output_tokens: 40_000 },
    });
    const doc = plan([
      call(), call(), call(),
      cut(0), { ...cut(1), stop_reason: 'end_turn' },
      cut(10), { ...cut(11), stop_reason: 'end_turn' },
    ]);
    const money = doc.actions.map((a) => a.savingUsd ?? a.stakeUsd ?? 0);
    assert.deepEqual(money, [...money].sort((a, b) => b - a), 'largest money first');
    // Separate columns: projections sum with projections, stakes with stakes.
    const projected = doc.actions.reduce((s, a) => s + (a.savingUsd ?? 0), 0);
    const staked = doc.actions.reduce((s, a) => s + (a.stakeUsd ?? 0), 0);
    assert.ok(Math.abs(doc.projectedSavingUsd - projected) < 1e-9);
    assert.ok(Math.abs(doc.measuredStakeUsd - staked) < 1e-9);
    assert.ok(Math.abs(doc.totalUsd - report([call(), call(), call(), cut(0), cut(1), cut(10), cut(11)]).total.totalUsd) < 1e-9);
  });

  it('records the catalogue that priced it and the span it covers', () => {
    const dated = plan([call({ ts: '2026-08-01T09:00:00Z' }), call({ ts: '2026-08-10T09:00:00Z' })]);
    assert.equal(dated.schemaVersion, 1);
    assert.equal(dated.pricingLastReviewed, '2026-06-24');
    assert.ok(dated.span !== null);

    // No clock in the log: the plan says so with null, never a guessed period.
    const clockless = plan([call()]);
    assert.equal(clockless.span, null);
  });

  it('has nothing to say about a log that offers no levers and no losses', () => {
    // A model the catalogue cannot price has no dollars anywhere in the
    // report, so it can have no levers, no retry bill and no cache verdict.
    // An empty plan is an empty list, not an invented action.
    const doc = plan([call({ model: 'mystery-model' })]);
    assert.deepEqual(doc.actions, []);
    assert.equal(doc.projectedSavingUsd, 0);
    assert.equal(doc.measuredStakeUsd, 0);
  });
});

describe('planLabelName', () => {
  it('renders the unlabelled bucket without leaking the sentinel', () => {
    assert.equal(planLabelName('support', '(unlabelled)'), 'support');
    const doc = plan([call({ label: undefined })]);
    const [action] = doc.actions;
    assert.ok(action, 'unlabelled traffic still gets its action');
    assert.equal(planLabelName(action.label, '(unlabelled)'), '(unlabelled)');
  });
});
