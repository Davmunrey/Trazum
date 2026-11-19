import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  applyPlanEdit,
  isEditableFile,
  optimize,
  parsePlanDocument,
  planEditProblem,
  planEdits,
  planFileEdit,
  profileUsage,
  reorderForCache,
  verifyPlan,
} from '../dist/index.js';

/**
 * A plan action that is an edit to a tracked file (#796).
 *
 * What is held: the edit is the deterministic steps and nothing else, made
 * only on the file the plan saw and only to the text it promised; no saving
 * is projected; a plan from before the kind existed still parses; and verify
 * checks the file and the log, never one of them alone.
 *
 * Hand figures: three calls of 2,000 input tokens are 2,000 a call, the
 * baseline the edit is expected against.
 */

const ON = new Date('2026-08-16T00:00:00Z');
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const PROMPT = readFileSync(new URL('../../../examples/support-prompt.txt', import.meta.url), 'utf8');

const report = (inputPerCall, label = 'support') =>
  profileUsage(
    [1, 2, 3]
      .map((day) => JSON.stringify({ model: 'claude-opus-5', label, ts: `2026-08-0${day}T09:00:00Z`, usage: { input_tokens: inputPerCall, output_tokens: 100 } }))
      .join('\n'),
    { catalogue: BUNDLED_CATALOGUE, on: ON },
  );

const editAction = (steps = ['trim'], text = PROMPT) =>
  planFileEdit({
    report: report(2000),
    label: 'support',
    path: 'prompts/support.txt',
    text,
    steps,
    disabledRules: [],
    pricing: BUNDLED_CATALOGUE,
    digest: sha256,
  });

const planWith = (actions) => ({
  schemaVersion: 1,
  span: null,
  pricingLastReviewed: BUNDLED_CATALOGUE.lastReviewed,
  actions,
  projectedSavingUsd: 0,
  measuredStakeUsd: 0,
  totalUsd: 0.0375,
  batchExcludedUsd: 0,
});

describe('planFileEdit', () => {
  it('records the safe rules\' edit by hash, against the measured baseline, with no saving', () => {
    const action = editAction();
    assert.equal(action.kind, 'edit-file');
    assert.equal(action.savingUsd, null, 'an edit projected a saving');
    assert.equal(action.stakeUsd, null);
    assert.equal(action.detail.baseline.calls, 3);
    assert.equal(action.detail.baseline.inputPerCallTokens, 2000);
    const { edit } = action.detail;
    assert.equal(edit.beforeSha256, sha256(PROMPT));
    assert.equal(edit.afterSha256, sha256(optimize(PROMPT, { level: 'safe' }).optimized));
    assert.equal(edit.level, 'safe');
    assert.ok(edit.afterTokens < edit.beforeTokens);
    assert.equal('text' in edit, false, 'the plan carries text; it must carry only hashes');
  });

  it('reorders first, then trims, when asked for both', () => {
    const action = editAction(['trim', 'reorder']);
    assert.deepEqual(action.detail.edit.steps, ['reorder', 'trim']);
    const minimum = BUNDLED_CATALOGUE.byId.get('claude-opus-5').cacheMinTokens ?? 0;
    const expected = optimize(reorderForCache(PROMPT, { minPrefixTokens: minimum }).text, { level: 'safe' }).optimized;
    assert.equal(action.detail.edit.afterSha256, sha256(expected));
  });

  it('plans nothing for a file the rules leave alone, a workload with no traffic, or source code', () => {
    const done = optimize(PROMPT, { level: 'safe' }).optimized;
    assert.equal(editAction(['trim'], done), null);
    assert.equal(
      planFileEdit({ report: report(2000, 'other'), label: 'support', path: 'p.txt', text: PROMPT, steps: ['trim'], disabledRules: [], pricing: BUNDLED_CATALOGUE, digest: sha256 }),
      null,
    );
    assert.equal(isEditableFile('src/prompt.ts'), false);
    assert.equal(
      planFileEdit({ report: report(2000), label: 'support', path: 'src/prompt.ts', text: PROMPT, steps: ['trim'], disabledRules: [], pricing: BUNDLED_CATALOGUE, digest: sha256 }),
      null,
    );
  });
});

