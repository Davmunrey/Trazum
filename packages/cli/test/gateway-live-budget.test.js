import assert from 'node:assert/strict';
import { it } from 'node:test';
import { BUNDLED_CATALOGUE } from '@trazum/core';
import { GatewaySpend } from '../dist/gateway-spend.js';
import { buildGateway, listenGateway } from '../dist/gateway-server.js';

const body = JSON.stringify({
  model: 'claude-opus-5', max_tokens: 1,
  messages: [{ role: 'user', content: 'synthetic test' }],
});
const answer = () => new Response(JSON.stringify({
  usage: { input_tokens: 200_000, output_tokens: 0 },
}), { headers: { 'content-type': 'application/json' } });

async function setup(t, overrides = {}) {
  let calls = 0;
  const server = buildGateway({
    provider: 'anthropic', catalogue: BUNDLED_CATALOGUE,
    policy: { onCannotTell: 'fail-closed' },
    liveBudget: true,
    standing: () => ({ limitUsd: 1, consumedUsd: 0, provenance: 'measured', asOfMs: Date.now() }),
    record: () => {}, note: () => {},
    fetchImpl: async () => { calls++; return answer(); },
    ...overrides,
  });
  const url = await listenGateway(server, { port: 0 });
  t.after(() => { server.closeAllConnections(); server.close(); });
  return {
    post: (request = body) => fetch(`${url}/v1/messages`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: request,
    }),
    calls: () => calls,
  };
}

it('charges completed calls before admitting the next call', async (t) => {
  const g = await setup(t);
  assert.equal((await g.post()).status, 200);
  const refused = await g.post();
  assert.equal(refused.status, 402);
  assert.equal(g.calls(), 1);
  assert.equal((await refused.json()).standing.consumedUsd, 1);
});

it('updates session limits from completed calls', async (t) => {
  const g = await setup(t, {
    standing: () => ({ limitUsd: 100, consumedUsd: 0, provenance: 'measured', asOfMs: Date.now() }),
    limits: { sessionUsd: 1 },
    position: () => ({ dayUsd: 0, sessionUsd: 0, labelUsd: 0 }),
  });
  const request = JSON.stringify({ ...JSON.parse(body), metadata: { trazum_session: 'synthetic-session' } });
  assert.equal((await g.post(request)).status, 200);
  assert.equal((await g.post(request)).status, 402);
});

it('does not treat successful responses without usage as zero spend', async (t) => {
  const g = await setup(t, { fetchImpl: async () => new Response('{}') });
  assert.equal((await g.post()).status, 200);
  assert.equal((await g.post()).status, 402);
});

it('reserves in-flight estimates without counting them as measured spend', async (t) => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered;
  const opened = new Promise((resolve) => { entered = resolve; });
  t.after(() => release());
  const g = await setup(t, {
    fetchImpl: async () => { entered(); await held; return answer(); },
  });
  // Output alone reserves $0.75, so only one such call can fit a $1 budget.
  const request = JSON.stringify({ ...JSON.parse(body), max_tokens: 30_000 });
  const first = g.post(request);
  await opened;
  const second = await g.post(request);
  assert.equal(second.status, 402);
  const refusal = await second.json();
  assert.equal(refusal.reason, 'budget-reserved');
  assert.equal(refusal.standing.consumedUsd, 0);
  assert.ok(refusal.reservedUsd >= 0.75);
  release();
  assert.equal((await first).status, 200);
});

it('releases reservations after an explicit non-billable upstream error', async (t) => {
  let attempts = 0;
  const g = await setup(t, {
    fetchImpl: async () => ++attempts === 1 ? new Response('{}', { status: 400 }) : answer(),
  });
  const request = JSON.stringify({ ...JSON.parse(body), max_tokens: 30_000 });
  assert.equal((await g.post(request)).status, 400);
  assert.equal((await g.post(request)).status, 200);
});

it('honors fail-open after an unmeasured response', async (t) => {
  const g = await setup(t, {
    policy: { onCannotTell: 'fail-open' }, fetchImpl: async () => new Response('{}'),
  });
  assert.equal((await g.post()).status, 200);
  assert.equal((await g.post()).status, 200);
});

it('keeps different sessions separate', async (t) => {
  const g = await setup(t, {
    standing: () => ({ limitUsd: 100, consumedUsd: 0, provenance: 'measured', asOfMs: Date.now() }),
    limits: { sessionUsd: 1 },
    position: () => ({ dayUsd: 0, sessionUsd: 0, labelUsd: 0 }),
  });
  const request = (session) => JSON.stringify({ ...JSON.parse(body), metadata: { trazum_session: session } });
  assert.equal((await g.post(request('synthetic-a'))).status, 200);
  assert.equal((await g.post(request('synthetic-b'))).status, 200);
  assert.equal((await g.post(request('synthetic-a'))).status, 402);
});

it('prices cache writes at the TTL reported by the provider', async (t) => {
  const g = await setup(t, { fetchImpl: async () => new Response(JSON.stringify({ usage: {
    input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 100_000,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100_000 },
  } })) });
  assert.equal((await g.post()).status, 200);
  const second = await g.post();
  assert.equal(second.status, 402);
  assert.equal((await second.json()).standing.consumedUsd, 1);
});

