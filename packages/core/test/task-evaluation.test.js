import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeTask, evaluateTasks, parseTaskEvaluationPlan, MAX_EVALUATION_PAIRS } from '../dist/index.js';

// Each call is 100 (or `amount`) fresh input, 20 output and 40 cache-read
// tokens, and every transcript has two calls. So a report at amount 100 is
// 2 x (100 + 20 + 40) = 320 tokens, and one at amount 50 is 2 x 110 = 220.
const jsonl = (...rows) => rows.map((row) => JSON.stringify(row)).join('\n');
const call = (session, id, amount, failed) => [
  { type: 'assistant', sessionId: session, requestId: `request-${session}-${id}`, timestamp: '2026-11-21T09:00:00Z',
    message: { model: 'claude-sonnet-4-6', usage: { input_tokens: amount, output_tokens: 20, cache_read_input_tokens: 40, cache_creation_input_tokens: 0 },
      content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: 'SYNTHETIC_PATH' } }] } },
  { type: 'user', sessionId: session, message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'SYNTHETIC_RESULT', is_error: failed }] } },
];
const report = (session, amount, overrides = {}, failed = false) => analyzeTask({
  taskId: `task-${session}`, taskType: 'fix-test', criterion: 'The synthetic checks pass.',
  sources: [{ format: 'claude-code', text: jsonl(...call(session, 'call-1', amount, failed), ...call(session, 'call-2', amount, failed)) }],
  outcome: 'accepted', assessor: 'synthetic-reviewer', ...overrides,
});
const baseline = (session, overrides, failed) => report(session, 100, overrides, failed);
const policy = (session, overrides) => report(session, 50, { policyId: 'repeat-review-v1', ...overrides });
const plan = (overrides = {}) => ({
  version: 1, kind: 'trazum-task-evaluation-plan', policyId: 'repeat-review-v1',
  minimumPairs: 3, minimumTokenReductionPercent: 10, maximumAcceptanceDropPoints: 34, ...overrides,
});

// Three pairs that match, then three that do not, one for each reason.
const fixture = () => [
  { before: baseline('b1'), after: policy('a1') },
  { before: baseline('b2', {}, true), after: policy('a2') },
  { before: baseline('b3'), after: policy('a3', { outcome: 'rejected' }) },
  { before: baseline('b4'), after: policy('a4', { outcome: 'unknown', assessor: undefined }) },
  { before: baseline('b5'), after: policy('a5', { criterion: 'Some other criterion.' }) },
  { before: baseline('b1'), after: policy('a6') },
];

