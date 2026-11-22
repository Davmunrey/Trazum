import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it, after } from 'node:test';

import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildGateway, listenGateway, UPSTREAMS, forwards } from '../dist/gateway-server.js';
import { priceGatewayUsage } from '../dist/gateway-spend.js';

/**
 * The gateway in front of Moonshot (#643).
 *
 * The first upstream confirmed from the provider's own API reference rather
 * than from an endpoint this repository already sent a key to.
 * platform.kimi.ai/docs/api/overview.md, read 2026-11-22: service address
 * `https://api.moonshot.ai`, Chat Completions at `POST /v1/chat/completions`,
 * and `Authorization: Bearer $MOONSHOT_API_KEY`. platform.kimi.ai/docs/api/chat.md,
 * the same day: OpenAI's usage shape, with cache reads and writes inside
 * `prompt_tokens`, and a write's lifetime the response does not echo.
 *
 * Each of those is broken on purpose below rather than merely exercised.
 */

const started = [];
after(() => {
  for (const server of started) server.close();
});

const json = (usage) => ({ id: 'chatcmpl-1', object: 'chat.completion', choices: [], usage });

/** A stub Moonshot that records what reached it and answers what the test hands it. */
const upstream = (respond) => {
  const seen = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => {
      seen.push({
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      const answer = respond ?? { type: 'json', body: json({ prompt_tokens: 1_000, completion_tokens: 50 }) };
      if (answer.type === 'sse') {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end(answer.body);
        return;
      }
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(answer.body));
    });
  });
  started.push(server);
  return { server, seen };
};

