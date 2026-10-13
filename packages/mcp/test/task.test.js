import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeTask, compareTasks, MAX_INPUT_CHARS, parseTaskReport, taskPolicy } from '@trazum/core';
import { handle, InvalidArguments } from '../dist/rpc.js';
import { TOOLS } from '../dist/tools.js';

const info = { name: 'synthetic-test', version: '1', instructions: '' };
const rpc = (name, args) => handle({ jsonrpc: '2.0', id: 1, method: 'tools/call',
  params: { name, arguments: args } }, TOOLS, info);
const run = (name, args) => {
  const response = rpc(name, args);
  assert.notEqual(response.result.isError, true, response.result.content[0].text);
  return JSON.parse(response.result.content[0].text);
};
const lines = (...rows) => rows.map(JSON.stringify).join('\n');
const claude = (session, repetitions = 3, tokens = 100) => lines(...Array.from({ length: repetitions }, (_, index) => [
  { type: 'assistant', requestId: `${session}-${index}`, sessionId: session,
    timestamp: `2026-10-01T00:00:0${index}Z`, cwd: '/PRIVATE-CWD',
    message: { id: `${session}-message-${index}`, model: 'claude-opus-5',
      usage: { input_tokens: tokens, output_tokens: 10 },
      content: [{ type: 'text', text: 'PRIVATE-PROMPT' },
        { type: 'tool_use', id: `call-${index}`, name: 'Read', input: { file_path: '/PRIVATE-PATH' } }] } },
  { type: 'user', sessionId: session, message: { content: [
    { type: 'tool_result', tool_use_id: `call-${index}`, content: 'PRIVATE-RESULT' },
  ] } },
]).flat());
const codex = () => lines(
  { type: 'session_meta', payload: { id: 'PRIVATE-CODEX-SESSION', cwd: '/PRIVATE-CWD' } },
  { type: 'turn_context', payload: { model: 'gpt-5.4', instructions: 'PRIVATE-PROMPT' } },
  { type: 'event_msg', timestamp: '2026-10-01T00:00:00Z', payload: { type: 'token_count', info: {
    total_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 0, total_tokens: 110 },
    last_token_usage: { input_tokens: 100, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 0, total_tokens: 110 },
  } } },
);
const input = (overrides = {}) => ({
  taskId: 'synthetic-task', taskType: 'bugfix', criterion: 'Synthetic acceptance tests pass',
  sources: [{ format: 'claude-code', text: claude('PRIVATE-SESSION') }], ...overrides,
});

describe('task analysis over MCP', () => {
  it('matches core evidence and returns a fixed policy without transcript content', () => {
    const args = input();
    const result = run('analyze_task', args);
    assert.deepEqual(result.report, analyzeTask(args));
    assert.ok(result.report.tools.findings.length > 0);
    assert.deepEqual(result.policy, taskPolicy(result.report));
    assert.equal(result.policy.id, 'repeat-review-v1');
    assert.equal(result.report.task.outcome, 'unknown');
    assert.ok(result.report.tools.findings[0].occurrences.every((entry) => Number.isInteger(entry.line)));
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
    assert.deepEqual(parseTaskReport(JSON.stringify(result.report)), result.report);
  });

  it('handles mixed harness evidence and returns null policy when no repetition exists', () => {
    const args = input({ sources: [
      { format: 'claude-code', text: claude('PRIVATE-SESSION', 1) },
      { format: 'codex', text: codex() },
    ] });
    const result = run('analyze_task', args);
    assert.deepEqual(result.report, analyzeTask(args));
    assert.deepEqual([...result.report.coverage.harnesses].sort(), ['claude-code', 'codex']);
    assert.equal(result.report.usage.records, 2);
    assert.equal(result.policy, null);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
  });

  it('withholds policy for successful shell repetitions while returning their evidence', () => {
    const text = claude('PRIVATE-SESSION').replaceAll('"name":"Read"', '"name":"Bash"')
      .replaceAll('"file_path":"/PRIVATE-PATH"', '"command":"printf PRIVATE-COMMAND"');
    const result = run('analyze_task', input({ sources: [{ format: 'claude-code', text }] }));
    assert.ok(result.report.tools.findings.length > 0);
    assert.equal(result.policy, null);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
  });

  it('retains unreadable-source gaps and never claims an accepted outcome', () => {
    const result = run('analyze_task', input({ sources: [{ format: 'codex', text: 'PRIVATE-MALFORMED' }] }));
    assert.equal(result.report.usage.records, 0);
    assert.equal(result.report.task.outcome, 'unknown');
    assert.ok(result.report.coverage.gaps.length > 0);
    assert.equal(result.policy, null);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
  });

  it('rejects malformed, unknown, unbounded and non-assessed arguments', () => {
    const invalid = [
      {}, input({ taskId: '../PRIVATE-PATH' }), input({ taskId: 'x'.repeat(81) }),
      input({ taskType: '' }), input({ criterion: ' ' }), input({ criterion: 'x'.repeat(501) }),
      input({ policyId: 'invented' }), input({ outcome: 'accepted' }), input({ outcome: 'rejected', assessor: '' }),
      input({ assessor: 'x'.repeat(101) }), input({ path: 'synthetic.jsonl' }),
      input({ sources: [] }), input({ sources: null }), input({ sources: [null] }),
      input({ sources: [{ format: 'other', text: '{}' }] }),
      input({ sources: [{ format: 'codex', text: 2 }] }),
      input({ sources: [{ format: 'codex', text: ' ' }] }),
      input({ sources: [{ format: 'codex', text: '{}', path: '/PRIVATE-PATH' }] }),
      input({ sources: [{ format: 'codex', text: 'x'.repeat(MAX_INPUT_CHARS + 1) }] }),
      input({ sources: Array.from({ length: 17 }, () => ({ format: 'codex', text: '{}' })) }),
      input({ sources: [{ format: 'codex', text: 'x'.repeat(MAX_INPUT_CHARS / 2) },
        { format: 'codex', text: 'x'.repeat(MAX_INPUT_CHARS / 2 + 1) }] }),
    ];
    for (const args of invalid) {
      const response = rpc('analyze_task', args);
      assert.equal(response.result.isError, true);
      assert.doesNotMatch(response.result.content[0].text, /PRIVATE-/);
    }
  });

  it('accepts the aggregate text ceiling and refuses one character more', () => {
    const text = '{}'.padEnd(MAX_INPUT_CHARS, ' ');
    assert.equal(run('analyze_task', input({ sources: [{ format: 'codex', text }] })).report.usage.records, 0);
    assert.equal(rpc('analyze_task', input({ sources: [{ format: 'codex', text: text + ' ' }] })).result.isError, true);
  });
});

