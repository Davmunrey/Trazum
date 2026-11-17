import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUNDLED_CATALOGUE,
  billLevers,
  buildPlan,
  claudeCodeRecords,
  codexRecords,
  geminiCliRecords,
  parseUsageLine,
  profileUsage,
} from '../dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Which calls the Batch API lever may count.
 *
 * The lever was offered to every slice whose provider sells a Batch API, and
 * two kinds of call cannot take it. A call that already ran there is billed at
 * half and cannot be halved again: twenty such calls, a $0.07 bill, were
 * offered "$0.0350 projected". And a call something waited on cannot wait a
 * day: a converted Claude Code session was told to "route and batch" every
 * turn of an agent loop, $9.13 projected against a $12.70 bill, on the
 * assumption that "these calls can wait for a batch window". The plan printed
 * the assumption, so it did not lie. It asked the reader a question the log
 * could have answered, and counted the answer into the total before it came.
 *
 * Figures below are arithmetic done by hand on Opus 5 at $5/$25 and Sonnet 5.5
 * at $2/$10, the same pair `levers.test.js` uses, with batch at half.
 */
const ON = new Date('2026-08-16T00:00:00Z');
const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), { catalogue: BUNDLED_CATALOGUE, on: ON });
const levers = (records) => billLevers(profile(records), { catalogue: BUNDLED_CATALOGUE, on: ON });
const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'support-rag',
  usage: { input_tokens: 9000, output_tokens: 300 },
  ...over,
});
const many = (n, over) => Array.from({ length: n }, () => call(over));
const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

describe('a log that marks nothing', () => {
  it('is read exactly as before: every call may move', () => {
    // 400 calls: 3.6M input = $18.00, 120k output = $3.00. Half of $21.00 is $10.50.
    // Routed to Sonnet 5.5 the same tokens are $8.40, and half of that again is
    // $4.20, so both together save $16.80.
    const result = levers(many(400));
    const [slice] = result.slices;
    near(slice.batch.savingUsd, 10.5, 'batch');
    near(slice.route.savingUsd, 12.6, 'route');
    near(slice.combinedUsd, 16.8, 'both');
    assert.equal(result.batchExcludedUsd, 0);
    assert.equal(profile(many(400)).total.batchExcludedUsd, 0);
  });
});

describe('a call that already ran on the Batch API', () => {
  it('is not offered the Batch API again', () => {
    // Billed at half: 3.6M input at $2.50 = $9.00, 120k output at $12.50 = $1.50.
    const result = levers(many(400, { batch: true }));
    const [slice] = result.slices;
    near(slice.spentUsd, 10.5, 'spent');
    assert.equal(slice.batch, null, 'a batch lever on calls already batched');
    near(result.batchExcludedUsd, 10.5, 'left out');
  });

  it('leaves no action at all where routing has nowhere to go', () => {
    // Haiku 5.5 is the bottom of its ladder: with no batch lever there is no lever.
    const records = many(20, { model: 'claude-haiku-5-5', batch: true });
    const report = profile(records);
    const plan = buildPlan(report, billLevers(report, { catalogue: BUNDLED_CATALOGUE, on: ON }), 'test');
    assert.deepEqual(plan.actions, []);
    assert.equal(plan.projectedSavingUsd, 0);
    assert.ok(plan.batchExcludedUsd > 0, 'the plan does not say what it left out');
    near(plan.batchExcludedUsd, report.total.inputUsd + report.total.outputUsd, 'left out');
  });

  it('reads Anthropic\'s own field the same way as the flag', () => {
    const flagged = levers(many(400, { batch: true }));
    const native = levers(many(400, { usage: { input_tokens: 9000, output_tokens: 300, service_tier: 'batch' } }));
    assert.equal(native.slices[0].batch, null);
    near(native.batchExcludedUsd, flagged.batchExcludedUsd, 'service_tier');
  });
});

