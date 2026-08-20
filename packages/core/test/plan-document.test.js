import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  billLevers,
  buildPlan,
  parsePlanDocument,
  profileUsage,
} from '../dist/index.js';

/**
 * Reading a plan back.
 *
 * A plan is the one document in this product that is written on one day and
 * read on another, by a different surface — committed from a terminal,
 * verified in CI, dropped into a browser tab. That makes it the one document
 * where "close enough to a plan" is dangerous: `verifyPlan` reads `label`,
 * `model` and `kind` off every action, and an action missing them produces a
 * verification of nothing that still renders as a verification.
 */

const ON = new Date('2026-08-16T00:00:00Z');

const realPlan = () => {
  const records = Array.from({ length: 40 }, (_, i) =>
    JSON.stringify({
      model: 'claude-opus-5',
      label: 'classify',
      timestamp: new Date(Date.UTC(2026, 0, 1 + (i % 20))).toISOString(),
      usage: { input_tokens: 30_000, output_tokens: 400 },
    }),
  ).join('\n');
  const report = profileUsage(records, { catalogue: BUNDLED_CATALOGUE, on: ON });
  const levers = billLevers(report, { catalogue: BUNDLED_CATALOGUE, on: ON });
  return buildPlan(report, levers, BUNDLED_CATALOGUE.lastReviewed);
};

describe('parsePlanDocument', () => {
  it('reads back a plan this repository just wrote', () => {
    // The round trip is the whole contract. A validator that rejects the
    // output of `buildPlan` is worse than no validator.
    const plan = realPlan();
    const result = parsePlanDocument(JSON.stringify(plan));
    assert.equal(result.ok, true);
    assert.equal(result.plan.actions.length, plan.actions.length);
    assert.equal(result.plan.actions[0].label, plan.actions[0].label);
  });

  it('keeps every reason apart, because the fixes differ', () => {
    const cases = [
      ['{ not json', 'not-json'],
      ['[]', 'not-an-object'],
      ['"a string"', 'not-an-object'],
      ['{"schemaVersion":2,"actions":[]}', 'wrong-schema-version'],
      ['{"actions":[]}', 'wrong-schema-version'],
      ['{"schemaVersion":1}', 'actions-not-a-list'],
      ['{"schemaVersion":1,"actions":{}}', 'actions-not-a-list'],
    ];
    for (const [text, expected] of cases) {
      const result = parsePlanDocument(text);
      assert.equal(result.ok, false, text);
      assert.equal(result.why.kind, expected, text);
    }
  });

  it('reports which action is malformed, and what about it', () => {
    // "This is not a plan" with no position is a refusal somebody cannot act
    // on — a plan can hold a dozen actions and only one of them be wrong.
    const doc = {
      schemaVersion: 1,
      actions: [
        { kind: 'route', label: 'classify', model: 'claude-opus-5' },
        { kind: 'route', label: 'summarise' },
      ],
    };
    const result = parsePlanDocument(JSON.stringify(doc));
    assert.equal(result.ok, false);
    assert.equal(result.why.kind, 'action-malformed');
    assert.equal(result.why.index, 1);
    assert.match(result.why.because, /model/);
  });

  it('refuses an action kind nobody wrote', () => {
    const doc = {
      schemaVersion: 1,
      actions: [{ kind: 'delete-everything', label: 'x', model: 'claude-opus-5' }],
    };
    const result = parsePlanDocument(JSON.stringify(doc));
    assert.equal(result.ok, false);
    assert.equal(result.why.kind, 'action-malformed');
    assert.match(result.why.because, /route/);
  });

  it('catches the shape the old inline check let through', () => {
    /**
     * This is the case the validator exists for.
     *
     * The CLI checked `schemaVersion === 1 && Array.isArray(actions)` and
     * stopped there, which accepts an `actions` array of arbitrary objects.
     * `verifyPlan` would then read `label` off each one, find `undefined`,
     * match it against no slice in the log, and report `cannot-tell:
     * workload-vanished` — a verification of a plan that was never a plan,
     * rendered exactly like a real one.
     */
    const text = JSON.stringify({ schemaVersion: 1, actions: [{ note: 'todo' }] });
    const old = JSON.parse(text);
    assert.ok(old.schemaVersion === 1 && Array.isArray(old.actions), 'the old check passes this');
    assert.equal(parsePlanDocument(text).ok, false, 'and the new one does not');
  });

  it('accepts a plan with no actions, which is a real answer', () => {
    // A bill already on the cheapest model of its family, with no batch API
    // and nothing measured against it, plans nothing — and verifying that
    // plan should say "nothing to check", not "this is not a plan".
    const result = parsePlanDocument(JSON.stringify({ schemaVersion: 1, actions: [] }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.plan.actions, []);
  });

  it('does not reject a plan for fields verification never reads', () => {
    // A document format that rejects its own past is one nobody commits. The
    // check is deliberately shallow past `label`, `model` and `kind`.
    const doc = {
      schemaVersion: 1,
      actions: [{ kind: 'batch', label: 'x', model: 'claude-opus-5' }],
      somethingAddedInAFutureRelease: 42,
    };
    assert.equal(parsePlanDocument(JSON.stringify(doc)).ok, true);
  });
});