const gateway = async (over = {}, respond) => {
  const stub = upstream(respond);
  const stubUrl = await new Promise((resolve) => {
    stub.server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${stub.server.address().port}`));
  });
  const recorded = [];
  const targets = [];
  const server = buildGateway({
    provider: 'moonshot',
    catalogue: BUNDLED_CATALOGUE,
    policy: { onCannotTell: 'fail-closed' },
    standing: () => ({ limitUsd: 100, consumedUsd: 1, provenance: 'measured', asOfMs: 0 }),
    record: (m) => recorded.push(m),
    note: () => {},
    // Only the origin is rewritten, and the URL the gateway built is kept, so
    // the host and path under test are the ones compiled in.
    fetchImpl: (url, init) => {
      targets.push(String(url));
      return fetch(String(url).replace(UPSTREAMS.moonshot.origin, stubUrl), init);
    },
    ...over,
  });
  started.push(server);
  const where = await listenGateway(server, { port: 0 });
  return { where, seen: stub.seen, recorded, targets };
};

const body = (over = {}) =>
  JSON.stringify({
    model: 'kimi-k3',
    max_completion_tokens: 256,
    messages: [{ role: 'user', content: 'synthetic test' }],
    ...over,
  });

const post = (where, text, path = '/v1/chat/completions', headers = {}) =>
  fetch(`${where}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: text,
  });

describe('the gateway forwards Moonshot', () => {
  it('to the host and path its reference names, and nowhere else', async () => {
    const g = await gateway();
    const response = await post(g.where, body());
    assert.equal(response.status, 200);
    assert.deepEqual(g.targets, ['https://api.moonshot.ai/v1/chat/completions']);
    assert.equal(g.seen[0].url, '/v1/chat/completions');
    assert.equal(g.seen[0].method, 'POST');
  });

  it('with the bearer key in the header Moonshot reads, untouched, and the body byte for byte', async () => {
    const g = await gateway();
    const sent = body();
    await post(g.where, sent, '/v1/chat/completions', { authorization: 'Bearer sk-not-a-real-moonshot-key-000' });
    assert.equal(g.seen[0].headers.authorization, 'Bearer sk-not-a-real-moonshot-key-000');
    assert.equal(g.seen[0].body, sent);
  });

  for (const [what, method, path] of [
    ['the path without its /v1', 'POST', '/chat/completions'],
    ['the Responses operation on the same host', 'POST', '/v1/responses'],
    ['the Anthropic-shaped operation on the same host', 'POST', '/anthropic/v1/messages'],
    ['the model list, which is not on this list', 'GET', '/v1/models'],
    // A query is a suffix the whole-path comparison has to refuse; `..` would
    // be resolved by fetch before it left this process, and test nothing.
    ['a suffix on the path it forwards', 'POST', '/v1/chat/completions?model=kimi-k3'],
  ]) {
    it(`refuses ${what}`, async () => {
      const g = await gateway();
      const response = await fetch(`${g.where}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(method === 'GET' ? {} : { body: body() }),
      });
      assert.equal(response.status, 404);
      assert.equal((await response.json()).forwards, `POST ${forwards(UPSTREAMS.moonshot)}`);
      assert.equal(g.seen.length, 0, 'the stub was reached');
    });
  }
});

describe('and measures what Moonshot reported', () => {
  it('with reads and writes taken out of the prompt and reasoning left inside the output', async () => {
    // 100,000 - 60,000 read - 30,000 written = 10,000 fresh. Output 1,000, not 1,000 + 400:
    // the page says output includes reasoning.
    const g = await gateway({}, {
      type: 'json',
      body: json({
        prompt_tokens: 100_000,
        completion_tokens: 1_000,
        completion_tokens_details: { reasoning_tokens: 400 },
        prompt_tokens_details: { cached_tokens: 60_000, cache_write_tokens: 30_000 },
      }),
    });
    await post(g.where, body());
    assert.deepEqual(g.recorded, [{
      model: 'kimi-k3',
      label: null,
      substituted: false,
      inputTokens: 10_000,
      outputTokens: 1_000,
      cacheReadTokens: 60_000,
      cacheWriteTokens: 30_000,
      cacheWrite5mTokens: 30_000,
      cacheWrite1hTokens: 0,
    }]);
  });

  it('from the final chunk of a stream that asked for usage', async () => {
    const g = await gateway({}, {
      type: 'sse',
      body: [
        'data: {"choices":[{"index":0,"delta":{"content":"2"},"finish_reason":null}]}',
        '',
        'data: {"choices":[],"usage":{"prompt_tokens":373,"completion_tokens":93,"total_tokens":466,"completion_tokens_details":{"reasoning_tokens":71},"prompt_tokens_details":{"cache_write_tokens":256}}}',
        '',
        'data: [DONE]',
        '',
        '',
      ].join('\n'),
    });
    const response = await post(g.where, body({ stream: true, stream_options: { include_usage: true } }));
    await response.text();
    assert.equal(g.recorded.length, 1);
    assert.equal(g.recorded[0].inputTokens, 117, '373 - 256 written');
    assert.equal(g.recorded[0].outputTokens, 93);
    assert.equal(g.recorded[0].cacheWrite5mTokens, 256);
  });
});

describe("and prices a Kimi write at the lifetime the request asked for", () => {
  /**
   * Kimi K3 is $3 per million input and its catalogue entry writes at 1x for
   * five minutes and 2x for an hour (platform.kimi.ai/docs/pricing/chat,
   * reviewed 2026-11-05). 100,000 written:
   *   five minutes: 100,000 x $3 x 1 / 1,000,000 = $0.30
   *   an hour:      100,000 x $3 x 2 / 1,000,000 = $0.60
   */
  const writes = {
    type: 'json',
    body: json({
      prompt_tokens: 100_000,
      completion_tokens: 0,
      prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 100_000 },
    }),
  };
  const close = (actual, expected, what) =>
    assert.ok(actual !== null && Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
  const priced = (usage) => priceGatewayUsage(BUNDLED_CATALOGUE, 'kimi-k3', usage, Date.now());

  it('no lifetime named is the five-minute default the page names', async () => {
    const g = await gateway({}, writes);
    await post(g.where, body());
    close(priced(g.recorded[0]), 0.3, 'a five-minute write');
  });

  it('"1h" is the hour, at twice the price', async () => {
    const g = await gateway({}, writes);
    await post(g.where, body({ prompt_cache_options: { mode: 'implicit', ttl: '1h' } }));
    assert.equal(g.recorded[0].cacheWrite1hTokens, 100_000);
    close(priced(g.recorded[0]), 0.6, 'an hour write');
  });

  it('a lifetime it cannot read is left unpriced, not priced at the cheaper one', async () => {
    const g = await gateway({}, writes);
    await post(g.where, body({ prompt_cache_options: { ttl: 3600 } }));
    assert.equal(g.recorded[0].cacheWriteTokens, 100_000);
    assert.equal(priced(g.recorded[0]), null);
  });

  it('and the live budget will not admit the next call on a balance it could not price', async () => {
    let calls = 0;
    const g = await gateway({
      liveBudget: true,
      standing: () => ({ limitUsd: 100, consumedUsd: 0, provenance: 'measured', asOfMs: Date.now() }),
      fetchImpl: async () => {
        calls += 1;
        return new Response(JSON.stringify(writes.body), { headers: { 'content-type': 'application/json' } });
      },
    });
    const unreadable = body({ prompt_cache_options: { ttl: 'forever' } });
    assert.equal((await post(g.where, unreadable)).status, 200);
    assert.equal((await post(g.where, unreadable)).status, 402);
    assert.equal(calls, 1, 'the second call reached the provider');
  });
});
