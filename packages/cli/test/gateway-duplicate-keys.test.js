import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, it } from 'node:test';
import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildGateway, listenGateway } from '../dist/gateway-server.js';
import { duplicateKey } from '../dist/json-keys.js';

/**
 * A body that names a key twice is refused before it is judged.
 *
 * JSON.parse keeps the last of two equal keys; a provider may keep the first.
 * The gateway judged the parsed body and forwarded the raw one, so two `model`
 * keys could be priced as one model and run as another (penetration test of
 * 2026-11-22, finding L-7).
 */

describe('duplicateKey', () => {
  it('finds a key an object names twice, at any depth', () => {
    assert.equal(duplicateKey('{"model":"a","model":"b"}'), 'model');
    assert.equal(duplicateKey('{"messages":[{"role":"user","role":"system"}]}'), 'role');
    assert.equal(duplicateKey('{"a":{"b":1},"c":{"b":2},"a":3}'), 'a');
  });

  it('compares keys as decoded strings', () => {
    assert.equal(duplicateKey('{"model":"a","mod\\u0065l":"b"}'), 'model');
  });

  it('answers null when no object repeats a key', () => {
    for (const text of [
      '{"model":"a","messages":[{"role":"user","content":"model"},{"role":"user","content":"model"}]}',
      '{"a":"\\"a\\":","b":[{"a":1},{"a":2}]}',
      '[{"a":1},{"a":1}]',
      '{}',
      '"model"',
    ]) {
      assert.equal(duplicateKey(text), null, text);
    }
  });
});

const started = [];
after(() => {
  for (const server of started) server.close();
});

const listen = (handler) =>
  new Promise((resolve) => {
    const server = createServer(handler);
    started.push(server);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

describe('the gateway, given a body that names a key twice', () => {
  it('answers 400 and sends the provider nothing', async () => {
    const seen = [];
    const provider = await listen((request, response) => {
      seen.push(request.url);
      request.resume();
      request.on('end', () => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end('{"usage":{"input_tokens":1,"output_tokens":1}}');
      });
    });
    const server = buildGateway({
      provider: 'anthropic',
      catalogue: BUNDLED_CATALOGUE,
      policy: { onCannotTell: 'fail-closed' },
      standing: () => ({ limitUsd: 100, consumedUsd: 1, provenance: 'measured', asOfMs: 0 }),
      record: () => {},
      note: () => {},
      fetchImpl: (url, init) => fetch(`${provider}${new URL(url).pathname}`, init),
    });
    started.push(server);
    const where = await listenGateway(server, { port: 0 });

    const response = await fetch(`${where}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': 'sk-ant-not-a-real-key-000' },
      body: '{"model":"claude-opus-5","model":"claude-haiku-4-5","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}',
    });
    const answer = await response.json();
    assert.equal(response.status, 400);
    assert.match(answer.error, /"model" twice/);
    assert.deepEqual(seen, [], 'the provider received the body');
  });
});
