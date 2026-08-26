import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { describe, it, after } from 'node:test';

import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildGateway, listenGateway, UPSTREAMS, alsoForwards, forwards, route } from '../dist/gateway-server.js';

/**
 * The paths this gateway forwards without judging, and everything that must
 * stay true about them.
 *
 * Until now the rule was one path per provider, and the reason was good: a
 * gateway that forwards any path is a general proxy for somebody's API key.
 * The cost of that rule was that a coding agent pointed at this gateway got a
 * 404 within its first second, from a proxy that was otherwise working.
 *
 * So a second, shorter list exists: paths that spend no tokens. **Refusing
 * those was never the stricter answer.** `count_tokens` is the call you make to
 * find out whether you can afford the other one, and answering it with a 402
 * blinds a caller at the exact moment they are trying to behave. A budget
 * refusal only means something when there is money on the line.
 *
 * What that buys has to be paid for in guarantees, and this file is the
 * payment: the free branch reaches no decision and records nothing, the
 * comparison is whole-string so no prefix can be suffixed into something else,
 * the method is part of the match, and a free path cannot be added without
 * writing down in `docs/gateway.md` why it costs nothing.
 */

const started = [];
after(() => {
  for (const server of started) server.close();
});

/** An upstream that answers everything, and remembers what it was asked. */
const upstream = () => {
  const seen = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => {
      seen.push({ url: request.url, method: request.method, headers: request.headers });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, saw: request.url }));
    });
  });
  started.push(server);
  return { server, seen };
};

/**
 * A gateway in front of Anthropic whose budget refuses everything.
 *
 * `fail-closed` with no standing is the harshest configuration this thing has:
 * every call that is judged is refused. That is the point. A free path that
 * gets through here got through without being judged, which is the property
 * under test and cannot be faked by a lenient budget.
 */