describe('task comparisons over MCP', () => {
  it('matches core comparison while retaining explicit outcome and policy evidence', () => {
    const before = run('analyze_task', input({ outcome: 'accepted', assessor: 'synthetic-check' })).report;
    const after = run('analyze_task', input({ taskId: 'synthetic-task-after', policyId: 'repeat-review-v1',
      outcome: 'accepted', assessor: 'synthetic-check',
      sources: [{ format: 'claude-code', text: claude('PRIVATE-AFTER-SESSION', 1, 40) }],
    })).report;
    const result = run('compare_tasks', { before: JSON.stringify(before), after: JSON.stringify(after) });
    assert.deepEqual(result, compareTasks(before, after));
    assert.ok(result.limitations.length > 0);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
  });

  it('does not turn replay of the same saved report into improvement', () => {
    const { report } = run('analyze_task', input());
    const text = JSON.stringify(report);
    assert.equal(run('compare_tasks', { before: text, after: text }).verdict, 'inconclusive');
  });

  it('refuses envelopes, forged reports and unbounded comparisons without echoing content', () => {
    const result = run('analyze_task', input());
    const report = JSON.stringify(result.report);
    for (const before of ['', 'PRIVATE-MALFORMED', '{}', JSON.stringify(result),
      JSON.stringify({ ...result.report, unknown: 'PRIVATE-EXTRA' }),
      JSON.stringify({ ...result.report, usage: { ...result.report.usage, totalTokens: -1 } }),
      'x'.repeat(MAX_INPUT_CHARS + 1), report.padEnd(MAX_INPUT_CHARS, ' ')]) {
      const response = rpc('compare_tasks', { before, after: report });
      assert.equal(response.result.isError, true);
      assert.doesNotMatch(response.result.content[0].text, /PRIVATE-/);
    }
    assert.equal(rpc('compare_tasks', { before: report, after: report, path: 'synthetic.json' }).result.isError, true);
    const tool = TOOLS.find((entry) => entry.name === 'compare_tasks');
    assert.throws(() => tool.run({ before: '{}', after: '{}' }), InvalidArguments);
  });
});

describe('task tool discovery', () => {
  it('exposes strict schemas and read-only, closed-world annotations over tools/list', () => {
    const response = handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, TOOLS, info);
    for (const name of ['analyze_task', 'compare_tasks']) {
      const tool = response.result.tools.find((entry) => entry.name === name);
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.deepEqual(tool.annotations, {
        readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
      });
    }
    const schema = response.result.tools.find((entry) => entry.name === 'analyze_task').inputSchema;
    assert.equal(schema.properties.sources.items.additionalProperties, false);
    assert.deepEqual(schema.required, ['taskId', 'taskType', 'criterion', 'sources']);
  });
});
