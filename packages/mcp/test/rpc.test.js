import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ERROR, PROTOCOL_VERSION, handle } from '../dist/rpc.js';
import { TOOLS } from '../dist/tools.js';

/**
 * The dispatch rules, tested as a pure function.
 *
 * `server.test.js` drives a real process, which is what proves the transport
 * works. This file exists because the protocol is now *this repository's code*
 * rather than the SDK's — the invariant against runtime dependencies won that
 * argument — and hand-written protocol handling is precisely where a subtle
 * mistake survives a happy-path test.
 */

const INFO = { name: 'trazum', version: '1.8.0', instructions: 'x' };
const call = (message) => handle(message, TOOLS, INFO);
const request = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });

describe('initialize', () => {
  it('echoes the version the client asked for', () => {
    // A client speaking a version this server has not heard of is better served
    // by being told what it asked for than by a refusal: every method here is
    // version-independent, so the alternative is failing to start over a string.
    const answer = call(request('initialize', { protocolVersion: '2099-01-01' }));
    assert.equal(answer.result.protocolVersion, '2099-01-01');
  });

  it('offers its own version when the client names none', () => {
    assert.equal(call(request('initialize', {})).result.protocolVersion, PROTOCOL_VERSION);
    assert.equal(call(request('initialize')).result.protocolVersion, PROTOCOL_VERSION);
  });

  it('declares only the capability it implements', () => {
    /**
     * Declaring a capability this server does not have is how a client comes to
     * ask for a resource and get an error it did not plan for.
     */
    const { capabilities } = call(request('initialize', {})).result;
    assert.deepEqual(Object.keys(capabilities), ['tools']);
  });

  it('survives a hostile protocolVersion instead of trusting its type', () => {
    for (const bad of [42, null, {}, [], true]) {
      const answer = call(request('initialize', { protocolVersion: bad }));
      assert.equal(answer.result.protocolVersion, PROTOCOL_VERSION, JSON.stringify(bad));
    }
  });
});

