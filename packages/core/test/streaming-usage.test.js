import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { streamingUsageReader } from '../dist/index.js';

/**
 * Reading a streamed answer's usage without keeping the answer.
 *
 * A streamed response carries its token counts in events rather than in a JSON
 * body, so the buffering reader cannot see them. Before 1.52 the gateway
 * buffered every response to read them, which cost the caller their time to
 * first token — the number people actually feel.
 */

const feed = (reader, text, size = 7) => {
  // Deliberately split mid-line and mid-event: a chunk boundary is wherever
  // the network put it, and a reader that only works on whole lines works
  // only in tests.
  for (let at = 0; at < text.length; at += size) reader.push(text.slice(at, at + size));
};

const ANTHROPIC = [
  'event: message_start',
  'data: {"type":"message_start","message":{"usage":{"input_tokens":1200,"output_tokens":1,"cache_read_input_tokens":800,"cache_creation_input_tokens":40}}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","delta":{"text":"hello"}}',
  '',
  'event: message_delta',
  'data: {"type":"message_delta","usage":{"output_tokens":37}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
].join('\n');

describe('the streaming usage reader', () => {
  it('reads Anthropic counts from the start event and the last delta', () => {
    const reader = streamingUsageReader('anthropic');
    feed(reader, ANTHROPIC);
    assert.deepEqual(reader.done(), {
      inputTokens: 1200,
      outputTokens: 37,
      cacheReadTokens: 800,
      cacheWriteTokens: 40,
    });
  });

  it('takes the last output count rather than adding them up', () => {
    // `message_delta` carries the running total, not an increment. Summing
    // would report a bill several times the real one, in the direction that
    // makes the tool look like it found more money than it did.
    const reader = streamingUsageReader('anthropic');
    feed(
      reader,
      [
        'data: {"message":{"usage":{"input_tokens":10,"output_tokens":0}}}',
        'data: {"usage":{"output_tokens":5}}',
        'data: {"usage":{"output_tokens":11}}',
        'data: {"usage":{"output_tokens":18}}',
        '',
      ].join('\n'),
    );
    assert.equal(reader.done().outputTokens, 18);
  });

  it('reads OpenAI counts from the final chunk, cached tokens subtracted', () => {
    const reader = streamingUsageReader('openai');
    feed(
      reader,
      [
        'data: {"choices":[{"delta":{"content":"hi"}}]}',
        'data: {"choices":[],"usage":{"prompt_tokens":900,"completion_tokens":40,"prompt_tokens_details":{"cached_tokens":300}}}',
        'data: [DONE]',
        '',
      ].join('\n'),
    );
    // 900 includes the 300 cached, and pricing them twice would report a bill
    // above the invoice — the same subtraction the log reader makes.
    assert.deepEqual(reader.done(), {
      inputTokens: 600,
      outputTokens: 40,
      cacheReadTokens: 300,
      cacheWriteTokens: 0,
    });
  });

  it('returns null when the stream carried no usage at all', () => {
    /**
     * OpenAI sends usage only when the caller passed
     * `stream_options: {include_usage: true}`. Without it there are no counts,
     * and null is the answer — **not zero**. A zero would make the period's
     * total quietly too low, which is the flattering direction and the one this
     * project must never round to.
     */
    const reader = streamingUsageReader('openai');
    feed(reader, ['data: {"choices":[{"delta":{"content":"hi"}}]}', 'data: [DONE]', ''].join('\n'));
    assert.equal(reader.done(), null);
  });

  it('survives a chunk boundary inside a JSON payload', () => {
    const reader = streamingUsageReader('anthropic');
    feed(reader, ANTHROPIC, 1);
    assert.equal(reader.done().inputTokens, 1200);
  });

  it('ignores an event that is not JSON rather than throwing', () => {
    const reader = streamingUsageReader('anthropic');
    feed(reader, ['data: {not json at all', 'data: {"usage":{"output_tokens":9}}', ''].join('\n'));
    assert.equal(reader.done().outputTokens, 9);
  });

  it('refuses a line that never ends rather than growing without limit', () => {
    // A proxy that promised to hold no text must not be turned into one that
    // holds a gigabyte by an upstream that never sends a newline. Losing the
    // counts on that line surfaces as "usage not recorded", which is the
    // honest failure.
    const reader = streamingUsageReader('anthropic');
    reader.push(`data: {"x":"${'a'.repeat(2 * 1024 * 1024)}`);
    assert.equal(reader.done(), null);
  });

  it('says nothing for a provider it does not know', () => {
    const reader = streamingUsageReader('mistral');
    feed(reader, ['data: {"usage":{"prompt_tokens":5}}', ''].join('\n'));
    assert.equal(reader.done(), null);
  });
});

/**
 * A provider that speaks somebody else's wire format.
 *
 * DeepSeek serves the OpenAI response shape, so reading `prompt_tokens` out of
 * it is the same code. `WIRE_SHAPES` is where that fact lives — once, so the
 * buffered reader and the streaming reader cannot fall out of step with each
 * other, which is what two parallel lists of provider names always eventually
 * do.
 */
describe('the wire shape a provider speaks', () => {
  it('reads DeepSeek as the OpenAI shape, streaming', () => {
    const reader = streamingUsageReader('deepseek');
    feed(
      reader,
      [
        'data: {"choices":[{"delta":{"content":"hola"}}]}',
        'data: {"choices":[],"usage":{"prompt_tokens":500,"completion_tokens":20}}',
        'data: [DONE]',
        '',
      ].join('\n'),
    );
    assert.deepEqual(reader.done(), {
      inputTokens: 500,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it('says nothing for a provider whose shape nobody established', () => {
    /**
     * The important half. A provider absent from `WIRE_SHAPES` gets **null**,
     * not a guess at which fields might mean tokens — and the gateway then
     * reports the call as unmeasured, which is true, rather than recording a
     * number nobody can defend.
     */
    for (const provider of ['mistral', 'xai', 'moonshot', 'google']) {
      const reader = streamingUsageReader(provider);
      feed(reader, 'data: {"usage":{"prompt_tokens":9,"completion_tokens":1}}\n\n');
      assert.equal(reader.done(), null, `${provider} was read with a shape nobody established`);
    }
  });
});