describe('applyPlanEdit', () => {
  const { edit } = editAction().detail;

  it('makes the promised text from the planned file, and only from it', () => {
    const made = applyPlanEdit(edit, PROMPT, sha256);
    assert.equal(made.ok, true);
    assert.equal(made.changed, true);
    assert.equal(sha256(made.text), edit.afterSha256);
  });

  it('says the edit is already made when the file holds the promised text', () => {
    const made = applyPlanEdit(edit, applyPlanEdit(edit, PROMPT, sha256).text, sha256);
    assert.deepEqual([made.ok, made.changed], [true, false]);
  });

  it('refuses a file that moved on since the plan', () => {
    assert.deepEqual(applyPlanEdit(edit, `${PROMPT}\nmore\n`, sha256), { ok: false, why: 'not-the-planned-file' });
  });

  it('refuses when the steps no longer give the promised text', () => {
    // A plan whose promise the rules do not keep: the other step's hash.
    const other = editAction(['reorder', 'trim']).detail.edit;
    const crossed = { ...edit, afterSha256: other.afterSha256 === edit.afterSha256 ? '0'.repeat(64) : other.afterSha256 };
    assert.deepEqual(applyPlanEdit(crossed, PROMPT, sha256), { ok: false, why: 'steps-disagree' });
  });

  it('refuses an edit to source code, or at another level, whatever the hashes say', () => {
    assert.deepEqual(applyPlanEdit({ ...edit, path: 'src/prompt.ts' }, PROMPT, sha256), { ok: false, why: 'not-an-edit' });
    assert.deepEqual(applyPlanEdit({ ...edit, level: 'aggressive' }, PROMPT, sha256), { ok: false, why: 'not-an-edit' });
  });
});

