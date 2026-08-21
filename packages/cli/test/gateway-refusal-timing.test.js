import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, it } from 'node:test';

import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildGateway, listenGateway } from '../dist/gateway-server.js';

/**
 * A refusal arrives before the first byte, or not at all.
 *
 * The third chapter of the 1.52 arc. Once bytes are flowing the caller has
 * already started rendering, and a 402 arriving mid-stream is worse than no
 * gate: the status line is long gone, so the refusal cannot even be *sent* as a
 * refusal — it would arrive as garbage inside somebody's answer.
 *
 * The ordering is already right. These tests exist so it cannot quietly invert,
 * and they assert the property rather than the line numbers: the first by
 * proving the upstream is never contacted at all on a refusal, the second by
 * exhausting the budget **while a stream is in flight** and proving the caller
 * still receives the whole answer.
 */

const started = [];
after(() => {
  for (const server of started) server.close();
});

/** An upstream that streams on a leash, and counts how often it was opened. */
const leashedUpstream = () => {
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let opened = 0;
  const server = createServer((request, response) => {
    opened += 1;
    request.resume();
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: {"message":{"usage":{"input_tokens":10,"output_tokens":0}}}\n\n');
      held.then(() => {
        response.end('data: {"usage":{"output_tokens":7}}\n\n');
      });
    });
  });
  started.push(server);
  return { server, release: () => release(), openings: () => opened };
};

const gatewayOver = async (stub, standing) => {
  const stubUrl = await new Promise((resolve) => {
    stub.server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${stub.server.address().port}`));
  });
  let reached = 0;
  const recorded = [];
  const server = buildGateway({
    provider: 'anthropic',
    catalogue: BUNDLED_CATALOGUE,
    policy: { onCannotTell: 'fail-closed' },
    standing,
    record: (m) => recorded.push(m),
    note: () => {},
    fetchImpl: (url, init) => {
      reached += 1;
      return fetch(`${stubUrl}/v1/messages`, init);
    },
    ...(stub.over ?? {}),
  });
  started.push(server);
  const where = await listenGateway(server, { port: 0 });
  return { where, recorded, reached: () => reached };
};

const body = JSON.stringify({
  model: 'claude-opus-5',
  stream: true,
  messages: [{ role: 'user', content: 'hello' }],
});

describe('a refusal happens before the upstream is opened', () => {
  it('never contacts the provider on a refusal', async () => {
    /**
     * The status code is the weaker half of this. The property worth asserting
     * is that **the caller's prompt never left the machine**: a gateway that
     * refused after forwarding would have spent the money it was refusing, and
     * sent the text somewhere while claiming to stand in front of it.
     */
    const stub = leashedUpstream();
    const { where, reached } = await gatewayOver(stub, () => ({
      limitUsd: 1,
      consumedUsd: 1000,
      provenance: 'measured',
      asOfMs: 0,
    }));

    const response = await fetch(`${where}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    assert.equal(response.status, 402);
    const refusal = await response.json();
    assert.equal(refusal.error.type, 'trazum_budget_refusal');

    assert.equal(reached(), 0, 'the gateway called the upstream on a call it refused');
    assert.equal(stub.openings(), 0, 'the upstream saw a connection for a refused call');
  });

  it('cannot inject a refusal into a stream already in flight', async () => {
    /**
     * The budget is read once, before the upstream is opened. This exhausts it
     * **after** the first event has reached the caller and proves the answer
     * still arrives whole at 200.
     *
     * A gateway that consulted the budget per chunk would fail here — and it
     * would fail in production by corrupting an answer somebody was reading.
     */
    const stub = leashedUpstream();
    let consumed = 1;
    const { where } = await gatewayOver(stub, () => ({
      limitUsd: 100,
      consumedUsd: consumed,
      provenance: 'measured',
      asOfMs: 0,
    }));

    const response = await fetch(`${where}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    assert.equal(response.status, 200);

    const reader = response.body.getReader();
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /message/);

    // The budget is now spent, several times over, mid-answer.
    consumed = 100_000;

    stub.release();
    let rest = '';
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      rest += new TextDecoder().decode(next.value);
    }

    assert.match(rest, /output_tokens/, 'the rest of the answer did not arrive');
    assert.doesNotMatch(rest, /trazum_budget_refusal/, 'a refusal was spliced into a live stream');
  });
});