it('counts cache reads at the discounted rate', async (t) => {
  const g = await setup(t, { fetchImpl: async () => new Response(JSON.stringify({ usage: {
    input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 200_000,
  } })) });
  assert.equal((await g.post()).status, 200);
  assert.equal((await g.post()).status, 200);
  // $0.20 measured + $0.875 requested output cannot fit.
  const second = await g.post(JSON.stringify({ ...JSON.parse(body), max_tokens: 35_000 }));
  assert.equal(second.status, 402);
  assert.equal((await second.json()).standing.consumedUsd, 0.2);
});

it('makes a transport failure unknown instead of refunding possible spend', async (t) => {
  let attempts = 0;
  const g = await setup(t, { fetchImpl: async () => { attempts++; throw new Error('synthetic failure'); } });
  assert.equal((await g.post()).status, 502);
  assert.equal((await g.post()).status, 402);
  assert.equal(attempts, 1);
});

it('preserves explicit substitution past the monthly cap and prices the target', async (t) => {
  let recorded;
  const g = await setup(t, {
    standing: () => ({ limitUsd: 1, consumedUsd: 2, provenance: 'measured', asOfMs: Date.now() }),
    policy: { onCannotTell: 'fail-closed', substitute: {
      'claude-opus-5': { to: 'claude-haiku-4-5', reason: 'Synthetic configured fallback' },
    } },
    record: (usage) => { recorded = usage; },
    fetchImpl: async (_url, init) => {
      assert.equal(JSON.parse(init.body).model, 'claude-haiku-4-5');
      return answer();
    },
  });
  assert.equal((await g.post()).status, 200);
  assert.equal(recorded.model, 'claude-haiku-4-5');
  assert.equal((await g.post()).status, 200);
});

it('treats cache writes without a TTL as unknown', async (t) => {
  const g = await setup(t, { fetchImpl: async () => new Response(JSON.stringify({ usage: {
    input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 100,
  } })) });
  assert.equal((await g.post()).status, 200);
  assert.equal((await g.post()).status, 402);
});

it('settles streamed usage before the next admission without changing the stream', async (t) => {
  const events = 'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":200000,"output_tokens":0}}}\n\n' +
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":0}}\n\n' +
    'event: message_stop\ndata: {"type":"message_stop"}\n\n';
  const g = await setup(t, { fetchImpl: async () => new Response(events, {
    headers: { 'content-type': 'text/event-stream' },
  }) });
  assert.equal(await (await g.post()).text(), events);
  const refused = await g.post();
  assert.equal(refused.status, 402);
  assert.equal((await refused.json()).standing.consumedUsd, 1);
});

for (const [name, usage] of [
  ['partial input-only usage', { input_tokens: 0 }],
  ['partial output-only usage', { output_tokens: 0 }],
  ['invalid cache counts', { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 'invalid' }],
]) {
  it(`marks ${name} unknown for the next fail-closed admission`, async (t) => {
    const g = await setup(t, { fetchImpl: async () => new Response(JSON.stringify({ usage })) });
    assert.equal((await g.post()).status, 200);
    assert.equal((await g.post()).status, 402);
  });
}

it('does not settle a cleanly truncated Anthropic stream as complete usage', async (t) => {
  const events = 'data: {"type":"message_start","message":{"usage":{"input_tokens":0,"output_tokens":0}}}\n\n';
  const g = await setup(t, { fetchImpl: async () => new Response(events, {
    headers: { 'content-type': 'text/event-stream' },
  }) });
  assert.equal(await (await g.post()).text(), events);
  assert.equal((await g.post()).status, 402);
});


it('refuses the first unbounded call before it reaches the provider', async (t) => {
  const g = await setup(t);
  const request = JSON.parse(body);
  delete request.max_tokens;
  const response = await g.post(JSON.stringify(request));
  assert.equal(response.status, 402);
  assert.equal((await response.json()).cause, 'output-unbounded');
  assert.equal(g.calls(), 0);
});

it('preserves fail-open for an unbounded call', async (t) => {
  const g = await setup(t, { policy: { onCannotTell: 'fail-open' } });
  const request = JSON.parse(body);
  delete request.max_tokens;
  assert.equal((await g.post(JSON.stringify(request))).status, 200);
  assert.equal(g.calls(), 1);
});

it('reservation admission independently refuses a missing output bound', () => {
  const spend = new GatewaySpend(BUNDLED_CATALOGUE);
  const call = { provider: 'anthropic', model: 'claude-opus-5', inputTokens: 1, maxOutputTokens: null, label: null, session: null };
  const decision = { kind: 'forward', estimatedUsd: 0.001, unjudged: null, policy: { judgements: [] } };
  const standing = { limitUsd: 1, consumedUsd: 0, provenance: 'measured', asOfMs: Date.now() };
  assert.equal(spend.reserve(call, decision, standing, true).refusal.reason, 'call-unbounded');
  assert.ok(spend.reserve(call, decision, standing, false).ticket);
});

for (const status of [408, 500, 502, 503, 504]) {
  it(`does not refund unknown provider work after HTTP ${status}`, async (t) => {
    let attempts = 0;
    const g = await setup(t, {
      fetchImpl: async () => { attempts++; return new Response('{}', { status }); },
    });
    assert.equal((await g.post()).status, status);
    assert.equal((await g.post()).status, 402);
    assert.equal(attempts, 1);
  });
}

it('preserves fail-open after an unmeasured server error', async (t) => {
  let attempts = 0;
  const g = await setup(t, {
    policy: { onCannotTell: 'fail-open' },
    fetchImpl: async () => { attempts++; return new Response('{}', { status: 500 }); },
  });
  assert.equal((await g.post()).status, 500);
  assert.equal((await g.post()).status, 500);
  assert.equal(attempts, 2);
});