describe('parsePlanDocument with edits', () => {
  it('reads back a plan carrying an edit', () => {
    const plan = planWith([editAction()]);
    const parsed = parsePlanDocument(JSON.stringify(plan));
    assert.equal(parsed.ok, true);
    assert.equal(planEdits(parsed.plan).length, 1);
  });

  it('still reads a plan written before the kind existed', () => {
    // Written by hand in the shape docs/plan-format.md gave the document at
    // 3.0.1: every kind it had, and no `edit`. VERSIONING.md: inside 3.x a
    // plan document only gains fields, so this has to keep parsing.
    const older = {
      schemaVersion: 1,
      span: { fromMs: 1785574800000, toMs: 1785747600000 },
      pricingLastReviewed: '2026-11-05',
      actions: [
        { kind: 'route+batch', label: 'support', model: 'claude-opus-5', savingUsd: 0.03, stakeUsd: null, assumes: [{ kind: 'model-capability', model: 'Claude Sonnet 5.5' }, { kind: 'batch-window' }], check: 'trazum route <log> --prompt-file <prompt> --cases <cases>', detail: { routeTo: { id: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5' }, baseline: { calls: 3, usd: 0.0375, inputPerCallTokens: 2000, outputPerCallTokens: 100 } } },
        { kind: 'fix-truncation', label: 'digest', model: 'claude-opus-5', savingUsd: null, stakeUsd: 8, assumes: [{ kind: 'retry-pattern-real' }, { kind: 'max-tokens-fits' }], check: null, detail: { measured: { wastedUsd: 4, retryUsd: 4, retried: 2, truncatedCalls: 2 } } },
        { kind: 'fix-caching', label: 'rag', model: 'claude-opus-5', savingUsd: null, stakeUsd: 1, assumes: [{ kind: 'traffic-pattern-holds' }], check: null, detail: {} },
        { kind: 'batch', label: 'nightly', model: 'claude-opus-5', savingUsd: 1, stakeUsd: null, assumes: [{ kind: 'batch-window' }], check: null, detail: {} },
        { kind: 'route', label: 'tag', model: 'claude-opus-5', savingUsd: 1, stakeUsd: null, assumes: [], check: null, detail: { routeTo: { id: 'claude-haiku-4-5', displayName: 'Claude Haiku 4.5' } } },
      ],
      projectedSavingUsd: 2.03,
      measuredStakeUsd: 9,
      totalUsd: 20,
      createdAt: '2026-11-18T09:00:00.000Z',
    };
    const parsed = parsePlanDocument(JSON.stringify(older));
    assert.equal(parsed.ok, true, JSON.stringify(parsed.why));
    assert.equal(planEdits(parsed.plan).length, 0);
    const verification = verifyPlan(parsed.plan, report(2000), { currentPricingLastReviewed: '2026-11-05' });
    assert.equal(verification.actions.length, 5);
  });

  it('refuses an edit a later step could be pointed somewhere with', () => {
    const { edit } = editAction().detail;
    const refused = [
      { ...edit, path: '../outside.txt' },
      { ...edit, path: '/etc/passwd' },
      { ...edit, path: 'C:/x.txt' },
      { ...edit, path: 'a\\b.txt' },
      { ...edit, path: '.git/config' },
      { ...edit, path: 'prompts//support.txt' },
      { ...edit, path: 'prompts/./support.txt' },
      { ...edit, steps: ['rewrite'] },
      { ...edit, steps: [] },
      { ...edit, steps: ['trim', 'trim'] },
      { ...edit, level: 'aggressive' },
      { ...edit, beforeSha256: 'abc' },
      { ...edit, afterSha256: edit.beforeSha256 },
      { ...edit, disabledRules: 'all' },
    ];
    for (const bad of refused) {
      assert.notEqual(planEditProblem(bad), null, `accepted ${JSON.stringify(bad).slice(0, 80)}`);
      const action = { ...editAction(), detail: { ...editAction().detail, edit: bad } };
      const parsed = parsePlanDocument(JSON.stringify(planWith([action])));
      assert.equal(parsed.ok, false);
      assert.equal(parsed.why.kind, 'action-malformed');
    }
    const missing = { ...editAction(), detail: { baseline: editAction().detail.baseline } };
    assert.equal(parsePlanDocument(JSON.stringify(planWith([missing]))).ok, false, 'an edit-file action with no edit was read');
  });
});

describe('verifyPlan on an edit', () => {
  const action = editAction();
  const { edit } = action.detail;
  const plan = planWith([action]);
  const check = (files, inputPerCall = 1500) =>
    verifyPlan(plan, report(inputPerCall), { currentPricingLastReviewed: plan.pricingLastReviewed, files }).actions[0];

  it('cannot tell where nothing read the file, and fails no gate for it', () => {
    const v = verifyPlan(plan, report(1500), { currentPricingLastReviewed: plan.pricingLastReviewed });
    assert.deepEqual([v.actions[0].outcome, v.actions[0].reason, v.actions[0].gateFailing], ['cannot-tell', 'file-not-read', false]);
  });

  it('arrives only when the file holds the promised text and the calls got shorter', () => {
    const v = check(new Map([[edit.path, edit.afterSha256]]));
    assert.deepEqual([v.outcome, v.gateFailing], ['arrived', false]);
    assert.equal(v.observed.inputPerCallTokens, 1500);
    assert.equal(v.observed.inputPerCallTokensBefore, 2000);
  });

  it('did not arrive when the edit landed and the calls are as long', () => {
    const v = check(new Map([[edit.path, edit.afterSha256]]), 2000);
    assert.deepEqual([v.outcome, v.gateFailing], ['not-arrived', true]);
  });

  it('did not arrive when the file is still the one the plan saw, however short the calls', () => {
    const v = check(new Map([[edit.path, edit.beforeSha256]]));
    assert.deepEqual([v.outcome, v.gateFailing], ['not-arrived', true]);
  });

  it('cannot tell, and fails the gate, when the file moved on or went', () => {
    for (const now of ['f'.repeat(64), null]) {
      const v = check(new Map([[edit.path, now]]));
      assert.deepEqual([v.outcome, v.reason, v.gateFailing], ['cannot-tell', 'file-changed', true]);
    }
  });

  it('cannot tell when the workload vanished from the newer log', () => {
    const v = verifyPlan(plan, report(1500, 'elsewhere'), {
      currentPricingLastReviewed: plan.pricingLastReviewed,
      files: new Map([[edit.path, edit.afterSha256]]),
    }).actions[0];
    assert.deepEqual([v.outcome, v.reason, v.gateFailing], ['cannot-tell', 'workload-vanished', false]);
  });
});