describe('notifications get no reply, ever', () => {
  it('for the ones this server knows', () => {
    assert.equal(call({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
    assert.equal(call({ jsonrpc: '2.0', method: 'notifications/cancelled' }), null);
  });

  it('and for the ones it does not', () => {
    /**
     * The rule is about the *absence of an id*, not about the method name. A
     * notification is by definition unanswerable, and replying to one is a
     * protocol violation some clients tolerate and others hang on — the worst
     * kind of bug to have, because it works in testing.
     */
    assert.equal(call({ jsonrpc: '2.0', method: 'notifications/somethingNew' }), null);
    assert.equal(call({ jsonrpc: '2.0', method: 'resources/list' }), null);
    assert.equal(call({ jsonrpc: '2.0', method: 'initialize', params: {} }), null);
  });

  it('but a request with a null id is answered, because null is an id', () => {
    // `{"id": null}` is a request with the id `null`, not a notification. The
    // difference is whether the key is present, and conflating them loses a reply.
    const answer = call({ jsonrpc: '2.0', id: null, method: 'ping' });
    assert.notEqual(answer, null);
    assert.equal(answer.id, null);
  });
});

describe('what it refuses', () => {
  it('a method it does not implement', () => {
    const answer = call(request('resources/list', {}));
    assert.equal(answer.error.code, ERROR.methodNotFound);
    assert.match(answer.error.message, /tools only/);
  });

  it('a message that is not an object', () => {
    for (const bad of [null, 'string', 42, undefined]) {
      const answer = call(bad);
      assert.equal(answer.error.code, ERROR.invalidRequest, JSON.stringify(bad));
    }
  });

  it('the wrong jsonrpc version', () => {
    const answer = call({ jsonrpc: '1.0', id: 1, method: 'ping' });
    assert.equal(answer.error.code, ERROR.invalidRequest);
  });

  it('a non-string method', () => {
    assert.equal(call({ jsonrpc: '2.0', id: 1, method: 7 }).error.code, ERROR.invalidRequest);
  });

  it('a tool that does not exist', () => {
    const answer = call(request('tools/call', { name: 'rm_rf', arguments: {} }));
    assert.equal(answer.error.code, ERROR.invalidParams);
    assert.match(answer.error.message, /unknown tool: rm_rf/);
  });

  it('a tools/call with no name', () => {
    assert.equal(
      call(request('tools/call', { arguments: {} })).error.code,
      ERROR.invalidParams,
    );
  });
});

describe('a tool failure is a result, not a protocol error', () => {
  /**
   * The distinction is the whole point of `isError`. A protocol error says the
   * client is broken; `isError` says the model asked for something it should ask
   * differently — and the model is the party that has to read the message. A
   * JSON-RPC error here would hide the explanation from the only one able to act.
   */
  it('bad arguments come back as content the model can read', () => {
    const answer = call(request('tools/call', { name: 'check_prompt', arguments: { prompt: 'x' } }));
    assert.equal(answer.error, undefined, 'a bad argument became a protocol error');
    assert.equal(answer.result.isError, true);
    assert.match(answer.result.content[0].text, /maxTokens is required/);
  });

  it('and so does an oversized prompt, with the size in it', () => {
    const answer = call(
      request('tools/call', {
        name: 'optimize_prompt',
        arguments: { prompt: 'a'.repeat(400_001) },
      }),
    );
    assert.equal(answer.result.isError, true);
    assert.match(answer.result.content[0].text, /400001 characters, over the 400000 limit/);
  });

  it('missing arguments are treated as empty rather than crashing', () => {
    const answer = call(request('tools/call', { name: 'list_models' }));
    assert.equal(answer.result.isError, undefined);
    assert.match(answer.result.content[0].text, /prices reviewed/);
  });
});

describe('tools/list', () => {
  it('describes every tool with a schema a client can validate against', () => {
    const { tools } = call(request('tools/list', {})).result;
    assert.equal(tools.length, 4);
    for (const tool of tools) {
      assert.ok(tool.name && tool.title && tool.description, `${tool.name} is under-described`);
      assert.equal(tool.inputSchema.type, 'object');
      // No extra keys accepted: a client that sends a typo should be told, not
      // silently given a default.
      assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    }
  });

  it('marks prompt and maxTokens required, since neither has a sane default', () => {
    const { tools } = call(request('tools/list', {})).result;
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    assert.deepEqual(byName.get('optimize_prompt').inputSchema.required, ['prompt']);
    assert.deepEqual(byName.get('check_prompt').inputSchema.required, ['prompt', 'maxTokens']);
    assert.deepEqual(byName.get('profile_usage').inputSchema.required, ['log']);
  });
});

describe('numeric arguments are bounded on both ends', () => {
  const runCheck = (args) =>
    call(request('tools/call', { name: 'optimize_prompt', arguments: args }));

  it('refuses a call count that would produce an Infinity in somebody budget', () => {
    /**
     * Bounded above, not only below. `callsPerMonth: 1e308` multiplied through the
     * cost model gives Infinity, which is worse than a refusal because it looks
     * like an answer.
     */
    const answer = runCheck({ prompt: 'Please be brief.', callsPerMonth: 1e308 });
    assert.equal(answer.result.isError, true);
    assert.match(answer.result.content[0].text, /must be an integer|must be between/);
  });

  it('refuses a non-integer and a negative', () => {
    for (const calls of [1.5, -1, 0, Number.NaN]) {
      const answer = runCheck({ prompt: 'Please be brief.', callsPerMonth: calls });
      assert.equal(answer.result.isError, true, String(calls));
    }
  });

  it('refuses a level it does not know', () => {
    const answer = runCheck({ prompt: 'Please be brief.', level: 'brutal' });
    assert.equal(answer.result.isError, true);
    assert.match(answer.result.content[0].text, /"safe" or "aggressive"/);
  });
});
