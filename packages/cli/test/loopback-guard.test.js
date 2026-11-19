import assert from 'node:assert/strict';
import { request } from 'node:http';
import { after, describe, it } from 'node:test';

import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildGateway, listenGateway } from '../dist/gateway-server.js';
import { hostIsLoopback, isJsonContentType } from '../dist/loopback-guard.js';
import { buildServer, listen } from '../dist/serve.js';

/**
 * DNS rebinding against the two loopback servers.
 *
 * A page can point its own hostname at 127.0.0.1 and then read what the server
 * answers as if it were its own origin. `fetch` cannot be used to play the
 * page: it will not send a `Host` the URL does not name. So these send the
 * request a rebound browser sends, by hand, over `node:http`: the attacker's
 * `Host`, an `Origin`, and `text/plain`, which a page may send without a
 * preflight.
 *
 * The audit's attack: POST /cost with the attacker's Host and a text/plain
 * body, answered 200 with the spend and the budget. Two refusals close it, a
 * `Host` that is not a loopback name on the bound port (403) and a POST that
 * does not say `application/json` (415).
 */

const started = [];
after(() => {
  for (const server of started) {
    server.closeAllConnections?.();
    server.close();
  }
});

const raw = (port, { method = 'POST', path = '/cost', host, type, body = '' }) =>
  new Promise((resolve, reject) => {
    const headers = { host, origin: `http://${host}` };
    if (type !== undefined) headers['content-type'] = type;
    if (body !== '') headers['content-length'] = Buffer.byteLength(body);
    const outgoing = request({ host: '127.0.0.1', port, method, path, headers }, (response) => {
      const chunks = [];
      response.on('data', (c) => chunks.push(c));
      response.on('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });

const COST = JSON.stringify({ model: 'claude-opus-5', inputTokens: 1000 });

const oracle = async () => {
  const server = buildServer({
    catalogue: BUNDLED_CATALOGUE,
    position: () => ({ consumedUsd: 40, limitUsd: 50 }),
  });
  started.push(server);
  const where = await listen(server, { port: 0 });
  return Number(where.split(':').pop());
};

const gateway = async () => {
  const seen = [];
  const server = buildGateway({
    provider: 'anthropic',
    catalogue: BUNDLED_CATALOGUE,
    policy: { onCannotTell: 'fail-closed' },
    standing: () => ({ limitUsd: 100, consumedUsd: 99.999, provenance: 'measured', asOfMs: 0 }),
    record: () => {},
    note: () => {},
    fetchImpl: (url) => { seen.push(String(url)); return Promise.resolve(new Response('{}', { status: 200 })); },
  });
  started.push(server);
  const where = await listenGateway(server, { port: 0 });
  return { port: Number(where.split(':').pop()), seen };
};

describe('the Host and content-type checks', () => {
  it('accept the loopback names on the bound port and nothing else', () => {
    for (const host of ['127.0.0.1:7317', 'localhost:7317', 'LOCALHOST:7317', '[::1]:7317']) {
      assert.equal(hostIsLoopback(host, 7317), true, host);
    }
    for (const host of [
      undefined, '', '127.0.0.1', 'localhost', '127.0.0.1:7318', 'rebind.attacker.example:7317',
      '127.0.0.1.attacker.example:7317', 'localhost.attacker.example:7317', '0.0.0.0:7317', 'localhost:7317:1',
    ]) {
      assert.equal(hostIsLoopback(host, 7317), false, String(host));
    }
    assert.equal(isJsonContentType('application/json'), true);
    assert.equal(isJsonContentType('Application/JSON; charset=utf-8'), true);
    for (const type of [undefined, 'text/plain', 'application/x-www-form-urlencoded', 'application/jsonx', 'text/plain; application/json']) {
      assert.equal(isJsonContentType(type), false, String(type));
    }
  });
});

describe('trazum serve against a rebound page', () => {
  it('refuses a Host that is not loopback, and says nothing of the spend', async () => {
    const port = await oracle();
    const answer = await raw(port, { host: `rebind.attacker.example:${port}`, type: 'text/plain', body: COST });
    assert.equal(answer.status, 403);
    assert.doesNotMatch(answer.text, /consumed|limit|verdict|standing/i);
    // The same page asking in a form a preflight would not stop: still refused.
    const json = await raw(port, { host: `rebind.attacker.example:${port}`, type: 'application/json', body: COST });
    assert.equal(json.status, 403);
    // And a read, because a 404 from the wrong Host is still an answer.
    const read = await raw(port, { method: 'GET', path: '/health', host: `rebind.attacker.example:${port}` });
    assert.equal(read.status, 403);
  });

  it('refuses a POST that is not application/json, even from a loopback Host', async () => {
    const port = await oracle();
    for (const type of ['text/plain', 'application/x-www-form-urlencoded', undefined]) {
      const answer = await raw(port, { host: `127.0.0.1:${port}`, type, body: COST });
      assert.equal(answer.status, 415, String(type));
      assert.doesNotMatch(answer.text, /consumed|limit|verdict/i);
    }
  });

  it('still answers the loopback names with application/json', async () => {
    const port = await oracle();
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`]) {
      const answer = await raw(port, { host, type: 'application/json; charset=utf-8', body: COST });
      assert.equal(answer.status, 200, host);
      assert.equal(JSON.parse(answer.text).schemaVersion, 1);
    }
    const health = await raw(port, { method: 'GET', path: '/health', host: `127.0.0.1:${port}` });
    assert.equal(health.status, 200);
  });
});

describe('trazum gateway against a rebound page', () => {
  it('refuses a Host that is not loopback before it routes, decides or forwards', async () => {
    const { port, seen } = await gateway();
    const body = JSON.stringify({ model: 'claude-opus-5', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] });
    const answer = await raw(port, { path: '/v1/messages', host: `rebind.attacker.example:${port}`, type: 'text/plain', body });
    assert.equal(answer.status, 403);
    // The 402 body is what carries the standing and the estimate.
    assert.doesNotMatch(answer.text, /standing|estimatedUsd|trazum_budget_refusal/);
    assert.deepEqual(seen, [], 'a refused request reached the provider');
  });

  it('refuses a POST that is not application/json from a loopback Host', async () => {
    const { port, seen } = await gateway();
    const body = JSON.stringify({ model: 'claude-opus-5', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] });
    const answer = await raw(port, { path: '/v1/messages', host: `127.0.0.1:${port}`, type: 'text/plain', body });
    assert.equal(answer.status, 415);
    assert.doesNotMatch(answer.text, /standing|estimatedUsd/);
    assert.deepEqual(seen, []);
  });

  it('still judges a JSON request addressed to localhost', async () => {
    const { port } = await gateway();
    const body = JSON.stringify({ model: 'claude-opus-5', max_tokens: 100, messages: [{ role: 'user', content: 'hi' }] });
    const answer = await raw(port, { path: '/v1/messages', host: `localhost:${port}`, type: 'application/json', body });
    // $99.999 of $100 spent: judged, not refused for its Host or its type.
    assert.notEqual(answer.status, 403);
    assert.notEqual(answer.status, 415);
  });
});
