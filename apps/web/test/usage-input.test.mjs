import assert from 'node:assert/strict';
import { register } from 'node:module';
import { before, describe, it } from 'node:test';

/**
 * `usage` checked at the door of both pricing routes.
 *
 * Before this, `/api/optimize` and `/api/compare` priced whatever arrived:
 * negative calls, a cache hit rate of 7, a string where a count goes. Each
 * came back `200` with figures shaped like an answer. These send the
 * impossible values for real and hold that both routes refuse them, in the
 * same words, naming the field.
 */

register('./helpers/loader.mjs', import.meta.url);

let optimize;
let compare;
let parseUsage;

before(async () => {
  delete process.env.TRAZUM_LLM_BASE_URL;
  ({ POST: optimize } = await import('../app/api/optimize/route.ts'));
  ({ POST: compare } = await import('../app/api/compare/route.ts'));
  ({ parseUsage } = await import('../lib/usage-input.ts'));
});

const PROMPT = 'Classify the ticket. Answer with the category only.';

async function send(route, path, body) {
  const response = await route(
    new Request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

const both = (usage) => [
  ['optimize', () => send(optimize, '/api/optimize', { prompt: PROMPT, usage })],
  ['compare', () => send(compare, '/api/compare', { before: PROMPT, after: `${PROMPT} Thanks.`, usage })],
];

describe('an impossible value is refused, not priced', () => {
  const cases = [
    [{ callsPerMonth: -500 }, /usage\.callsPerMonth" must be a number of calls, 0 or more/],
    [{ callsPerMonth: 1e15 }, /usage\.callsPerMonth/],
    [{ callsPerMonth: 'lots' }, /usage\.callsPerMonth/],
    [{ cacheHitRate: 7 }, /usage\.cacheHitRate" must be a fraction from 0 to 1/],
    [{ cacheHitRate: -0.1 }, /usage\.cacheHitRate/],
    [{ avgOutputTokens: -1 }, /usage\.avgOutputTokens" must be a number of tokens/],
    [{ batchEligible: 'yes' }, /usage\.batchEligible" must be true or false/],
    [{ model: 42 }, /usage\.model" must be a model id/],
  ];
  for (const [usage, message] of cases) {
    for (const [name, call] of both(usage)) {
      it(`${name} refuses ${JSON.stringify(usage)}`, async () => {
        const { status, body } = await call();
        assert.equal(status, 400, `${name} priced ${JSON.stringify(usage)}`);
        assert.match(body.error, message);
      });
    }
  }
});

describe('a misspelt field is named, not defaulted', () => {
  for (const [name, call] of both({ calls_per_month: 1000 })) {
    it(`${name} names calls_per_month and lists the real fields`, async () => {
      const { status, body } = await call();
      assert.equal(status, 400);
      assert.match(body.error, /"usage\.calls_per_month" is not a field/);
      assert.match(body.error, /callsPerMonth/);
    });
  }

  for (const [name, call] of both([1, 2])) {
    it(`${name} refuses a usage that is not an object`, async () => {
      const { status, body } = await call();
      assert.equal(status, 400);
      assert.match(body.error, /"usage" must be an object/);
    });
  }
});

describe('what was always accepted still is', () => {
  for (const [name, call] of both({
    model: 'claude-opus-5',
    callsPerMonth: 50_000,
    avgOutputTokens: 300,
    cacheHitRate: 0.6,
    batchEligible: true,
  })) {
    it(`${name} prices a full, valid usage`, async () => {
      const { status } = await call();
      assert.equal(status, 200);
    });
  }

  for (const [name, call] of both(undefined)) {
    it(`${name} prices with no usage at all`, async () => {
      assert.equal((await call()).status, 200);
    });
  }

  it('reorders without a model named, rather than answering 502 Unknown model', async () => {
    const { status, body } = await send(optimize, '/api/optimize', {
      prompt: 'Today is 2026-10-11.\n\nYou are a support agent. Answer briefly.',
      reorder: true,
    });
    assert.equal(status, 200, body.error);
    assert.ok(body.reorder, 'the rearrangement that was asked for is missing');
  });

  it('reads an explicit null as the field left out', () => {
    assert.deepEqual(parseUsage({ model: 'claude-opus-5', cacheHitRate: null }), {
      ok: true,
      usage: { model: 'claude-opus-5' },
    });
  });

  it('speaks Spanish when asked', async () => {
    const response = await optimize(
      new Request('http://localhost/api/optimize', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept-language': 'es' },
        body: JSON.stringify({ prompt: PROMPT, usage: { cacheHitRate: 7 }, locale: 'es' }),
      }),
    );
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.match(body.error, /debe ser una fracción de 0 a 1/);
  });
});
