import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, looksLikeOtel, otelRecords, parseUsageLine, profileUsage } from '../dist/index.js';

/**
 * The OTLP GenAI converter, held to the pattern `from-claude-code` set: the
 * numbers survive as usage-log records the profiler prices, and nothing else
 * survives at all. Proven by inspecting the output, not by trusting the code.
 */

const SECRET_PROMPT = 'the-user-prompt-do-not-leak-7b2e';
const SECRET_TRACE = 'trace-id-9f13ab';

const span = (over = {}) => ({
  name: 'chat',
  startTimeUnixNano: '1787600000000000000',
  attributes: [
    { key: 'gen_ai.system', value: { stringValue: 'anthropic' } },
    { key: 'gen_ai.request.model', value: { stringValue: 'claude-sonnet-5' } },
    { key: 'gen_ai.operation.name', value: { stringValue: 'chat' } },
    { key: 'gen_ai.prompt', value: { stringValue: SECRET_PROMPT } },
    { key: 'trace_id', value: { stringValue: SECRET_TRACE } },
    { key: 'gen_ai.usage.input_tokens', value: { intValue: '1200' } },
    { key: 'gen_ai.usage.output_tokens', value: { intValue: '300' } },
  ],
  ...over,
});

const otlp = (...spans) =>
  JSON.stringify({
    resourceSpans: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'support-bot' } }] },
        scopeSpans: [{ spans }],
      },
    ],
  });

describe('the OTLP converter prices GenAI spans', () => {
  it('recognises an OTLP export', () => {
    assert.equal(looksLikeOtel(otlp(span())), true);
    // A usage log is not OTLP.
    assert.equal(looksLikeOtel(JSON.stringify({ model: 'claude-sonnet-5', usage: {} })), false);
  });

  it('converts an LLM span into a usage-log record the profiler prices', () => {
    const out = otelRecords(otlp(span()));
    assert.equal(out.llmSpans, 1);
    assert.equal(out.records.length, 1);
    const parsed = parseUsageLine(JSON.stringify(out.records[0]));
    assert.ok(parsed !== null, 'parseUsageLine rejected a converted record');
    assert.equal(parsed.model, 'claude-sonnet-5');
    assert.equal(parsed.label, 'chat');
    assert.ok(parsed.ts !== null, 'the timestamp did not survive');
    const report = profileUsage(JSON.stringify(out.records[0]), { catalogue: BUNDLED_CATALOGUE });
    assert.equal(report.total.calls, 1);
    assert.ok(report.total.totalUsd > 0);
  });

  it('counts a non-LLM span, never converts it', () => {
    const dbSpan = { name: 'db.query', startTimeUnixNano: '1', attributes: [{ key: 'db.system', value: { stringValue: 'postgres' } }] };
    const out = otelRecords(otlp(span(), dbSpan));
    assert.equal(out.llmSpans, 1);
    assert.equal(out.otherSpans, 1);
    assert.equal(out.records.length, 1);
  });

  it('reads cache reads where present, and says so where absent', () => {
    const withCache = span({
      attributes: [
        { key: 'gen_ai.request.model', value: { stringValue: 'claude-opus-5' } },
        { key: 'gen_ai.usage.input_tokens', value: { intValue: '5000' } },
        { key: 'gen_ai.usage.output_tokens', value: { intValue: '800' } },
        { key: 'gen_ai.usage.cache_read_input_tokens', value: { intValue: '4000' } },
      ],
    });
    const out = otelRecords(otlp(span(), withCache));
    assert.equal(out.records[1].usage.cache_read_input_tokens, 4000);
    // The first span carried no cache data — counted, and left absent, never
    // fabricated. OTel has no TTL split, so no cache_creation is invented.
    assert.equal(out.noCacheData, 1);
    assert.equal('cache_creation' in out.records[0].usage, false);
  });

  it('falls back to the service name for a label when the span has no operation', () => {
    const bare = span({
      attributes: [
        { key: 'gen_ai.request.model', value: { stringValue: 'claude-sonnet-5' } },
        { key: 'gen_ai.usage.input_tokens', value: { intValue: '10' } },
        { key: 'gen_ai.usage.output_tokens', value: { intValue: '2' } },
      ],
    });
    const out = otelRecords(otlp(bare));
    assert.equal(out.records[0].label, 'support-bot');
  });

  it('accepts newline-delimited OTLP documents too', () => {
    const ndjson = `${otlp(span())}\n${otlp(span())}`;
    const out = otelRecords(ndjson);
    assert.equal(out.records.length, 2);
  });
});

describe('nothing but the numbers crosses the OTLP conversion', () => {
  it('no prompt, no trace id, no attribute value beyond the counts', () => {
    const out = otelRecords(otlp(span()));
    const serialised = JSON.stringify(out);
    for (const planted of [SECRET_PROMPT, SECRET_TRACE, 'anthropic', 'gen_ai.prompt']) {
      assert.ok(!serialised.includes(planted), `${planted} crossed the conversion`);
    }
  });
});
