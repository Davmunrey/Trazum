import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { describe, it, after } from 'node:test';

import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildGateway, listenGateway, MAX_GATEWAY_BODY_BYTES } from '../dist/gateway-server.js';

/**
 * The proxy, end to end, against a stub upstream.
 *
 * The decision is tested in the core without a socket. This tests the half a
 * socket can get wrong: what reaches the provider, what comes back, what is
 * written down, and — the one that matters — that a refusal is a refusal and
 * never a quietly different request.
 */

const started = [];
after(() => {
  for (const server of started) server.close();
});

/** A stub provider that records exactly what it was sent. */
const upstream = () => {
  const seen = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => {
      seen.push({ headers: request.headers, body: Buffer.concat(chunks).toString('utf8') });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ id: 'msg_1', usage: { input_tokens: 1234, output_tokens: 56 } }));
    });
  });
  started.push(server);
  return { server, seen };
};

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
    standing: () => ({ limitUsd: 100, consumedUsd: 1, provenance: 'measured', asOfMs: 0 }),
    record: (m) => recorded.push(m),
    note: (line) => notes.push(line),
    // Rewrites only the origin, so every other behaviour under test is the
    // real one: the same headers, the same body, the same response handling.
    fetchImpl: (url, init) => fetch(`${stubUrl}/v1/messages`, init),
    ...over,
  });
  started.push(server);
  const where = await listenGateway(server, { port: 0 });
  return { where, seen: stub.seen, recorded, notes };
};

const call = (over = {}) =>
  JSON.stringify({
    model: 'claude-opus-5',
    max_tokens: 100,
    messages: [{ role: 'user', content: 'hello' }],
    ...over,
  });

