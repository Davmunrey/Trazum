import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, it } from 'node:test';

import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildGateway, listenGateway } from '../dist/gateway-server.js';

/**
 * The gateway in a real path: bytes reach the caller before the answer ends.
 *
 * Until 1.52 the relay read `await upstreamResponse.text()` for every response.
 * For `"stream": true` — nearly all production traffic, and every agent loop —
 * the caller waited for the whole answer and then received it at once, so time
 * to first token became the total generation time.
 *
 * The assertion that matters is not "the bytes arrived". It is **"the first
 * byte arrived while the upstream was still generating"**, which is the only
 * form that fails against a buffering proxy.
 */

const started = [];
after(() => {
  for (const server of started) server.close();
});

/** An upstream that streams on a leash: it emits when the test says so. */
const streamingUpstream = () => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write(
        'event: message_start\ndata: {"message":{"usage":{"input_tokens":1200,"output_tokens":1}}}\n\n',
      );
      // Nothing more until the test has proved the head and first event
      // already reached the caller.
      held.then(() => {
        response.write('event: message_delta\ndata: {"usage":{"output_tokens":37}}\n\n');
        response.end('event: message_stop\ndata: {"type":"message_stop"}\n\n');
      });
    });
  });
  started.push(server);
  return { server, release: () => release() };
};

const gatewayOver = async (stub, over = {}) => {
  const stubUrl = await new Promise((resolve) => {
    stub.server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${stub.server.address().port}`));
  });
  const recorded = [];
  const notes = [];
  const server = buildGateway({
    provider: 'anthropic',
    catalogue: BUNDLED_CATALOGUE,
    policy: { onCannotTell: 'fail-closed' },
    standing: () => ({ limitUsd: 100, consumedUsd: 1, provenance: 'measured', asOfMs: 0 }),
    record: (m) => recorded.push(m),
    note: (line) => notes.push(line),
    fetchImpl: (url, init) => fetch(`${stubUrl}/v1/messages`, init),
    ...over,
  });
  started.push(server);
  const where = await listenGateway(server, { port: 0 });
  return { where, recorded, notes };
};

const body = JSON.stringify({
  model: 'claude-opus-5',
  stream: true,
  messages: [{ role: 'user', content: 'hello' }],
});

describe('a streamed answer is relayed as it arrives', () => {
  it('delivers the first event before the upstream has finished', async () => {
    const stub = streamingUpstream();
    const { where, recorded } = await gatewayOver(stub);

    const response = await fetch(`${where}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);

    const reader = response.body.getReader();
    const first = await reader.read();
    const text = new TextDecoder().decode(first.value);

    // The upstream is still holding the rest. A buffering proxy cannot get
    // here: it would still be awaiting a body that has not ended.
    assert.match(text, /message_start/);
    assert.equal(recorded.length, 0, 'nothing is recorded until the stream ends');

    stub.release();
    let rest = text;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      rest += new TextDecoder().decode(next.value);
    }
    assert.match(rest, /message_stop/);

    assert.equal(recorded.length, 1);
    assert.equal(recorded[0].inputTokens, 1200);
    assert.equal(recorded[0].outputTokens, 37, 'the last delta wins, not the first');
  });

  it('still buffers a response the provider did not stream', async () => {
    // The provider decides, not the request body: a call asking to stream can
    // come back whole, and content-type is what actually arrived.
    const server = createServer((request, response) => {
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ usage: { input_tokens: 9, output_tokens: 3 } }));
      });
    });
    started.push(server);
    const { where, recorded } = await gatewayOver({ server });

    const response = await fetch(`${where}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { usage: { input_tokens: 9, output_tokens: 3 } });
    assert.equal(recorded[0].inputTokens, 9);
  });

  it('records nothing when a stream carries no usage event', async () => {
    /**
     * Not zero. A call whose usage never arrived is not a free call, and a zero
     * would make the period's total quietly too low — the flattering direction.
     */
    const server = createServer((request, response) => {
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        response.end('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n');
      });
    });
    started.push(server);
    const { where, recorded } = await gatewayOver({ server }, { provider: 'openai' });

    const response = await fetch(`${where}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-5', stream: true, messages: [] }),
    });
    await response.text();
    assert.deepEqual(recorded, []);
  });
});
