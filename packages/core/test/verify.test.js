import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, billLevers, buildPlan, profileUsage, verifyPlan } from '../dist/index.js';

/**
 * Did it work? — three outcomes, never two.
 *
 * Hand figures as everywhere: Claude Opus 5 at $5/MTok input makes 400k
 * input tokens $2.00 a call. The date is pinned so a promotion cannot reprice it.
 *
 * Doctrine: [Three outcomes, never two](../../../docs/doctrine.md#three-outcomes-never-two)
 */

const ON = new Date('2026-08-16T00:00:00Z');

const report = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: ON,
  });

const planOf = (records) => {
  const r = report(records);
  return buildPlan(r, billLevers(r, { catalogue: BUNDLED_CATALOGUE, on: ON }), '2026-06-24');
};

const verify = (plan, records) =>
  verifyPlan(plan, report(records), { currentPricingLastReviewed: '2026-06-24' });

const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'support',
  usage: { input_tokens: 400_000, output_tokens: 1_000 },
  ...over,
});

const cut = (sess, minute, over = {}) => call({
  label: 'digest',
  session: sess,
  ts: `2026-07-05T10:${String(minute).padStart(2, '0')}:00Z`,
  stop_reason: 'max_tokens',
  usage: { input_tokens: 200_000, output_tokens: 40_000 },
  ...over,
});
const retry = (sess, minute) => ({ ...cut(sess, minute), stop_reason: 'end_turn' });

describe('verifyPlan — the route', () => {
  const plan = planOf([call(), call(), call()]);
  const routeAction = plan.actions.find((a) => a.kind === 'route+batch');
  const target = routeAction.detail.routeTo.id;

  it('arrives when the label now runs dearest on the target, with the world named', () => {
    const v = verify(plan, [
      call({ model: target, ts: '2026-08-01T09:00:00Z' }),
      call({ model: target, ts: '2026-08-02T09:00:00Z' }),
      call({ model: target, ts: '2026-08-03T09:00:00Z' }),
      call({ model: target, ts: '2026-08-04T09:00:00Z' }),
      call({ model: target, ts: '2026-08-05T09:00:00Z' }),
      call({ model: target, ts: '2026-08-06T09:00:00Z' }),
    ]);
    const [action] = v.actions;
    assert.equal(action.outcome, 'arrived');
    assert.equal(action.gateFailing, false);
    // Attribution: the world's movement from the plan's own baseline.
    assert.equal(action.attribution.calls.before, 3);
    assert.equal(action.attribution.calls.after, 6);
  });

  it('does not arrive while the money still sits on the old model', () => {
    const v = verify(plan, [call(), call()]);
    const [action] = v.actions;
    assert.equal(action.outcome, 'not-arrived');
    assert.equal(action.gateFailing, true);
    assert.ok(action.observed.onOldModelUsd > 0);
  });

  it('cannot be told when the workload vanished, and that fails no gate', () => {
    const v = verify(plan, [call({ label: 'elsewhere' })]);
    const [action] = v.actions;
    assert.equal(action.outcome, 'cannot-tell');
    assert.equal(action.reason, 'workload-vanished');
    assert.equal(action.gateFailing, false);
  });
});

describe('verifyPlan — the tiers the log cannot see', () => {
  it('says a pure batch action cannot be told: tokens do not carry the tier', () => {
    // Haiku 4.5 is the cheapest of its family: no route exists, batch does.
    const plan = planOf([call({ model: 'claude-haiku-4-5' })]);
    const batchAction = plan.actions.find((a) => a.kind === 'batch');
    assert.ok(batchAction, 'fixture must produce a pure batch action');
    const v = verify(plan, [call({ model: 'claude-haiku-4-5' })]);
    const action = v.actions.find((a) => a.action.kind === 'batch');
    assert.equal(action.outcome, 'cannot-tell');
    assert.equal(action.reason, 'tier-not-recorded');
    assert.equal(action.gateFailing, false);
  });
});

