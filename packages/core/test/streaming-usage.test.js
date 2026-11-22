import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { streamingUsageReader, usageFromResponse } from '../dist/index.js';

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

  it('reads Moonshot as the OpenAI shape, streaming, from its own example', () => {
    /**
     * The final chunk is Moonshot's, copied from the streaming example in
     * platform.kimi.ai/docs/api/chat.md as read on 2026-11-22: empty `choices`,
     * the totals in the top-level `usage`. The page says cached reads, writes
     * and the uncached remainder are disjoint and sum to `prompt_tokens`, and
     * that output "includes both reasoning and answer tokens".
     *
     * 373 - 256 written = 117 fresh input. Output is 93, **not** 93 + 71: the
     * reasoning is already inside it, and adding it would bill it twice. The
     * request named no lifetime, so the 256 are Kimi's default five-minute
     * entry, in the short slot.
     */
    const reader = streamingUsageReader('moonshot', { cacheTtl: null });
    feed(
      reader,
      [
        'data: {"id":"chatcmpl-6adb0ef47c3c1358b6a07603","object":"chat.completion.chunk","created":1792741110,"model":"kimi-k3.1-pro","choices":[{"index":0,"delta":{"content":"1"},"finish_reason":null}],"system_fingerprint":"fpv0_e7278693"}',
        '',
        'data: {"id":"chatcmpl-6adb0ef47c3c1358b6a07603","object":"chat.completion.chunk","created":1792741110,"model":"kimi-k3.1-pro","choices":[],"usage":{"prompt_tokens":373,"completion_tokens":93,"total_tokens":466,"completion_tokens_details":{"reasoning_tokens":71},"prompt_tokens_details":{"cache_write_tokens":256}}}',
        '',
        'data: [DONE]',
        '',
      ].join('\n'),
    );
    assert.deepEqual(reader.done(), {
      inputTokens: 117,
      outputTokens: 93,
      cacheReadTokens: 0,
      cacheWriteTokens: 256,
      cacheWrite5mTokens: 256,
      cacheWrite1hTokens: 0,
    });
  });

  it('says nothing for a provider whose shape nobody established', () => {
    /**
     * The important half. A provider absent from `WIRE_SHAPES` gets **null**,
     * not a guess at which fields might mean tokens — and the gateway then
     * reports the call as unmeasured, which is true, rather than recording a
     * number nobody can defend.
     */
    for (const provider of ['mistral', 'xai']) {
      const reader = streamingUsageReader(provider);
      feed(reader, 'data: {"usage":{"prompt_tokens":9,"completion_tokens":1}}\n\n');
      assert.equal(reader.done(), null, `${provider} was read with a shape nobody established`);
    }
  });

  it('says nothing for Google, whose streamed shape is a different fact', () => {
    /**
     * Google is in `WIRE_SHAPES` — its **buffered** shape is established, and
     * `usageFromResponse` reads `usageMetadata` from it. That is not the same
     * fact as its streamed one: Gemini streams from `:streamGenerateContent`,
     * a separate operation with its own event sequence, and the gateway does
     * not forward that path at all.
     *
     * So this reader must not quietly extend the one fact to cover the other.
     * A provider whose buffered shape is known is not thereby a provider whose
     * stream can be read, and the two are separated here rather than left to
     * be noticed the first time a number comes out wrong.
     */
    const openaiish = streamingUsageReader('google');
    feed(openaiish, 'data: {"usage":{"prompt_tokens":9,"completion_tokens":1}}\n\n');
    assert.equal(openaiish.done(), null, "Google's stream was read with OpenAI's shape");

    const geminiish = streamingUsageReader('google');
    feed(geminiish, 'data: {"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":1}}\n\n');
    assert.equal(geminiish.done(), null, "Google's streamed shape was guessed from its buffered one");
  });
});