describe('task evaluation over matched pairs', () => {
  it('prices each arm per accepted task, counting a rejected run against its arm', () => {
    const result = evaluateTasks(plan(), fixture());
    assert.equal(result.kind, 'trazum-task-evaluation');
    // Baseline: three accepted runs of 320 tokens. 960 / 3 = 320.
    assert.equal(result.baseline.runs, 3);
    assert.equal(result.baseline.accepted, 3);
    assert.equal(result.baseline.totalTokens, 960);
    assert.equal(result.baseline.tokensPerAcceptedTask, 320);
    assert.equal(result.baseline.acceptanceRate, 100);
    // Policy: three runs of 220 tokens, one rejected. 660 / 2 = 330, not 440 / 2.
    assert.equal(result.policy.runs, 3);
    assert.equal(result.policy.accepted, 2);
    assert.equal(result.policy.rejected, 1);
    assert.equal(result.policy.totalTokens, 660);
    assert.equal(result.policy.tokensPerAcceptedTask, 330);
    // (330 - 320) / 320 = +3.125%: more tokens per accepted task, not fewer.
    assert.equal(result.change.tokensPerAcceptedTaskPercent, 3.125);
    assert.equal(result.change.acceptanceRatePoints, 2 / 3 * 100 - 100);
    // A drop of 33.3 points is inside the 34 allowed; +3.125% misses a 10% fall.
    assert.equal(result.verdict, 'below-bar');
    assert.deepEqual(result.reasons, ['paired-observation-not-causal']);
  });

  it('keeps every pair that does not match, with its reasons, out of the arms', () => {
    const { pairs } = evaluateTasks(plan(), fixture());
    assert.equal(pairs.length, 6);
    assert.deepEqual(pairs.map((pair) => pair.included), [true, true, true, false, false, false]);
    assert.deepEqual(pairs[3].reasons, ['outcome-unknown']);
    assert.deepEqual(pairs[4].reasons, ['criterion-mismatch']);
    assert.deepEqual(pairs[5].reasons, ['source-reuse-across-pairs']);
    assert.deepEqual(pairs[2].after, { taskId: 'task-a3', outcome: 'rejected', totalTokens: 220 });
  });

  it('counts the repeated failures and duplicate calls in each arm', () => {
    const result = evaluateTasks(plan(), fixture());
    // Pair 2's baseline failed the same read twice.
    assert.equal(result.baseline.repeatedFailures, 2);
    assert.equal(result.policy.repeatedFailures, 0);
    assert.equal(result.baseline.duplicateCalls, 0);
  });

  it('sums the API-equivalent figure only when every run in the arm is priced', () => {
    const pairs = fixture();
    const result = evaluateTasks(plan(), pairs);
    const usd = (reports) => reports.reduce((sum, item) => sum + item.usage.apiEquivalentUsd, 0);
    const before = pairs.slice(0, 3).map((pair) => pair.before);
    const after = pairs.slice(0, 3).map((pair) => pair.after);
    assert.ok(before.every((item) => item.usage.apiEquivalentUsd > 0));
    assert.equal(result.baseline.apiEquivalentUsd, usd(before));
    assert.equal(result.baseline.apiEquivalentUsdPerAcceptedTask, usd(before) / 3);
    assert.equal(result.policy.apiEquivalentUsdPerAcceptedTask, usd(after) / 2);
  });

  it('clears the bar when tokens per accepted task fall far enough and acceptance holds', () => {
    const pairs = fixture().slice(0, 3);
    pairs[2] = { before: baseline('b3'), after: policy('a3') };
    const result = evaluateTasks(plan(), pairs);
    // 660 / 3 = 220 against 320: (220 - 320) / 320 = -31.25%.
    assert.equal(result.change.tokensPerAcceptedTaskPercent, -31.25);
    assert.equal(result.verdict, 'clears-bar');
    // The same fall misses a bar of 40%.
    assert.equal(evaluateTasks(plan({ minimumTokenReductionPercent: 40 }), pairs).verdict, 'below-bar');
    // And clears one of exactly 31.25%.
    assert.equal(evaluateTasks(plan({ minimumTokenReductionPercent: 31.25 }), pairs).verdict, 'clears-bar');
  });

  it('fails the quality bar when acceptance drops more than the plan allows, whatever the tokens', () => {
    const result = evaluateTasks(plan({ maximumAcceptanceDropPoints: 30, minimumTokenReductionPercent: 1 }), fixture());
    assert.equal(result.verdict, 'quality-bar-failed');
    assert.deepEqual(result.reasons, ['acceptance-dropped-past-bar']);
  });

  it('is inconclusive with fewer matched pairs than the plan asks for', () => {
    const result = evaluateTasks(plan({ minimumPairs: 4 }), fixture());
    assert.equal(result.verdict, 'inconclusive');
    assert.deepEqual(result.reasons, ['too-few-matched-pairs']);
    // The arms are still reported, so the figures are not lost.
    assert.equal(result.policy.tokensPerAcceptedTask, 330);
  });

  it('is inconclusive when no policy run was accepted and the drop is allowed', () => {
    const pairs = [1, 2].map((n) => ({ before: baseline(`b${n}`), after: policy(`a${n}`, { outcome: 'rejected' }) }));
    const result = evaluateTasks(plan({ minimumPairs: 2, maximumAcceptanceDropPoints: 100 }), pairs);
    assert.equal(result.verdict, 'inconclusive');
    assert.deepEqual(result.reasons, ['no-accepted-policy-run']);
    assert.equal(result.policy.tokensPerAcceptedTask, null);
    assert.equal(result.change.tokensPerAcceptedTaskPercent, null);
  });

  it('says the plan is a declaration and the policy text is in the measured usage', () => {
    const { limitations } = evaluateTasks(plan(), fixture());
    assert.ok(limitations.some((line) => line.includes('cannot tell whether it was fixed before the runs')));
    assert.ok(limitations.some((line) => line.includes("already in the policy arm's measured usage")));
  });

  it('keeps no transcript text in what it returns', () => {
    const serialized = JSON.stringify(evaluateTasks(plan(), fixture()));
    for (const secret of ['SYNTHETIC_PATH', 'SYNTHETIC_RESULT', 'request-b1']) assert.ok(!serialized.includes(secret), secret);
  });
});

describe('task evaluation plan', () => {
  it('reads a plan and refuses one that does not hold to its fields', () => {
    assert.deepEqual(parseTaskEvaluationPlan(JSON.stringify(plan())), plan());
    for (const bad of [
      { ...plan(), extra: true },
      plan({ minimumPairs: 1 }),
      plan({ minimumPairs: MAX_EVALUATION_PAIRS + 1 }),
      plan({ minimumPairs: 2.5 }),
      plan({ minimumTokenReductionPercent: 0 }),
      plan({ minimumTokenReductionPercent: 100 }),
      plan({ maximumAcceptanceDropPoints: -1 }),
      plan({ maximumAcceptanceDropPoints: 101 }),
      plan({ policyId: 'baseline' }),
      plan({ kind: 'trazum-task' }),
    ]) assert.throws(() => parseTaskEvaluationPlan(JSON.stringify(bad)), /Invalid task data/, JSON.stringify(bad));
    assert.throws(() => parseTaskEvaluationPlan('not json'), /Invalid task data/);
  });

  it('refuses no pairs, and more pairs than it can report', () => {
    assert.throws(() => evaluateTasks(plan(), []), /Invalid task data/);
    const pair = { before: baseline('b1'), after: policy('a1') };
    assert.throws(() => evaluateTasks(plan(), Array.from({ length: MAX_EVALUATION_PAIRS + 1 }, () => pair)), /Invalid task data/);
  });
});