const gateway = async (over = {}) => {
  const stub = upstream();
  const stubUrl = await new Promise((resolve) => {
    stub.server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${stub.server.address().port}`));
  });

  const recorded = [];
  const notes = [];
  const server = buildGateway({
    provider: 'anthropic',
    catalogue: BUNDLED_CATALOGUE,
    policy: { onCannotTell: 'fail-closed' },
    standing: () => null,
    record: (m) => recorded.push(m),
    note: (line) => notes.push(line),
    fetchImpl: (url, init) => fetch(String(url).replace(UPSTREAMS.anthropic.origin, stubUrl), init),
    ...over,
  });
  started.push(server);
  const url = await listenGateway(server, { port: 0 });
  return { url, recorded, notes, seen: stub.seen };
};

const SPENDS = {
  model: 'claude-opus-5',
  max_tokens: 16,
  messages: [{ role: 'user', content: 'hi' }],
};

describe('a path that spends nothing is forwarded without being judged', () => {
  it('refuses the spending call and forwards the counting one, in the same breath', async () => {
    const g = await gateway();

    // The control. With no budget and fail-closed, the call that spends money
    // is refused. If this ever passes, the test below proves nothing.
    const spent = await fetch(`${g.url}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(SPENDS),
    });
    assert.equal(spent.status, 402, 'the spending path was not refused, so nothing below is evidence');

    // The same gateway, the same instant, a path that costs nothing.
    const counted = await fetch(`${g.url}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-5', messages: SPENDS.messages }),
    });
    assert.equal(counted.status, 200, 'a call that spends nothing was refused for having no budget');
    assert.deepEqual(await counted.json(), { ok: true, saw: '/v1/messages/count_tokens' });

    const listed = await fetch(`${g.url}/v1/models`);
    assert.equal(listed.status, 200, 'listing the models was refused for having no budget');
    assert.deepEqual(await listed.json(), { ok: true, saw: '/v1/models' });
  });

  it('records nothing for them, because there is nothing to record', async () => {
    /**
     * A count is not a bill. Recording usage for a call that spent nothing
     * would put a figure in the log that no provider ever charged, which is
     * the failure this whole product exists to refuse.
     *
     * Proved with a `record` that throws rather than by inspecting an array:
     * an empty array is also what a broken harness produces.
     */
    const g = await gateway({
      record: () => {
        throw new Error('a free path recorded usage');
      },
    });

    const counted = await fetch(`${g.url}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-5', messages: SPENDS.messages }),
    });
    assert.equal(counted.status, 200);
    assert.equal((await fetch(`${g.url}/v1/models`)).status, 200);
  });

  it('reaches the upstream at the path asked for, and only that path', async () => {
    const g = await gateway();
    await fetch(`${g.url}/v1/models`);
    await fetch(`${g.url}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });

    assert.deepEqual(
      g.seen.map((r) => `${r.method} ${r.url}`),
      ['GET /v1/models', 'POST /v1/messages/count_tokens'],
    );
  });
});

describe('and everything else is still refused', () => {
  const cases = [
    ['POST', '/v1/messages/batches', 'a path that bills and looks administrative'],
    ['GET', '/v1/models/../messages', 'traversal out of a free prefix'],
    ['GET', '/v1/models?limit=1', 'a query string on a free path'],
    ['GET', '/v1/modelsX', 'a free path with a suffix'],
    ['GET', '/v1/model', 'a free path with a character removed'],
    ['GET', '/v1/messages/count_tokens', 'the right path on the wrong method'],
    ['POST', '/v1/models', 'the other right path on the wrong method'],
    ['DELETE', '/v1/models', 'a method nothing here answers'],
  ];

  for (const [method, path, why] of cases) {
    it(`refuses ${method} ${path}: ${why}`, async () => {
      const g = await gateway();
      const response = await fetch(`${g.url}${path}`, { method });
      assert.equal(response.status, 404, `${method} ${path} was forwarded`);
      assert.equal(g.seen.length, 0, `${method} ${path} reached the upstream`);
    });
  }

  it('names what it does forward, both lists, rather than refusing bare', async () => {
    const g = await gateway();
    const body = await (await fetch(`${g.url}/v1/messages/batches`, { method: 'POST' })).json();

    assert.equal(body.forwards, `POST ${forwards(UPSTREAMS.anthropic)}`);
    assert.deepEqual(body.alsoForwards, alsoForwards(UPSTREAMS.anthropic));
    assert.ok(body.alsoForwards.length > 0, 'the free list is empty, so this assertion proves nothing');
  });
});

describe('the free list cannot be widened quietly', () => {
  it('holds literal strings, never patterns', () => {
    /**
     * A pattern in this list would be a widening with no budget check behind
     * it, which is precisely the general-proxy shape the one-path rule exists
     * to refuse. The spending path is allowed to be a pattern because Google
     * puts the model in the URL and because everything matching it is judged.
     * Nothing here is judged, so nothing here may be a pattern.
     */
    const wrong = [];
    for (const [name, up] of Object.entries(UPSTREAMS)) {
      for (const entry of up.free ?? []) {
        if (typeof entry.path !== 'string') wrong.push(`${name}: ${String(entry.path)} is not a literal`);
        if (!['GET', 'POST'].includes(entry.method)) wrong.push(`${name}: ${entry.method} is not a method this forwards`);
        if (entry.path === forwards(up)) wrong.push(`${name}: ${entry.path} is the path that spends`);
      }
    }
    assert.deepEqual(wrong, [], `the free list is not what it claims to be:\n  ${wrong.join('\n  ')}`);
  });

  it('names every one of them in docs/gateway.md, with a reason', () => {
    /**
     * The only real defence here is that adding one is a decision somebody
     * wrote down. A free path is forwarded unjudged, so a free path that
     * actually billed would bill silently, and no test can derive "this
     * operation is free" from an API this repository does not own.
     *
     * What a test *can* do is make the addition impossible to make quietly.
     */
    const doc = readFileSync(new URL('../../../docs/gateway.md', import.meta.url).pathname, 'utf8');
    const missing = [];
    for (const [name, up] of Object.entries(UPSTREAMS)) {
      for (const path of alsoForwards(up)) {
        if (!doc.includes(path)) missing.push(`${name}: ${path}`);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `these are forwarded without a budget decision and docs/gateway.md does not name them:\n  ${missing.join('\n  ')}`,
    );
  });

  it('routes them as free and the spending path as spending', () => {
    assert.deepEqual(route(UPSTREAMS.anthropic, 'POST', '/v1/messages'), {
      path: '/v1/messages',
      model: null,
      spends: true,
    });
    assert.deepEqual(route(UPSTREAMS.anthropic, 'GET', '/v1/models'), {
      path: '/v1/models',
      model: null,
      spends: false,
    });
    assert.deepEqual(route(UPSTREAMS.anthropic, 'POST', '/v1/messages/count_tokens'), {
      path: '/v1/messages/count_tokens',
      model: null,
      spends: false,
    });

    // A provider with no free list keeps exactly the behaviour it had.
    assert.equal(route(UPSTREAMS.openai, 'GET', '/v1/models'), null);
    assert.equal(route(UPSTREAMS.google, 'GET', '/v1/models'), null);
  });
});
