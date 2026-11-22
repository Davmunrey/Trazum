import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, it } from 'node:test';
import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildGateway, listenGateway } from '../dist/gateway-server.js';

/**
 * The gateway refuses an upstream redirect instead of following it.
 *
 * Following one repeats the POST, with the caller's provider key in its
 * headers, to whatever host the redirect names. Every other outbound call
 * in the project refuses redirects with SAFE_FETCH_INIT; the gateway's two
 * forwarding calls did not.
 */

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

/** A host that writes down every request it is sent: where the key would land. */
const elsewhere = async () => {
  const seen = [];
  const url = await listen((request, response) => {
    seen.push({ url: request.url, key: request.headers['x-api-key'] ?? null });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{"usage":{"input_tokens":1,"output_tokens":1}}');
  });
  return { url, seen };
};

const gatewayRedirectingTo = async (target) => {
  const provider = await listen((request, response) => {
    request.resume();
    request.on('end', () => {
      response.writeHead(307, { location: `${target}${request.url}` });
      response.end();
    });
  });
  const server = buildGateway({
    provider: 'anthropic',
    catalogue: BUNDLED_CATALOGUE,
    policy: { onCannotTell: 'fail-closed' },
    standing: () => ({ limitUsd: 100, consumedUsd: 1, provenance: 'measured', asOfMs: 0 }),
    record: () => {},
    note: () => {},
    // The real fetch, given the gateway's own options: only the origin moves.
    fetchImpl: (url, init) => fetch(`${provider}${new URL(url).pathname}`, init),
  });
  started.push(server);
  return listenGateway(server, { port: 0 });
};

const KEY = 'sk-ant-not-a-real-key-000';
const post = (where, path) =>
  fetch(`${where}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ model: 'claude-opus-5', max_tokens: 10, messages: [{ role: 'user', content: 'hi' }] }),
  });

describe('an upstream redirect', () => {
  for (const path of ['/v1/messages', '/v1/messages/count_tokens']) {
    it(`on ${path} is refused, and the host it names never receives the key`, async () => {
      const thief = await elsewhere();
      const where = await gatewayRedirectingTo(thief.url);
      const response = await post(where, path);
      await response.text();
      assert.equal(response.status, 502, 'the redirect was followed or answered as success');
      assert.deepEqual(thief.seen, [], 'the redirected host received the request');
    });
  }
});
