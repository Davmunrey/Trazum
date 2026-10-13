import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { describe, it } from 'node:test';
import { analyzeTask, compareTasks, parseTaskReport, MAX_INPUT_CHARS } from '@trazum/core';

register('./helpers/loader.mjs', import.meta.url);
const { appendTaskFiles, readTaskText, readTaskReport, taskDocumentJson, createTaskReadGate, MAX_TASK_FILE_BYTES } = await import('../lib/task-workflow.ts');
const { taskEn } = await import('../lib/i18n/tasks-en.ts');
const { taskEs } = await import('../lib/i18n/tasks-es.ts');
const file = (text, name = 'synthetic.jsonl') => new File([text], name);
const rejectsWith = (promise, code) => assert.rejects(promise, (error) => error.code === code);
const report = (session = 'synthetic-before', amount = 100, policyId = 'baseline', outcome = 'accepted') => analyzeTask({
  taskId: 'synthetic-run', taskType: 'synthetic-test', criterion: 'Synthetic checks pass.',
  policyId, outcome, ...(outcome === 'unknown' ? {} : { assessor: 'synthetic-reviewer' }),
  sources: [{ format: 'claude-code', text: JSON.stringify({
    type: 'assistant', sessionId: session, requestId: 'synthetic-request', timestamp: '2026-10-13T09:00:00Z',
    message: { model: 'claude-sonnet-4-6', usage: { input_tokens: amount, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, content: [] },
  }) }],
});

describe('bounded local task files', () => {
  it('rejects oversized files before allocating or reading', async () => {
    let called = false;
    await rejectsWith(readTaskText({ size: MAX_TASK_FILE_BYTES + 1, arrayBuffer: () => { called = true; } }), 'file-size');
    assert.equal(called, false);
  });
  it('also checks the actual byte buffer and decoded character count', async () => {
    await rejectsWith(readTaskText({ size: 1, arrayBuffer: async () => new ArrayBuffer(MAX_TASK_FILE_BYTES + 1) }), 'file-size');
    await rejectsWith(readTaskText(file('a'.repeat(MAX_INPUT_CHARS + 1))), 'file-size');
    assert.equal((await readTaskText(file('é'.repeat(MAX_INPUT_CHARS)))).length, MAX_INPUT_CHARS);
  });
  it('rejects malformed UTF-8, NUL, empty text and read failures without leaking content', async () => {
    for (const bytes of [new Uint8Array([0xc3, 0x28]), new Uint8Array([0x61, 0])]) await rejectsWith(readTaskText(file(bytes)), 'encoding');
    await rejectsWith(readTaskText(file(' \n\t')), 'empty-file');
    await rejectsWith(readTaskText({ size: 1, arrayBuffer: async () => { throw new Error('SYNTHETIC_PRIVATE_PATH'); } }), 'read-file');
  });
  it('enforces aggregate size and rejects a batch atomically', async () => {
    const existing = [{ name: 'synthetic-old.jsonl', format: 'codex', text: 'a'.repeat(MAX_INPUT_CHARS - 1) }];
    await rejectsWith(appendTaskFiles(existing, [file('x'), file('y')], 'claude-code'), 'file-size');
    assert.equal(existing.length, 1);
    assert.equal((await appendTaskFiles(existing, [file('x')], 'claude-code')).length, 2);
  });
  it('enforces file count before reading and preserves per-file harnesses', async () => {
    await rejectsWith(appendTaskFiles([], [], 'codex'), 'file-count');
    await rejectsWith(appendTaskFiles([], Array.from({ length: 17 }, () => file('x')), 'codex'), 'file-count');
    const first = await appendTaskFiles([], [file('x')], 'claude-code');
    const second = await appendTaskFiles(first, [file('y', 'synthetic-codex.jsonl')], 'codex');
    assert.deepEqual(second.map((entry) => entry.format), ['claude-code', 'codex']);
    assert.equal(first.length, 1);
  });
  it('prevents an old file read from restoring cleared or replaced state', () => {
    const gate = createTaskReadGate();
    const oldRead = gate.begin();
    gate.cancel();
    assert.equal(gate.current(oldRead), false);
    const read = gate.begin();
    assert.equal(gate.current(read), true);
    const newerRead = gate.begin();
    assert.equal(gate.current(read), false);
    assert.equal(gate.current(newerRead), true);
  });
  it('keeps an explicitly chosen run when an older report import finishes later', async () => {
    const gate = createTaskReadGate();
    const ticket = gate.begin();
    let selected = null;
    let release;
    const bytes = new TextEncoder().encode(taskDocumentJson(report('synthetic-import')));
    const pending = readTaskReport({ size: bytes.byteLength, arrayBuffer: () => new Promise((resolve) => { release = resolve; }) })
      .then((imported) => { if (gate.current(ticket)) selected = imported; });
    const carried = report('synthetic-chosen');
    gate.cancel();
    selected = carried;
    release(bytes.buffer);
    await pending;
    assert.equal(selected, carried);
  });
});

describe('browser task reports share the core protocol', () => {
  it('round-trips a CLI/MCP-compatible report and refuses altered counters', async () => {
    const original = report();
    const serialized = taskDocumentJson(original);
    assert.deepEqual(await readTaskReport(file(serialized)), original);
    assert.deepEqual(parseTaskReport(serialized), original);
    const altered = structuredClone(original);
    altered.usage.totalTokens++;
    await rejectsWith(readTaskReport(file(JSON.stringify(altered))), 'invalid-report');
    await rejectsWith(readTaskReport(file('{}')), 'invalid-report');
    await rejectsWith(readTaskReport(file('not-json')), 'invalid-report');
  });
  it('compares independent accepted reports after re-import without changing semantics', async () => {
    const before = await readTaskReport(file(taskDocumentJson(report())));
    const after = await readTaskReport(file(taskDocumentJson(report('synthetic-after', 50, 'repeat-review-v1'))));
    const compared = compareTasks(before, after);
    assert.equal(compared.verdict, 'lower-usage');
    assert.equal(compared.tokenChange.delta, -50);
    assert.deepEqual(JSON.parse(taskDocumentJson(compared)), compared);
  });
  it('does not expose a token verdict for unknown acceptance, reused sources or mismatched criteria', () => {
    const before = report();
    const unknown = report('synthetic-after', 50, 'repeat-review-v1', 'unknown');
    const reused = { ...before, task: { ...before.task, policyId: 'repeat-review-v1' } };
    const mismatch = report('synthetic-after', 50, 'repeat-review-v1');
    mismatch.task.criterion = 'A different synthetic criterion.';
    for (const after of [unknown, reused, mismatch]) {
      const compared = compareTasks(before, after);
      assert.equal(compared.verdict, 'inconclusive');
      assert.equal(compared.tokenChange, null);
    }
  });
  it('reports declared acceptance regression without inventing savings', () => {
    const compared = compareTasks(report(), report('synthetic-after', 50, 'repeat-review-v1', 'rejected'));
    assert.equal(compared.verdict, 'quality-regressed');
    assert.equal(compared.tokenChange, null);
  });
  it('bounds serialized exports including the newline', () => {
    assert.throws(() => taskDocumentJson({ kind: 'trazum-task', value: 'a'.repeat(MAX_INPUT_CHARS) }), (error) => error.code === 'export-size');
    assert.ok(taskDocumentJson(report()).endsWith('\n'));
  });
  it('keeps both languages complete for protocol codes', () => {
    for (const key of ['errors', 'outcomes', 'categories', 'verdicts', 'gaps', 'reasons']) {
      assert.deepEqual(Object.keys(taskEs[key]).sort(), Object.keys(taskEn[key]).sort());
      for (const value of Object.values(taskEs[key])) assert.ok(value.trim());
    }
  });
});

describe('task content stays local', () => {
  it('does not add network, persistence, analytics or HTML injection to the task workflow', () => {
    for (const path of ['../components/Tasks.tsx', '../components/TaskRunReport.tsx', '../components/TaskExportDialog.tsx', '../lib/task-workflow.ts', '../lib/task-export.ts']) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|\btrack\s*\(|dangerouslySetInnerHTML/);
    }
  });
});
