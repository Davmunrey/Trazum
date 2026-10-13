import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeTask, compareTasks, parseTaskReport, taskPolicy, TASK_POLICY_INSTRUCTIONS, MAX_INPUT_CHARS, BUNDLED_CATALOGUE } from '../dist/index.js';

const jsonl = (...rows) => rows.map((row) => typeof row === 'string' ? row : JSON.stringify(row)).join('\n');
const usage = (input = 100) => ({ input_tokens: input, output_tokens: 20, cache_read_input_tokens: 40, cache_creation_input_tokens: 0 });
const assistant = (session = 'synthetic-before', id = 'call-1', input = { file_path: 'SYNTHETIC_PRIVATE_PATH' }, amount = 100, name = 'Read') => ({
  type: 'assistant', sessionId: session, requestId: `request-${id}`, timestamp: '2026-10-13T09:00:00Z', cwd: 'SYNTHETIC_CWD',
  message: { model: 'claude-sonnet-4-6', usage: usage(amount), content: [{ type: 'tool_use', id, name, input }] },
});
const result = (session = 'synthetic-before', id = 'call-1', content = 'SYNTHETIC_PRIVATE_RESULT', failed = false) => ({
  type: 'user', sessionId: session, message: { content: [{ type: 'tool_result', tool_use_id: id, content, is_error: failed }] },
});
const transcript = (session = 'synthetic-before', amount = 100) => jsonl(
  assistant(session, 'call-1', undefined, amount), result(session, 'call-1'),
  assistant(session, 'call-2', undefined, amount), result(session, 'call-2'),
);
const input = (text = transcript(), overrides = {}) => ({
  taskId: 'synthetic-task', taskType: 'fix-test', criterion: 'The supplied synthetic checks pass.',
  sources: [{ format: 'claude-code', text }], ...overrides,
});
const report = (session = 'synthetic-before', amount = 100, overrides = {}) => analyzeTask(input(transcript(session, amount), {
  outcome: 'accepted', assessor: 'synthetic-reviewer', ...overrides,
}));
const codexUsage = (input = 100, output = 20) => ({ input_tokens: input, cached_input_tokens: 40, output_tokens: output, reasoning_output_tokens: 5, total_tokens: input + output });
const codexTranscript = (session = 'synthetic-codex', amount = 100) => jsonl(
  { type: 'session_meta', payload: { id: session } },
  { type: 'turn_context', payload: { model: 'gpt-4o' } },
  { timestamp: '2026-10-13T09:00:00Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: codexUsage(amount), last_token_usage: codexUsage(amount) } } },
  ...[1, 2].flatMap((n) => [
    { type: 'response_item', payload: { type: 'function_call', call_id: `call-${n}`, name: 'read_file', arguments: JSON.stringify({ path: 'SYNTHETIC_CODEX_PATH' }) } },
    { type: 'response_item', payload: { type: 'function_call_output', call_id: `call-${n}`, output: 'SYNTHETIC_CODEX_CONTENT' } },
  ]),
);

describe('task transcript evidence', () => {
  it('aggregates existing native usage and publishes only bounded evidence references', () => {
    const measured = report();
    assert.deepEqual(measured.coverage.gaps, []);
    assert.equal(measured.usage.records, 2);
    assert.equal(measured.usage.totalTokens, 320);
    assert.equal(measured.usage.cacheReadTokens, 80);
    assert.ok(measured.usage.apiEquivalentUsd > 0);
    assert.deepEqual(measured.usage.pricing, { source: 'bundled', lastReviewed: BUNDLED_CATALOGUE.lastReviewed, basis: 'api-equivalent' });
    assert.deepEqual(measured.tools.findings, [{ kind: 'repeated-result', category: 'read', count: 2, occurrences: [
      { source: 1, line: 1, resultLine: 2 }, { source: 1, line: 3, resultLine: 4 },
    ] }]);
    const serialized = JSON.stringify(measured);
    for (const secret of ['SYNTHETIC_PRIVATE_PATH', 'SYNTHETIC_PRIVATE_RESULT', 'SYNTHETIC_CWD', 'synthetic-before', 'request-call', 'tool_use']) assert.ok(!serialized.includes(secret));
    assert.deepEqual(parseTaskReport(serialized), measured);
  });

  it('recognizes Codex function calls without adding cached or reasoning tokens twice', () => {
    const measured = analyzeTask(input('', { sources: [{ format: 'codex', text: codexTranscript() }] }));
    assert.equal(measured.usage.totalTokens, 120);
    assert.equal(measured.usage.inputTokens, 60);
    assert.equal(measured.usage.cacheReadTokens, 40);
    assert.equal(measured.usage.outputTokens, 20);
    assert.equal(measured.tools.findings[0].category, 'read');
    assert.deepEqual(measured.tools.findings[0].occurrences, [{ source: 1, line: 4, resultLine: 5 }, { source: 1, line: 6, resultLine: 7 }]);
    assert.ok(!JSON.stringify(measured).includes('SYNTHETIC_CODEX'));
    assert.deepEqual(parseTaskReport(JSON.stringify(measured)), measured);
  });

  it('deduplicates replayed call IDs and native request IDs', () => {
    const text = jsonl(assistant(), result(), assistant(), result());
    const measured = analyzeTask(input(text));
    assert.equal(measured.usage.records, 1);
    assert.equal(measured.sources[0].diagnostics.collapsed, 1);
    assert.equal(measured.tools.calls, 1);
    assert.equal(measured.tools.duplicateCalls, 1);
    assert.equal(measured.tools.findings.length, 0);
  });

  it('canonicalizes object keys while preserving array ordering', () => {
    const text = jsonl(
      assistant('s', 'a', { pattern: 'synthetic', glob: '*.ts' }), result('s', 'a', { a: 1, b: 2 }),
      assistant('s', 'b', { glob: '*.ts', pattern: 'synthetic' }), result('s', 'b', { b: 2, a: 1 }),
      assistant('s', 'c', { pattern: ['a', 'b'] }), result('s', 'c'),
      assistant('s', 'd', { pattern: ['b', 'a'] }), result('s', 'd'),
    );
    assert.equal(analyzeTask(input(text)).tools.findings[0].count, 2);
  });

  it('does not label changed outputs or missing results as repeated results', () => {
    const text = jsonl(assistant('s', 'a'), result('s', 'a', 'version-1'), assistant('s', 'b'), result('s', 'b', 'version-2'), assistant('s', 'c'));
    const measured = analyzeTask(input(text));
    assert.equal(measured.tools.findings.length, 0);
    assert.equal(measured.tools.missingResults, 1);
    assert.ok(measured.coverage.gaps.includes('incomplete-tools'));
  });

  it('does not join calls or results across sessions or sources', () => {
    const text = jsonl(assistant('a', 'a'), result('a', 'a'), assistant('b', 'b'), result('b', 'b'));
    const measured = analyzeTask(input(text));
    assert.equal(measured.sources[0].sessionCount, 2);
    assert.equal(measured.tools.findings.length, 0);
    const separate = analyzeTask(input('', { sources: [{ format: 'claude-code', text: jsonl(assistant('a', 'a'), result('a', 'a')) }, { format: 'claude-code', text: jsonl(assistant('b', 'b'), result('b', 'b')) }] }));
    assert.equal(separate.usage.records, 2);
    assert.equal(separate.tools.findings.length, 0);
  });

  it('requires explicit failure evidence and never infers failure from prose', () => {
    const text = jsonl(assistant('s', 'a', {}, 100, 'Bash'), result('s', 'a', 'synthetic failure', true), assistant('s', 'b', {}, 100, 'Bash'), result('s', 'b', 'synthetic failure', true));
    const failed = analyzeTask(input(text));
    assert.equal(failed.tools.findings[0].kind, 'repeated-failure');
    assert.equal(taskPolicy(failed).id, 'repeat-review-v1');
    const successful = analyzeTask(input(text.replaceAll('"is_error":true', '"is_error":false')));
    assert.equal(successful.tools.findings[0].kind, 'repeated-result');
    assert.throws(() => taskPolicy(successful), /No actionable/);
    const codex = analyzeTask(input('', { sources: [{ format: 'codex', text: codexTranscript().replaceAll('read_file', 'exec_command').replaceAll('SYNTHETIC_CODEX_CONTENT', 'exit code 1: error') }] }));
    assert.equal(codex.tools.findings[0].kind, 'repeated-result');
    assert.throws(() => taskPolicy(codex), /No actionable/);
  });

  it('refuses ambiguous results and conflicting replays', () => {
    const text = jsonl(assistant('s', 'a'), result('s', 'a'), result('s', 'a', 'changed'), assistant('s', 'b'), result('s', 'b'));
    const measured = analyzeTask(input(text));
    assert.equal(measured.tools.findings.length, 0);
    assert.equal(measured.tools.unsupported, 1);
    assert.equal(measured.tools.missingResults, 1);
    const conflicting = analyzeTask(input(jsonl(assistant(), assistant(undefined, undefined, { changed: true }), result())));
    assert.equal(conflicting.tools.missingResults, 1);
    assert.equal(conflicting.tools.unsupported, 1);
  });

  it('marks orphan outputs and unsupported Codex tool envelopes as incomplete', () => {
    const orphan = analyzeTask(input(jsonl(assistant(), result(), result('synthetic-before', 'missing-call'))));
    assert.equal(orphan.tools.unsupported, 1);
    assert.ok(orphan.coverage.gaps.includes('incomplete-tools'));
    const custom = analyzeTask(input('', { sources: [{ format: 'codex', text: `${codexTranscript()}\n${jsonl({ type: 'response_item', payload: { type: 'custom_tool_call', name: 'SYNTHETIC_PRIVATE_TOOL', input: 'SYNTHETIC_PRIVATE_INPUT' } })}` }] }));
    assert.equal(custom.tools.unsupported, 1);
    assert.ok(custom.coverage.gaps.includes('incomplete-tools'));
    assert.ok(!JSON.stringify(custom).includes('SYNTHETIC_PRIVATE'));
  });

  it('isolates Codex namespaces and refuses encrypted or mismatched tool evidence', () => {
    const rows = codexTranscript().split('\n').map(JSON.parse);
    rows[3].payload.namespace = 'SYNTHETIC_NAMESPACE_ONE';
    rows[5].payload.namespace = 'SYNTHETIC_NAMESPACE_TWO';
    const namespaced = analyzeTask(input('', { sources: [{ format: 'codex', text: jsonl(...rows) }] }));
    assert.equal(namespaced.tools.findings.length, 0);
    assert.ok(!JSON.stringify(namespaced).includes('SYNTHETIC_NAMESPACE'));
    for (const mutate of [
      (r) => { r[3].payload.namespace = []; },
      (r) => { r[3].payload.encrypted_function_args = ['SYNTHETIC_ENCRYPTED']; },
      (r) => { r[4].payload.namespace = 'mismatched'; },
      (r) => { r[4].payload.name = 'mismatched'; },
      (r) => { r[4].payload.output = [{ type: 'text', text: 'synthetic' }]; },
    ]) {
      const changed = structuredClone(rows); mutate(changed);
      const measured = analyzeTask(input('', { sources: [{ format: 'codex', text: jsonl(...changed) }] }));
      assert.ok(measured.coverage.gaps.includes('incomplete-tools'));
      assert.ok(measured.tools.unsupported > 0);
    }
  });

  it('never exposes unknown tool names or model identifiers', () => {
    const unknown = transcript().replaceAll('Read', 'SYNTHETIC_TOOL_SECRET').replaceAll('claude-sonnet-4-6', 'SYNTHETIC_MODEL_SECRET');
    const measured = analyzeTask(input(unknown));
    assert.equal(measured.tools.findings.length, 0);
    assert.equal(measured.usage.totalTokens, 320);
    assert.equal(measured.usage.unpricedRecords, 2);
    assert.equal(measured.usage.apiEquivalentUsd, null);
    assert.deepEqual(measured.coverage.models, []);
    assert.ok(!JSON.stringify(measured).includes('SYNTHETIC_'));
  });

  it('reports missing session attribution and refuses potentially overlapping sources', () => {
    const noSession = transcript().replaceAll('"sessionId":"synthetic-before",', '');
    const measured = analyzeTask(input(noSession));
    assert.ok(measured.coverage.gaps.includes('missing-session'));
    assert.equal(measured.tools.findings.length, 0);
    for (const sources of [
      [{ format: 'claude-code', text: transcript() }, { format: 'claude-code', text: transcript() }],
      [{ format: 'claude-code', text: transcript() }, { format: 'claude-code', text: `${transcript()}\n` }],
      [{ format: 'claude-code', text: noSession }, { format: 'claude-code', text: transcript('other') }],
      [{ format: 'claude-code', text: transcript() }, { format: 'claude-code', text: noSession }],
    ]) assert.throws(() => analyzeTask(input('', { sources })), /Duplicate|Overlapping|explicit, disjoint/);
  });

  it('refuses request IDs reused across Claude sessions before native dedup can undercount', () => {
    assert.throws(() => analyzeTask(input(jsonl(assistant('a'), result('a'), assistant('b'), result('b')))), /Ambiguous Claude/);
  });

  it('retains malformed, incomplete and zero-record evidence without pricing it as free', () => {
    const malformed = analyzeTask(input(`${transcript()}\nnot-json`));
    assert.equal(malformed.sources[0].diagnostics.unparseable, 1);
    assert.ok(malformed.coverage.gaps.includes('malformed-lines'));
    const empty = analyzeTask(input('{}'));
    assert.equal(empty.usage.records, 0);
    assert.equal(empty.usage.apiEquivalentUsd, null);
    assert.ok(empty.coverage.gaps.includes('missing-usage'));
    assert.throws(() => taskPolicy(empty), /No actionable/);
    const fractional = analyzeTask(input(jsonl(assistant('s', 'a', {}, 1.5), result('s', 'a'))));
    assert.equal(fractional.usage.records, 0);
    assert.ok(fractional.coverage.gaps.includes('incomplete-usage'));
    assert.deepEqual(parseTaskReport(JSON.stringify(fractional)), fractional);
  });

  it('bounds findings and preserves truncation evidence', () => {
    const text = jsonl(...Array.from({ length: 22 }, (_, i) => [assistant('s', `call-${i}`), result('s', `call-${i}`)]).flat());
    const measured = analyzeTask(input(text));
    assert.equal(measured.tools.findings[0].count, 22);
    assert.equal(measured.tools.findings[0].occurrences.length, 20);
    assert.ok(measured.coverage.gaps.includes('findings-truncated'));
    assert.deepEqual(parseTaskReport(JSON.stringify(measured)), measured);
  });

  it('supports distinct same-line tool blocks without treating line references as call IDs', () => {
    const a = assistant(); a.message.content.push({ ...a.message.content[0], id: 'call-2' });
    const b = result(); b.message.content.push({ ...b.message.content[0], tool_use_id: 'call-2' });
    const measured = analyzeTask(input(jsonl(a, b)));
    assert.equal(measured.tools.findings[0].count, 2);
    assert.deepEqual(parseTaskReport(JSON.stringify(measured)), measured);
  });

  it('rejects unknown properties, invalid metadata and oversized aggregate input', () => {
    const invalid = [null, [], {}, input(undefined, { extra: true }), input(undefined, { taskId: '../unsafe' }), input(undefined, { taskType: ' ' }), input(undefined, { criterion: '\n' }), input(undefined, { criterion: 'x'.repeat(501) }), input(undefined, { assessor: 'x'.repeat(101) }), input(undefined, { outcome: 'accepted' }), input(undefined, { outcome: 'rejected', assessor: ' ' }), input(undefined, { policyId: 'execute-arbitrary' }), input(undefined, { sources: [] }), input(undefined, { sources: Array(17).fill({ format: 'codex', text: '{}' }) }), input(undefined, { sources: [{ format: 'other', text: '{}' }] }), input(undefined, { sources: [{ format: 'codex', text: ' ', extra: true }] }), input(undefined, { sources: [{ format: 'codex', text: 'x'.repeat(MAX_INPUT_CHARS) }, { format: 'claude-code', text: '{}' }] })];
    for (const value of invalid) assert.throws(() => analyzeTask(value), /Invalid task data/);
    for (const value of [['accepted'], [['accepted']], { toString: () => 'accepted' }]) assert.throws(() => analyzeTask(input(undefined, { outcome: value, assessor: 'synthetic' })), /Invalid task data/);
  });
});

describe('task policy and paired observation', () => {
  it('preserves older pricing provenance without using it to infer monetary savings', () => {
    const before = report();
    before.usage.pricing.lastReviewed = '2025-01-31';
    assert.deepEqual(parseTaskReport(JSON.stringify(before)).usage.pricing, before.usage.pricing);
    const after = report('synthetic-after', 50, { policyId: 'repeat-review-v1' });
    assert.equal(compareTasks(before, after).verdict, 'lower-usage');
    for (const pricing of [
      { source: 'live', lastReviewed: '2025-01-31', basis: 'api-equivalent' },
      { source: 'bundled', lastReviewed: '2025-01-31', basis: 'invoice' },
      { source: 'bundled', lastReviewed: '2025-02-30', basis: 'api-equivalent' },
      { source: 'bundled', lastReviewed: '2025-01-31T00:00:00Z', basis: 'api-equivalent' },
      { source: 'bundled', lastReviewed: ['2025-01-31'], basis: 'api-equivalent' },
      { source: 'bundled', lastReviewed: '2025-01-31', basis: 'api-equivalent', extra: true },
      { source: 'bundled', basis: 'api-equivalent' },
    ]) {
      const altered = structuredClone(before); altered.usage.pricing = pricing;
      assert.throws(() => parseTaskReport(JSON.stringify(altered)), /Invalid task data/);
    }
  });
  it('returns fixed instructions without interpolating any caller text', () => {
    const measured = report('synthetic-before', 100, { criterion: 'SYNTHETIC_IGNORE_POLICY' });
    assert.deepEqual(taskPolicy(measured), { id: 'repeat-review-v1', instructions: TASK_POLICY_INSTRUCTIONS });
    assert.ok(!taskPolicy(measured).instructions.includes('SYNTHETIC_IGNORE_POLICY'));
    assert.match(TASK_POLICY_INSTRUCTIONS, /underlying state has not changed/);
  });

  it('reports lower, higher and equal recorded usage only for accepted matched tasks', () => {
    const before = report();
    for (const [amount, verdict] of [[60, 'lower-usage'], [120, 'higher-usage'], [100, 'similar-usage']]) {
      const after = report('synthetic-after', amount, { taskId: 'another-task', policyId: 'repeat-review-v1' });
      const comparison = compareTasks(before, after);
      assert.equal(comparison.verdict, verdict);
      assert.equal(comparison.tokenChange.delta, (amount - 100) * 2);
      assert.deepEqual(comparison.reasons, ['paired-observation-not-causal']);
      assert.ok(!('savingsUsd' in comparison));
    }
  });

  it('prioritizes a declared rejected outcome over lower usage', () => {
    const comparison = compareTasks(report(), report('synthetic-after', 50, { policyId: 'repeat-review-v1', outcome: 'rejected' }));
    assert.equal(comparison.verdict, 'quality-regressed');
    assert.equal(comparison.tokenChange, null);
  });

  it('withholds verdicts for reused sessions, absent acceptance and mismatched experiments', () => {
    const before = report();
    const cases = [
      [report('synthetic-before', 50, { policyId: 'repeat-review-v1' }), 'source-reuse'],
      [report('synthetic-after', 50), 'policy-pair-mismatch'],
      [report('synthetic-after', 50, { policyId: 'repeat-review-v1', outcome: 'unknown' }), 'accepted-outcomes-required'],
      [report('synthetic-after', 50, { policyId: 'repeat-review-v1', criterion: 'A different criterion.' }), 'criterion-mismatch'],
      [report('synthetic-after', 50, { policyId: 'repeat-review-v1', taskType: 'different-type' }), 'task-type-mismatch'],
      [analyzeTask(input(`${transcript('synthetic-after', 50)}\nmalformed`, { policyId: 'repeat-review-v1', outcome: 'accepted', assessor: 'synthetic-reviewer' })), 'incomplete-evidence'],
      [analyzeTask(input('', { sources: [{ format: 'codex', text: codexTranscript() }], policyId: 'repeat-review-v1', outcome: 'accepted', assessor: 'synthetic-reviewer' })), 'harness-coverage-mismatch'],
    ];
    for (const [after, reason] of cases) {
      const comparison = compareTasks(before, after);
      assert.equal(comparison.verdict, 'inconclusive');
      assert.ok(comparison.reasons.includes(reason));
      assert.equal(comparison.tokenChange, null);
    }
  });

  it('defensively rejects altered saved reports, unknown data and impossible totals', () => {
    const pristine = report();
    const mutations = [
      (r) => { r.version = 2; }, (r) => { r.secret = 'synthetic'; }, (r) => { delete r.limitations; },
      (r) => { r.usage.totalTokens++; }, (r) => { r.usage.records = -1; }, (r) => { r.usage.apiEquivalentUsd = '0'; },
      (r) => { r.usage.unpricedRecords = 999; }, (r) => { r.task.assessor = null; },
      (r) => { r.coverage.models = ['SYNTHETIC_UNTRUSTED_MODEL']; }, (r) => { r.coverage.harnesses = ['codex']; },
      (r) => { r.coverage.gaps = ['made-up']; }, (r) => { r.sources[0].diagnostics.secret = 1; },
      (r) => { r.sources[0].diagnostics.unparseable = 1; }, (r) => { r.sources[0].index = 0; },
      (r) => { r.sources[0].sessionKeys = []; }, (r) => { r.sources[0].fingerprint = 'raw-path'; },
      (r) => { r.tools.findings[0].count = 1; }, (r) => { r.tools.findings[0].category = 'arbitrary-tool'; },
      (r) => { r.tools.findings[0].occurrences[0].source = 999; },
      (r) => { r.tools.findings[0].occurrences[0].resultLine = 0; },
      (r) => { r.tools.findings[0].occurrences[0].raw = 'private'; },
      (r) => { r.tools.findings[0].count = 500; }, (r) => { r.limitations = []; },
      (r) => { r.task.outcome = ['accepted']; }, (r) => { r.task.policyId = ['baseline']; },
      (r) => { r.sources[0].format = ['claude-code']; }, (r) => { r.tools.findings[0].kind = ['repeated-result']; },
      (r) => { r.tools.findings[0].category = ['read']; },
    ];
    for (const mutate of mutations) {
      const altered = structuredClone(pristine); mutate(altered);
      assert.throws(() => parseTaskReport(JSON.stringify(altered)), /Invalid task data/);
      assert.throws(() => compareTasks(pristine, altered), /Invalid task data/);
      assert.throws(() => taskPolicy(altered), /Invalid task data/);
    }
    assert.throws(() => parseTaskReport('not-json'), /Invalid task data/);
    assert.throws(() => parseTaskReport(' '.repeat(MAX_INPUT_CHARS + 1)), /Invalid task data/);
  });
});