/**
 * How long a Kimi cache write lives, which the response does not say.
 *
 * Kimi K3 bills a write by its entry's lifetime: input price for five minutes,
 * twice that for an hour (the catalogue's `cacheWrite5m: 1, cacheWrite1h: 2`,
 * from platform.kimi.ai/docs/pricing/chat, reviewed 2026-11-05). Moonshot's
 * API reference, read 2026-11-22, says the request's
 * `prompt_cache_options.ttl` is `"5m"` or `"1h"`, `"5m"` when omitted, and
 * that the Chat Completions response "does not echo the applied mode/ttl". So
 * the reader is told what the request asked. Assuming five minutes when it was
 * not told would price an hour's write at half its cost, which is the
 * direction this project must not round to.
 */
describe("a Kimi write's lifetime comes from the request", () => {
  const response = (details) => ({
    usage: { prompt_tokens: 100_000, completion_tokens: 1_000, prompt_tokens_details: details },
  });

  it('subtracts reads and writes from the prompt, as the page says they are disjoint', () => {
    // 100,000 - 60,000 read - 30,000 written = 10,000 fresh, the importer's own case in moonshot-xai.test.js.
    const usage = usageFromResponse('moonshot', response({ cached_tokens: 60_000, cache_write_tokens: 30_000 }), {
      cacheTtl: null,
    });
    assert.equal(usage.inputTokens, 10_000);
    assert.equal(usage.cacheReadTokens, 60_000);
    assert.equal(usage.cacheWriteTokens, 30_000);
    assert.equal(usage.outputTokens, 1_000);
  });

  for (const [asked, short, long, what] of [
    [null, 30_000, 0, 'none named is the five-minute default'],
    ['5m', 30_000, 0, 'five minutes'],
    ['1h', 0, 30_000, 'an hour'],
  ]) {
    it(`puts the writes where the request said: ${what}`, () => {
      const buffered = usageFromResponse('moonshot', response({ cached_tokens: 0, cache_write_tokens: 30_000 }), {
        cacheTtl: asked,
      });
      assert.equal(buffered.cacheWrite5mTokens, short);
      assert.equal(buffered.cacheWrite1hTokens, long);

      const reader = streamingUsageReader('moonshot', { cacheTtl: asked });
      feed(reader, `data: {"choices":[],"usage":${JSON.stringify(response({ cache_write_tokens: 30_000 }).usage)}}\n\n`);
      const streamed = reader.done();
      assert.equal(streamed.cacheWrite5mTokens, short, 'the streaming reader split it differently');
      assert.equal(streamed.cacheWrite1hTokens, long, 'the streaming reader split it differently');
    });
  }

  for (const [asked, what] of [
    [undefined, 'a reader nobody told what the request asked'],
    ['24h', 'a lifetime Moonshot does not sell'],
    ['', 'a value that was not a string'],
  ]) {
    it(`leaves the lifetime unknown for ${what}, rather than assuming the cheaper one`, () => {
      const usage = usageFromResponse(
        'moonshot',
        response({ cached_tokens: 0, cache_write_tokens: 30_000 }),
        asked === undefined ? {} : { cacheTtl: asked },
      );
      assert.equal(usage.cacheWriteTokens, 30_000, 'the writes are still counted');
      assert.equal(usage.cacheWrite5mTokens, undefined);
      assert.equal(usage.cacheWrite1hTokens, undefined);
    });
  }

  it('changes nothing for OpenAI, whose Chat Completions entry has one lifetime', () => {
    /**
     * The other direction. The lifetime table is per provider; a request
     * field Moonshot defines must not move an OpenAI write into the hour slot.
     */
    const usage = usageFromResponse('openai', response({ cached_tokens: 0, cache_write_tokens: 30_000 }), {
      cacheTtl: '1h',
    });
    assert.equal(usage.cacheWrite5mTokens, 30_000);
    assert.equal(usage.cacheWrite1hTokens, 0);
  });

  it('still refuses, when strict, a read and a write larger than the prompt', () => {
    const usage = usageFromResponse('moonshot', response({ cached_tokens: 80_000, cache_write_tokens: 30_000 }), {
      requireComplete: true,
      cacheTtl: null,
    });
    assert.equal(usage, null);
  });
});