const post = (where, body, headers = {}) =>
  fetch(`${where}/v1/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body,
  });

describe('the gateway forwards', () => {
  it('sends the body byte for byte, and the caller\'s credential untouched', async () => {
    /**
     * The credential is not even borrowed. It is the caller's own header,
     * forwarded and never read — a stronger promise than the connector's
     * *borrowed, never held*, and the right one for a component sitting
     * between somebody and their provider.
     */
    const g = await gateway();
    const body = call();
    const response = await post(g.where, body, { 'x-api-key': 'sk-ant-not-a-real-key-000' });
    assert.equal(response.status, 200);

    assert.equal(g.seen.length, 1);
    assert.equal(g.seen[0].body, body, 'the body reaching the provider is the body sent');
    assert.equal(g.seen[0].headers['x-api-key'], 'sk-ant-not-a-real-key-000');
  });

  it('records the provider\'s own counts, arriving with the answer', async () => {
    // The reason this beats a connector: measured at the moment of the call,
    // with no export and no lag.
    const g = await gateway();
    await post(g.where, call());
    assert.deepEqual(g.recorded, [
      {
        model: 'claude-opus-5',
        label: null,
        substituted: false,
        inputTokens: 1234,
        outputTokens: 56,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    ]);
  });

  it('takes a label only when the caller named one', async () => {
    // Guessing one from a path or a user agent would attribute somebody's
    // spend to a workload they never named.
    const g = await gateway();
    await post(g.where, call({ metadata: { trazum_label: 'support-rag' } }));
    assert.equal(g.recorded[0].label, 'support-rag');
  });

  it('passes the provider\'s response back unchanged', async () => {
    const g = await gateway();
    const body = await (await post(g.where, call())).json();
    assert.equal(body.id, 'msg_1');
  });
});

describe('the gateway refuses', () => {
  const overBudget = { standing: () => ({ limitUsd: 1, consumedUsd: 500, provenance: 'measured', asOfMs: 0 }) };

  it('answers 402 and never 429', async () => {
    /**
     * Every provider SDK retries a 429 automatically — that is what the code
     * means to them — so answering a budget refusal with one turns a single
     * refusal into a retry storm against a gateway that will refuse every
     * time. 402 is literally correct and in nobody's default retry list.
     */
    const g = await gateway(overBudget);
    const response = await post(g.where, call());
    assert.equal(response.status, 402);
  });

  it('does not forward the call at all', async () => {
    const g = await gateway(overBudget);
    await post(g.where, call());
    assert.deepEqual(g.seen, [], 'a refused call must not reach the provider');
    assert.deepEqual(g.recorded, [], 'and nothing is recorded, because nothing was spent');
  });

  it('names what it rested on and what to do instead', async () => {
    const g = await gateway(overBudget);
    const body = await (await post(g.where, call())).json();
    assert.equal(body.error.type, 'trazum_budget_refusal');
    assert.equal(body.reason, 'budget-exhausted');
    assert.equal(body.restsOn, 'measured');
    assert.ok(body.alternatives.length > 0, 'a refusal never arrives bare');
    assert.ok(body.alternatives[0].assumes.length > 0);
  });

  it('carries no prompt back in the refusal', async () => {
    // The body passed through this process. It must not come back out of it.
    const g = await gateway(overBudget);
    const text = await (await post(g.where, call({ messages: [{ role: 'user', content: 'SECRET-PROMPT-TEXT' }] }))).text();
    assert.doesNotMatch(text, /SECRET-PROMPT-TEXT/);
  });

  it('never logs the body, on any path', async () => {
    const g = await gateway(overBudget);
    await post(g.where, call({ messages: [{ role: 'user', content: 'SECRET-PROMPT-TEXT' }] }));
    for (const note of g.notes) assert.doesNotMatch(note, /SECRET-PROMPT-TEXT/);
  });
});

describe('the gateway substitutes only when told to, and marks it', () => {
  const configured = {
    standing: () => ({ limitUsd: 1, consumedUsd: 500, provenance: 'measured', asOfMs: 0 }),
    policy: {
      onCannotTell: 'fail-closed',
      substitute: { 'claude-opus-5': { to: 'claude-haiku-4-5', reason: 'quarter is over budget' } },
    },
  };

  it('changes exactly one field, and nothing else about the request', async () => {
    const g = await gateway(configured);
    await post(g.where, call());
    const sent = JSON.parse(g.seen[0].body);
    assert.equal(sent.model, 'claude-haiku-4-5');
    assert.equal(sent.max_tokens, 100, 'nothing else was touched');
    assert.deepEqual(sent.messages, [{ role: 'user', content: 'hello' }]);
  });

  it('marks the record, so no later report calls it the call that was asked for', async () => {
    const g = await gateway(configured);
    await post(g.where, call());
    assert.equal(g.recorded[0].substituted, true);
    assert.equal(g.recorded[0].model, 'claude-haiku-4-5');
  });

  it('says so in the operator\'s terminal, with their own reason', async () => {
    const g = await gateway(configured);
    await post(g.where, call());
    assert.ok(g.notes.some((n) => /substituted/.test(n) && /over budget/.test(n)));
  });
});

describe('the gateway is small on purpose', () => {
  it('forwards one path and nothing else', async () => {
    // A gateway that forwarded any path would be a general proxy for
    // somebody's API key, and the budget decision has meaning only for the
    // endpoint that spends tokens.
    const g = await gateway();
    const response = await fetch(`${g.where}/v1/anything-else`, { method: 'POST', body: '{}' });
    assert.equal(response.status, 404);
    assert.deepEqual(g.seen, []);
  });

  it('refuses a GET, which cannot spend anything', async () => {
    const g = await gateway();
    assert.equal((await fetch(`${g.where}/v1/messages`)).status, 404);
  });

  it('refuses a body too large to hold, rather than holding it', async () => {
    const g = await gateway();
    const huge = JSON.stringify({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'x'.repeat(MAX_GATEWAY_BODY_BYTES) }] });
    assert.equal((await post(g.where, huge)).status, 413);
  });

  it('names a request it cannot read a model out of', async () => {
    const g = await gateway();
    assert.equal((await post(g.where, '{"no":"model"}')).status, 400);
    assert.equal((await post(g.where, 'not json')).status, 400);
  });

  it('tells an unreachable provider apart from a refusal', async () => {
    /**
     * The caller needs to know "your provider is down" from "you are out of
     * money". A proxy that blurred them would send somebody to fix the wrong
     * thing, at the worst possible moment.
     */
    const g = await gateway({
      fetchImpl: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    const response = await post(g.where, call());
    assert.equal(response.status, 502, 'not 402 — this is not a budget problem');
    const body = await response.json();
    assert.equal(body.error.type, 'trazum_upstream_unreachable');
  });
});

describe('the gateway when it cannot judge', () => {
  it('refuses under fail-closed, and forwards nothing', async () => {
    const g = await gateway({ standing: () => null, policy: { onCannotTell: 'fail-closed' } });
    assert.equal((await post(g.where, call())).status, 402);
    assert.deepEqual(g.seen, []);
  });

  it('forwards under fail-open, and says the call went unjudged', async () => {
    // The important half: forwarded *and* the fact that nothing judged it is
    // said, so nobody reads it later as "within budget".
    const g = await gateway({ standing: () => null, policy: { onCannotTell: 'fail-open' } });
    assert.equal((await post(g.where, call())).status, 200);
    assert.equal(g.seen.length, 1);
    assert.ok(g.notes.some((n) => /unjudged/.test(n)));
  });
});

describe('the refusal document is a contract', () => {
  const DOC = new URL('../../../docs/json-output.md', import.meta.url).pathname;

  /** Bounded to its own section, like every other harvest in this repository. */
  const documented = async () => {
    const doc = await readFile(DOC, 'utf8');
    const start = doc.indexOf('## The gateway refusal document');
    assert.ok(start > 0, 'the refusal document has no section in docs/json-output.md');
    return new Set([...doc.slice(start).matchAll(/^\| `([a-zA-Z]+)` \|/gm)].map((m) => m[1]));
  };

  const emitted = async () => {
    const g = await gateway({
      standing: () => ({ limitUsd: 1, consumedUsd: 500, provenance: 'measured', asOfMs: 0 }),
    });
    return (await post(g.where, call())).json();
  };

  it('documents every field it emits', async () => {
    const keys = Object.keys(await emitted());
    const promised = await documented();
    assert.deepEqual(
      keys.filter((key) => !promised.has(key)),
      [],
      'fields emitted with no line in docs/json-output.md',
    );
  });

  it('emits every field it documents', async () => {
    const keys = new Set(Object.keys(await emitted()));
    assert.deepEqual(
      [...(await documented())].filter((key) => !keys.has(key)),
      [],
      'fields promised by docs/json-output.md and not emitted',
    );
  });
});
