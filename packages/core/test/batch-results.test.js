import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  batchResultRecords,
  looksLikeAnthropicUsage,
  looksLikeBatchResults,
  looksLikeClaudeCodeTranscript,
  looksLikeOpenaiUsage,
  parseUsageLine,
  profileUsage,
} from '../dist/index.js';

/**
 * A Batch API results file, read as a usage log.
 *
 * The lines are each provider's documented shape: Anthropic's from
 * platform.claude.com/docs/en/build-with-claude/batch-processing, OpenAI's from
 * developers.openai.com/api/docs/guides/batch, read 2026-11-05. Markers sit in
 * every field that carries text a person wrote or a model generated, and the
 * output is searched for them: a results file is full of both, and none of it
 * may cross.
 */

const MARK = 'SYNTHETIC_PRIVATE_TEXT';
const bill = (text) => profileUsage(text, { catalogue: BUNDLED_CATALOGUE }).total.totalUsd;
const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

const anthropicLine = (type, over = {}) => JSON.stringify({
  custom_id: `${MARK}-${type}`,
  result: type === 'succeeded'
    ? {
        type,
        message: {
          id: 'msg_014VwiXbi91y3JMjcpyGBHX5', type: 'message', role: 'assistant', model: 'claude-opus-5',
          content: [{ type: 'text', text: `${MARK} generated reply` }],
          stop_reason: 'end_turn', stop_sequence: null,
          usage: { input_tokens: 1_000_000, output_tokens: 1_000_000, service_tier: 'batch' },
          ...over,
        },
      }
    : { type, ...(type === 'errored' ? { error: { type: 'invalid_request_error', message: MARK } } : {}) },
});

const openAiLine = (over = {}) => JSON.stringify({
  id: 'batch_req_1',
  custom_id: `${MARK}-1`,
  response: {
    status_code: 200,
    request_id: 'req_1',
    body: {
      id: 'resp_1', object: 'response', status: 'completed', created_at: 1793491200, model: 'gpt-6-astra',
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: `${MARK} blue` }] }],
      // 100k in: under GPT-6 Astra's 272k line, so the short band's batch rate applies.
      usage: { input_tokens: 100_000, output_tokens: 1_000_000, input_tokens_details: { cached_tokens: 0 } },
    },
  },
  error: null,
  ...over,
});

describe('Anthropic results', () => {
  const file = ['succeeded', 'errored', 'canceled', 'expired'].map((type) => anthropicLine(type)).join('\n');

  it('keeps the succeeded result and counts the three the page says are not billed', () => {
    const c = batchResultRecords(file);
    assert.equal(c.provider, 'anthropic');
    assert.equal(c.lines, 4);
    assert.equal(c.records.length, 1);
    assert.equal(c.notBilled, 3);
    assert.equal(c.unparseable, 0);
    const [record] = c.records;
    assert.equal(record.model, 'claude-opus-5');
    assert.equal(record.batch, true);
    assert.equal(record.stop_reason, 'end_turn');
    assert.equal(record.ts, undefined, 'an Anthropic result carries no time, and none was invented');
  });

  it('prices the result at the batch rate, half of Opus 5’s $5/$25', () => {
    const { records } = batchResultRecords(file);
    assert.equal(parseUsageLine(JSON.stringify(records[0])).batch, true);
    close(bill(records.map((record) => JSON.stringify(record)).join('\n')), 2.5 + 12.5, 'one batch call');
  });

  it('carries no text, generated or written, and no request id', () => {
    const out = JSON.stringify(batchResultRecords(file).records);
    assert.ok(!out.includes(MARK), 'text or a custom_id crossed into the records');
    assert.ok(!out.includes('msg_014Vwi'), 'a message id crossed');
  });

  it('names a succeeded result with nothing to price it by as unpriceable', () => {
    const c = batchResultRecords(anthropicLine('succeeded', { usage: undefined }));
    assert.equal(c.records.length, 0);
    assert.equal(c.unpriceable, 1);
  });
});

describe('OpenAI results', () => {
  const expired = JSON.stringify({
    id: 'batch_req_3', custom_id: 'request-3', response: null,
    error: { code: 'batch_expired', message: 'This request could not be executed before the completion window expired.' },
  });
  const failed = openAiLine({ response: { status_code: 400, request_id: 'req_4', body: { error: { message: MARK } } } });
  const file = [openAiLine(), expired, failed].join('\n');

  it('keeps a 200 with a body, and counts the expired and the failed as not billed', () => {
    const c = batchResultRecords(file);
    assert.equal(c.provider, 'openai');
    assert.equal(c.records.length, 1);
    assert.equal(c.notBilled, 2);
    const [record] = c.records;
    assert.equal(record.model, 'gpt-6-astra');
    assert.equal(record.batch, true);
    assert.equal(record.ts, '2026-11-01T00:00:00.000Z', 'created_at is Unix seconds');
  });

  it('prices the result at the batch rate, half of GPT-6 Astra’s $10/$50', () => {
    const { records } = batchResultRecords(file);
    close(bill(records.map((record) => JSON.stringify(record)).join('\n')), 0.1 * 5 + 25, 'one batch call');
  });

  it('carries no text, generated or written', () => {
    assert.ok(!JSON.stringify(batchResultRecords(file).records).includes(MARK));
  });
});

describe('telling a results file from every other JSON', () => {
  it('recognises both providers’ results, and nothing else claims them', () => {
    for (const text of [anthropicLine('succeeded'), anthropicLine('expired'), openAiLine()]) {
      assert.equal(looksLikeBatchResults(text), true, text.slice(0, 60));
      assert.equal(looksLikeAnthropicUsage(text), false);
      assert.equal(looksLikeOpenaiUsage(text), false);
      assert.equal(looksLikeClaudeCodeTranscript(text), false);
    }
  });

  it('does not claim a usage log, a batch input file or a saved response', () => {
    const input = JSON.stringify({ custom_id: 'request-1', method: 'POST', url: '/v1/responses', body: { model: 'gpt-6-luna', input: 'hi' } });
    for (const text of [
      JSON.stringify({ model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 1 } }),
      input,
      '',
      'not json',
    ]) {
      assert.equal(looksLikeBatchResults(text), false, text.slice(0, 60));
    }
  });

  it('counts a line that is neither shape as unparseable, never as a call', () => {
    const c = batchResultRecords([anthropicLine('succeeded'), 'not json', '{"custom_id":"x"}'].join('\n'));
    assert.equal(c.records.length, 1);
    assert.equal(c.unparseable, 2);
  });
});