describe('a call something waited on', () => {
  it('is left out of the batch lever, and the route stands alone', () => {
    const result = levers(many(400, { interactive: true }));
    const [slice] = result.slices;
    assert.equal(slice.batch, null, 'a batch lever on interactive calls');
    near(slice.route.savingUsd, 12.6, 'route');
    near(slice.combinedUsd, 12.6, 'the route alone');
    near(result.batchExcludedUsd, 21, 'left out');

    const report = profile(many(400, { interactive: true }));
    const plan = buildPlan(report, result, 'test');
    assert.deepEqual(plan.actions.map((a) => a.kind), ['route']);
    assert.deepEqual(plan.actions[0].assumes.map((a) => a.kind), ['model-capability']);
    near(plan.batchExcludedUsd, 21, 'the plan says what it left out');
  });

  it('prices a mixed slice on the calls that can move, at each model\'s own rate', () => {
    /**
     * 300 calls may move, 100 are interactive. The 100: 900k input = $4.50 and
     * 30k output = $0.75, so $5.25 is left out and $15.75 stays: half is
     * $7.875. Routed, the 300 are 2.7M input at $2 = $5.40 and 90k output at
     * $10 = $0.90, so $6.30, and half of that comes off the routed $8.40:
     * $5.25 left to pay, $15.75 saved.
     */
    const result = levers([...many(300), ...many(100, { interactive: true })]);
    const [slice] = result.slices;
    near(slice.spentUsd, 21, 'spent');
    near(slice.batch.savingUsd, 7.875, 'batch');
    near(slice.route.savingUsd, 12.6, 'route');
    near(slice.combinedUsd, 15.75, 'both');
    near(result.batchExcludedUsd, 5.25, 'left out');
  });

  it('is read from true and from nothing else', () => {
    const read = (value) => parseUsageLine(JSON.stringify(call({ interactive: value })));
    assert.equal(read(true).interactive, true);
    for (const value of [false, 'true', 1, null, 'yes']) {
      assert.equal(read(value).interactive, undefined, `interactive: ${JSON.stringify(value)}`);
    }
    assert.equal(parseUsageLine(JSON.stringify(call())).interactive, undefined);
  });

  it('is counted, so a report can say how much of the log was marked', () => {
    const report = profile([...many(3), ...many(2, { interactive: true })]);
    assert.equal(report.fieldCoverage.interactive, 2);
    assert.equal(report.fieldCoverage.parsed, 5);
  });
});

describe('a breakdown from before the fields existed', () => {
  it('prices the lever as it always did', () => {
    // A saved profile from 2.7.9 carries no `batchExcluded*`: it excluded nothing.
    const report = profile(many(400));
    for (const slice of [report.total, ...report.byLabelAndModel.map((s) => s.breakdown)]) {
      delete slice.batchExcludedInputTokens;
      delete slice.batchExcludedOutputTokens;
      delete slice.batchExcludedUsd;
    }
    const result = billLevers(report, { catalogue: BUNDLED_CATALOGUE, on: ON });
    near(result.slices[0].batch.savingUsd, 10.5, 'batch');
    near(result.slices[0].combinedUsd, 16.8, 'both');
    assert.equal(result.batchExcludedUsd, 0);
  });
});

describe('what a coding agent\'s session says of itself', () => {
  const planOf = (records) => {
    const report = profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
      catalogue: BUNDLED_CATALOGUE,
      on: ON,
    });
    return buildPlan(report, billLevers(report, { catalogue: BUNDLED_CATALOGUE, on: ON }), 'test');
  };

  it('Claude Code: every line is marked, and no turn is offered the Batch API', () => {
    const dir = join(ROOT, 'examples/claude-projects');
    const files = readdirSync(dir, { recursive: true }).filter((name) => String(name).endsWith('.jsonl'));
    const records = files.flatMap((file) => claudeCodeRecords(readFileSync(join(dir, String(file)), 'utf8')).records);
    assert.ok(records.length >= 100, `only ${records.length} records in the examples`);
    assert.ok(records.every((record) => record.interactive === true), 'a Claude Code line not marked interactive');
    const plan = planOf(records.map((record) => ({ ...record, label: 'project' })));
    assert.ok(plan.actions.length > 0, 'the examples no longer yield a plan');
    for (const action of plan.actions) {
      assert.equal(action.kind, 'route', `${action.kind} offered to a coding agent's turns`);
      assert.ok(!action.assumes.some((a) => a.kind === 'batch-window'), 'asked whether an agent loop can wait a day');
    }
    assert.ok(plan.batchExcludedUsd > 0);
  });

  it('Codex: every line is marked', () => {
    const usage = { input_tokens: 100, cached_input_tokens: 40, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 120 };
    const text = [
      { type: 'session_meta', payload: { id: 'synthetic-session', cwd: 'SYNTHETIC' } },
      { type: 'turn_context', payload: { model: 'gpt-4o' } },
      {
        timestamp: '2026-10-12T10:00:00Z',
        type: 'event_msg',
        payload: { type: 'token_count', info: { total_token_usage: usage, last_token_usage: usage, model_context_window: 200000 } },
      },
    ].map((row) => JSON.stringify(row)).join('\n');
    const { records } = codexRecords(text);
    assert.equal(records.length, 1);
    assert.equal(records[0].interactive, true);
    assert.equal(parseUsageLine(JSON.stringify(records[0])).interactive, true);
  });

  it('Gemini CLI: every line is marked', () => {
    const dir = join(ROOT, 'examples/gemini-tmp');
    const files = readdirSync(dir, { recursive: true })
      .map(String)
      .filter((name) => name.endsWith('.json') || name.endsWith('.jsonl'));
    const records = files.flatMap((file) => geminiCliRecords(readFileSync(join(dir, file), 'utf8')).records);
    assert.ok(records.length > 0, 'the Gemini CLI examples yield no records');
    assert.ok(records.every((record) => record.interactive === true), 'a Gemini CLI line not marked interactive');
  });
});
