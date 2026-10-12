import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { codexRecords, looksLikeCodexTranscript, parseUsageLine } from '../dist/index.js';

const usage = (input = 100, output = 20, cached = 40, reasoning = 5) => ({
  input_tokens: input, cached_input_tokens: cached, output_tokens: output,
  reasoning_output_tokens: reasoning, total_tokens: input + output,
});
const meta = (id = 'synthetic-session') => ({ type: 'session_meta', payload: { id, cwd: 'SYNTHETIC_PRIVATE_PATH' } });
const context = (model = 'gpt-4o') => ({ type: 'turn_context', payload: { model, developer_instructions: 'SYNTHETIC_SECRET' } });
const event = (total = usage(), last = usage()) => ({
  timestamp: '2026-10-12T10:00:00Z', type: 'event_msg',
  payload: { type: 'token_count', info: { total_token_usage: total, last_token_usage: last, model_context_window: 200000 } },
});
const text = (...rows) => rows.map((row) => typeof row === 'string' ? row : JSON.stringify(row)).join('\n');

describe('Codex rollout conversion', () => {
  it('subtracts cached input and never adds reasoning output twice', () => {
    const result = codexRecords(text(meta(), context(), event()), { label: 'synthetic-work' });
    assert.equal(result.records.length, 1);
    assert.deepEqual(result.records[0].usage, { input_tokens: 60, output_tokens: 20, cache_read_input_tokens: 40 });
    assert.equal(result.records[0].label, 'synthetic-work');
    assert.ok(parseUsageLine(JSON.stringify(result.records[0])));
    assert.ok(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_PATH'));
    assert.ok(!JSON.stringify(result).includes('SYNTHETIC_SECRET'));
  });

  it('collapses rate-limit replays and corroborates deltas across model changes', () => {
    const result = codexRecords(text(meta(), context(), event(), event(), context('synthetic-unknown-model'), event(usage(200, 40, 80, 10))));
    assert.equal(result.records.length, 2);
    assert.equal(result.duplicates, 1);
    assert.equal(result.records[1].model, 'synthetic-unknown-model');
    assert.equal(result.records[1].usage.input_tokens, 60);
  });

  it('does not infer calls or historical model attribution from restored totals', () => {
    const result = codexRecords(text(meta(), context(), event(usage(1000, 200, 400, 50)), event(usage(1100, 220, 440, 55))));
    assert.equal(result.records.length, 1);
    assert.equal(result.unsupported, 1);
    assert.equal(result.records[0].usage.output_tokens, 20);
  });

  it('excludes aggregate jumps and establishes the next baseline without double counting', () => {
    const result = codexRecords(text(meta(), context(), event(), event(usage(300, 60, 120, 15)), event(usage(400, 80, 160, 20))));
    assert.equal(result.records.length, 2);
    assert.equal(result.unsupported, 1);
  });

  it('does not price synthetic context-window counters, resets or unbounded cache writes', () => {
    const full = { ...usage(0, 0, 0, 0), total_tokens: 200000 };
    const result = codexRecords(text(meta(), context(), event(), event(full, full), event(), event(usage(200, 40, 80, 10))));
    assert.equal(result.records.length, 1);
    assert.equal(result.duplicates, 1);
    assert.equal(result.unsupported, 2);
    const cacheWrite = { ...usage(), cache_write_input_tokens: 10 };
    assert.equal(codexRecords(text(meta(), context(), event(cacheWrite, cacheWrite))).records.length, 0);
    const reset = codexRecords(text(meta(), context(), event(), event(usage(10, 2, 4, 1))));
    assert.equal(reset.records.length, 1);
    assert.equal(reset.unsupported, 1);
  });

  it('never bills replayed totals after a counter rewind, even across session switches', () => {
    const a = event();
    const b = event(usage(200, 40, 80, 10));
    const c = event(usage(300, 60, 120, 15));
    const replay = codexRecords(text(meta(), context(), a, b, a, b, c));
    assert.equal(replay.records.length, 3);
    assert.equal(replay.unsupported, 1);
    assert.equal(replay.duplicates, 1);
    const sessions = codexRecords(text(meta('a'), context(), a, meta('b'), context(), a, meta('a'), context(), a, b));
    assert.equal(sessions.records.length, 3);
    assert.equal(sessions.duplicates, 1);
    const invalidMeta = codexRecords(text(meta('a'), context(), a, meta(''), context(), a));
    assert.equal(invalidMeta.records.length, 1);
    assert.equal(invalidMeta.duplicates, 1);
  });

  it('keeps missing model evidence unknown instead of assigning the next model backwards', () => {
    const result = codexRecords(text(meta(), event(), context(), event(usage(200, 40, 80, 10))));
    assert.equal(result.missingModel, 1);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].usage.input_tokens, 60);
  });

  it('starts independent counters for a new explicit session and clears old model context', () => {
    const result = codexRecords(text(meta(), context(), event(), meta('another-synthetic-session'), event(), context(), event(usage(200, 40, 80, 10))));
    assert.equal(result.records.length, 2);
    assert.equal(result.missingModel, 1);
    assert.equal(result.records[1].session, 'another-synthetic-session');
  });

  it('names malformed usage without inventing missing counters or a timestamp', () => {
    for (const bad of [undefined, {}, { ...usage(), cached_input_tokens: 101 }, { ...usage(), input_tokens: -1 }, { ...usage(), output_tokens: 0.5 }]) {
      assert.equal(codexRecords(text(meta(), context(), event(bad ?? {}, usage()))).records.length, 0);
    }
    const row = event(); delete row.timestamp;
    const result = codexRecords(text('not-json', meta(), context(), row));
    assert.equal(result.unparseable, 1);
    assert.ok(!('ts' in result.records[0]));
    assert.equal(codexRecords(text(null, [], 1, { type: 'event_msg', payload: { type: 'token_count', info: null } })).records.length, 0);
  });

  it('detects protocol envelopes, never a prose mention of Codex', () => {
    assert.equal(looksLikeCodexTranscript(text(meta(), context(), event())), true);
    assert.equal(looksLikeCodexTranscript('Codex says token_count'), false);
    assert.equal(looksLikeCodexTranscript(text({ model: 'gpt-4o', usage: { input_tokens: 1 } })), false);
  });
});