describe('verifyPlan — the truncation retries', () => {
  const plan = planOf([cut('s1', 0), retry('s1', 1), cut('s2', 10), retry('s2', 11)]);
  const fix = plan.actions.find((a) => a.kind === 'fix-truncation');
  assert.ok(fix);

  it('arrives when the newer log shows no retry pair', () => {
    const v = verify(plan, [
      { ...retry('t1', 0), stop_reason: 'end_turn' },
      { ...retry('t2', 10), stop_reason: 'end_turn' },
    ]);
    const action = v.actions.find((a) => a.action.kind === 'fix-truncation');
    assert.equal(action.outcome, 'arrived');
    assert.equal(action.gateFailing, false);
  });

  it('does not arrive while the retry bill persists, priced', () => {
    const v = verify(plan, [cut('t1', 0), retry('t1', 1), cut('t2', 10), retry('t2', 11)]);
    const action = v.actions.find((a) => a.action.kind === 'fix-truncation');
    assert.equal(action.outcome, 'not-arrived');
    assert.equal(action.gateFailing, true);
    // $2.00 a call: two wasted, two retried.
    assert.ok(Math.abs(action.observed.retryBillUsd - 8) < 1e-9);
  });

  it("fails the gate when the log dropped the fields the detection needs — 'not recorded' is not 'fixed'", () => {
    // Same label, same model, but no sessions and no timestamps.
    const v = verify(plan, [
      { model: 'claude-opus-5', label: 'digest', usage: { input_tokens: 200_000, output_tokens: 40_000 } },
    ]);
    const action = v.actions.find((a) => a.action.kind === 'fix-truncation');
    assert.equal(action.outcome, 'cannot-tell');
    assert.equal(action.reason, 'fields-stopped');
    assert.equal(action.gateFailing, true);
  });
});

describe('verifyPlan — the cache', () => {
  const lossy = (over = {}) => call({
    label: 'rag',
    usage: { input_tokens: 10_000, output_tokens: 0, cache_creation: { ephemeral_1h_input_tokens: 500_000 } },
    ...over,
  });
  const plan = planOf([lossy(), lossy(), lossy()]);
  const fix = plan.actions.find((a) => a.kind === 'fix-caching');
  assert.ok(fix);

  it('arrives when caching now pays for itself on the slice', () => {
    const v = verify(plan, [
      call({ label: 'rag', usage: { input_tokens: 10_000, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 100_000 }, cache_read_input_tokens: 5_000_000 } }),
    ]);
    const action = v.actions.find((a) => a.action.kind === 'fix-caching');
    assert.equal(action.outcome, 'arrived');
    assert.equal(action.gateFailing, false);
  });

  it('does not arrive while the settled loss persists', () => {
    const v = verify(plan, [lossy()]);
    const action = v.actions.find((a) => a.action.kind === 'fix-caching');
    assert.equal(action.outcome, 'not-arrived');
    assert.equal(action.gateFailing, true);
  });

  it('fails the gate when the verdict can no longer settle on this log', () => {
    // The newer log uses the legacy field with reads that flip the verdict
    // between the two TTL readings: unsettled, and unverifiable is not fixed.
    const v = verify(plan, [
      call({ label: 'rag', usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 500_000 } }),
    ]);
    const action = v.actions.find((a) => a.action.kind === 'fix-caching');
    assert.equal(action.outcome, 'cannot-tell');
    assert.equal(action.reason, 'fields-stopped');
    assert.equal(action.gateFailing, true);
  });
});

describe('verifyPlan — the document', () => {
  it('counts the three outcomes and names a repricing instead of hiding it', () => {
    const plan = planOf([call(), call(), call()]);
    const v = verifyPlan(plan, report([call()]), { currentPricingLastReviewed: '2026-09-01' });
    assert.equal(v.schemaVersion, 1);
    assert.equal(v.arrived + v.notArrived + v.cannotTell, v.actions.length);
    assert.equal(v.pricesChanged, true);
    assert.equal(v.planPricing, '2026-06-24');
    assert.equal(v.currentPricing, '2026-09-01');
  });

  it('carries the plan date through, or its honest absence', () => {
    const plan = planOf([call()]);
    const undated = verify(plan, [call()]);
    assert.equal(undated.planCreatedAt, null);
    const dated = verify({ ...plan, createdAt: '2026-08-19T20:00:00.000Z' }, [call()]);
    assert.equal(dated.planCreatedAt, '2026-08-19T20:00:00.000Z');
  });
});
