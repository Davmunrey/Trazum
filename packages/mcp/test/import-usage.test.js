import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handle } from '../dist/rpc.js';
import { TOOLS, MAX_LOG_CHARS } from '../dist/tools.js';
const rpc = (args) => handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'import_usage', arguments: args } }, TOOLS, { name: 'test', version: '1', instructions: '' });
const run = (args) => JSON.parse(rpc(args).result.content[0].text);
const lines = (...rows) => rows.map(JSON.stringify).join('\n');
const usage = (n) => ({ input_tokens: n, cached_input_tokens: 20, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: n + 10 });
const snapshot = (total, last) => ({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: total, last_token_usage: last } } });
const context = { type: 'turn_context', payload: { model: 'gpt-5.4', cwd: '/PRIVATE-CWD', instructions: 'PRIVATE-PROMPT' } };
const session = { type: 'session_meta', payload: { id: 'synthetic-session', cwd: '/PRIVATE-CWD' } };

describe('native usage import boundaries and evidence', () => {
  it('rejects malformed arguments and unknown fields through RPC', () => {
    for (const args of [ {}, { format: 'other', text: '{}' }, { format: 'codex', text: '' },
      { format: 'codex', text: '   ' }, { format: 'codex', text: 1 },
      { format: 'codex', text: 'x'.repeat(MAX_LOG_CHARS + 1) },
      ...['', ' ', 3, 'x'.repeat(201)].map(label => ({ format: 'codex', text: '{}', label })),
      { format: 'codex', text: '{}', path: '/PRIVATE-PATH' },
      { format: 'codex', text: '{}', labelByCwd: [] },
    ]) assert.equal(rpc(args).result.isError, true);
  });
  it('bounds expanded output before returning a log downstream cannot accept', () => {
    const text = Array.from({ length: 9000 }, (_, index) => JSON.stringify({
      type: 'assistant', requestId: `synthetic-${index}`,
      message: { model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 1 } },
    })).join('\n');
    assert.ok(text.length < MAX_LOG_CHARS);
    const response = rpc({ format: 'claude-code', text, label: 'x'.repeat(200) });
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /normalized log exceeds/);
  });
  it('retains Codex gaps, deduplicates replay and accounts cache/reasoning once', () => {
    const first = usage(100);
    const second = { ...usage(200), cached_input_tokens: 40, output_tokens: 20, reasoning_output_tokens: 10, total_tokens: 220 };
    const result = run({ format: 'codex', label: 'synthetic-work', text: lines(session, context,
      snapshot(first, first), snapshot(second, first), snapshot(first, first), snapshot(second, first)) + '\nmalformed' });
    assert.equal(result.records, 2);
    assert.equal(result.diagnostics.unparseable, 1);
    assert.ok(result.diagnostics.unsupported > 0);
    assert.equal(result.evidence.completeness, 'not-established');
    assert.equal(result.evidence.billingMode, 'unknown');
    const records = result.log.split('\n').map(JSON.parse);
    assert.equal(records[0].usage.input_tokens, 80);
    assert.equal(records[0].usage.cache_read_input_tokens, 20);
    assert.equal(records[0].usage.output_tokens, 10);
    assert.equal(records[0].label, 'synthetic-work');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
  });
  it('does not convert absent models, unsupported counters or non-usage into free spend', () => {
    for (const text of ['malformed', '{}', lines(session, snapshot(usage(100), usage(100))),
      lines(session, context, snapshot({ input_tokens: 100 }, {}))]) {
      const result = run({ format: 'codex', text });
      assert.equal(result.records, 0);
      assert.equal(result.log, '');
      assert.equal(result.evidence.completeness, 'not-established');
    }
  });
  it('keeps Claude converter diagnostics, explicit labels only, and no transcript content', () => {
    const row = { type: 'assistant', requestId: 'synthetic-request', sessionId: 'synthetic-session',
      timestamp: '2026-10-01T00:00:00Z', cwd: '/PRIVATE-CWD', label: 'PRIVATE-LABEL',
      message: { model: 'claude-opus-5', content: [{ text: 'PRIVATE-PROMPT' }],
        usage: { input_tokens: 100, output_tokens: 10 } } };
    const result = run({ format: 'claude-code', text: lines(row, row) + '\nbroken' });
    assert.equal(result.records, 1);
    assert.equal(result.diagnostics.collapsed, 1);
    assert.equal(result.diagnostics.unparseable, 1);
    assert.equal(JSON.parse(result.log).label, undefined);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE-/);
  });
});
