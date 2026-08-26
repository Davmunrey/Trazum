import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it, after } from 'node:test';

import { BUNDLED_CATALOGUE } from '@trazum/core';
import { buildGateway, listenGateway, UPSTREAMS, forwards, route } from '../dist/gateway-server.js';

/**
 * The gateway in front of Google, where the model is in the URL.
 *
 * Every other provider Trazum fronts names its model in the request body, so
 * "the one path this gateway forwards" could be a literal string compared with
 * `!==`. Gemini's is `/v1beta/models/{model}:generateContent`, and that single
 * difference reaches everywhere: the path becomes a pattern, the model has to
 * be read out of it, and the outgoing URL stops being a constant.
 *
 * Each of those is a place a credential-forwarding proxy could be widened by
 * accident, so each is broken on purpose below rather than merely exercised.
 *
 * **Nothing here was recalled.** The host, the path, the `x-goog-api-key`
 * header and the `usageMetadata` counts are all facts this repository already
 * held — in `packages/core/src/llm.ts` and `packages/core/src/usage.ts` — and
 * the tests read them back rather than assert what a model remembers of
 * Google's API.
 */

const started = [];
after(() => {
  for (const server of started) server.close();
});

const upstream = (respond) => {
  const seen = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => {
      seen.push({ url: request.url, method: request.method, headers: request.headers });
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(respond ?? {
        candidates: [{ content: { parts: [{ text: 'hi' }] } }],
        usageMetadata: { promptTokenCount: 10_000, candidatesTokenCount: 400, cachedContentTokenCount: 9_000 },
      }));
    });
  });
  started.push(server);
  return { server, seen };
};

const gateway = async (over = {}, respond) => {
  const stub = upstream(respond);
  const stubUrl = await new Promise((resolve) => {
    stub.server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${stub.server.address().port}`));
  });

  const recorded = [];
  const notes = [];
  const server = buildGateway({
    provider: 'google',
    catalogue: BUNDLED_CATALOGUE,
    policy: { onCannotTell: 'fail-closed' },
    standing: () => ({ limitUsd: 100, consumedUsd: 1, provenance: 'measured', asOfMs: 0 }),
    record: (m) => recorded.push(m),
    note: (line) => notes.push(line),
    // Only the origin is rewritten, so the path under test is the one the
    // gateway actually built rather than one this harness supplied.
    fetchImpl: (url, init) =>
      fetch(String(url).replace(UPSTREAMS.google.origin, stubUrl), init),
    ...over,
  });
  started.push(server);
  const where = await listenGateway(server, { port: 0 });
  return { where, seen: stub.seen, recorded, notes };
};

const body = () =>
  JSON.stringify({
    systemInstruction: { parts: [{ text: 'be brief' }] },
    contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
    generationConfig: { maxOutputTokens: 256 },
  });

const post = (where, path) =>
  fetch(`${where}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': 'sk-caller-owns-this' },
    body: body(),
  });

const PATH = '/v1beta/models/gemini-2.5-pro:generateContent';

describe('the gateway forwards Gemini, and only Gemini', () => {
  it('forwards the one operation, rebuilding the URL rather than echoing it', async () => {
    const { where, seen } = await gateway();
    const answered = await post(where, PATH);

    assert.equal(answered.status, 200);
    assert.equal(seen.length, 1, 'the call did not reach the upstream');
    assert.equal(seen[0].url, PATH);
    assert.equal(seen[0].method, 'POST');
  });

  it('forwards the caller’s key in the header Google reads, untouched', async () => {
    /**
     * `x-goog-api-key`, not `?key=`. `llm.ts` made that choice when the Gemini
     * provider landed — Google's own examples put the credential in the query
     * string, which puts it in every proxy log and referrer between here and
     * there — and a gateway that moved it back into the URL would undo a
     * decision this repository already made deliberately.
     */
    const { where, seen } = await gateway();
    await post(where, PATH);

    assert.equal(seen[0].headers['x-goog-api-key'], 'sk-caller-owns-this');
    assert.doesNotMatch(seen[0].url, /key=/, "the caller's credential was moved into the URL");
  });

  it('reads the model out of the path, and prices the call with it', async () => {
    /**
     * Gemini's body carries no `model` field at all. Before this, `describe`
     * demanded one and the gateway answered 400 — so the honest failure was
     * available, and the wrong fix (forward it unpriced) was the tempting one.
     */
    const { where, recorded } = await gateway();
    await post(where, PATH);

    assert.equal(recorded.length, 1, 'the call was forwarded without being recorded');
    assert.equal(recorded[0].model, 'gemini-2.5-pro');
  });

  it('measures from usageMetadata, with the cached half subtracted', async () => {
    /**
     * `promptTokenCount` **includes** `cachedContentTokenCount`, which
     * `usage.ts` has known since the Gemini importer landed. Adding them would
     * put the period's total above the invoice; ignoring the cached count
     * would put fresh input above what was actually fresh. Both are wrong and
     * only one of them is in the flattering direction, which is why this is
     * asserted as an exact quadruple rather than a lower bound.
     */
    const { where, recorded } = await gateway();
    await post(where, PATH);

    assert.equal(recorded[0].inputTokens, 1_000);
    assert.equal(recorded[0].outputTokens, 400);
    assert.equal(recorded[0].cacheReadTokens, 9_000);
    assert.equal(recorded[0].cacheWriteTokens, 0);
  });

  it('records nothing rather than zero when the response carries no counts', async () => {
    const { where, recorded, notes } = await gateway({}, { candidates: [] });
    const answered = await post(where, PATH);

    assert.equal(answered.status, 200, 'a readable answer was withheld over an unreadable count');
    assert.deepEqual(recorded, [], 'a call whose counts never arrived was recorded as free');
    assert.ok(
      notes.some((n) => /unmeasured/.test(n)),
      `nothing said the call went unmeasured: ${JSON.stringify(notes)}`,
    );
  });
});

describe('and refuses every other shape of that URL', () => {
  /**
   * The pattern is the security boundary now, so it is broken rather than
   * described. Each of these is a real way a path pattern goes wrong, and the
   * gateway must reach **none** of them: a refusal here is a 404 with no
   * upstream connection at all, not an upstream error relayed back.
   */
  const hostile = [
    ['a query string smuggled past the model segment', '/v1beta/models/gemini-2.5-pro:generateContent?key=leaked'],
    ['traversal in the model segment', '/v1beta/models/../../v1/messages:generateContent'],
    ['a second segment where the model goes', '/v1beta/models/gemini-2.5-pro/anything:generateContent'],
    ['a different operation on the same model', '/v1beta/models/gemini-2.5-pro:streamGenerateContent'],
    ['the token counter, which spends nothing and reads nothing', '/v1beta/models/gemini-2.5-pro:countTokens'],
    ['anything appended after the operation', '/v1beta/models/gemini-2.5-pro:generateContentAndMore'],
    ['anything prepended before the version', '/proxy/v1beta/models/gemini-2.5-pro:generateContent'],
    ['another provider’s path, on this gateway', '/v1/messages'],
  ];

  for (const [what, path] of hostile) {
    it(`refuses ${what}`, async () => {
      const { where, seen } = await gateway();
      const answered = await post(where, path);

      assert.equal(answered.status, 404, `${path} was forwarded`);
      assert.equal(seen.length, 0, `${path} reached the upstream before being refused`);
    });
  }

  it('says what it does forward, so the refusal is not bare', async () => {
    const { where } = await gateway();
    const answered = await post(where, '/v1beta/models/gemini-2.5-pro:countTokens');
    const said = await answered.json();

    assert.equal(said.forwards, `POST ${forwards(UPSTREAMS.google)}`);
    assert.match(said.forwards, /generateContent/);
  });

  it('refuses a GET of the path it forwards', async () => {
    const { where, seen } = await gateway();
    const answered = await fetch(`${where}${PATH}`, { method: 'GET' });

    assert.equal(answered.status, 404);
    assert.equal(seen.length, 0);
  });
});

describe('route is the only thing that decides, and it decides the same way twice', () => {
  it('builds the outgoing path rather than returning what matched', () => {
    /**
     * The distinction the whole design rests on. `route` is handed a string
     * that satisfied the pattern and returns a path it **assembled** — so
     * whatever else that string contained cannot travel to the upstream, even
     * if a future pattern were loosened by accident.
     */
    const decided = route(UPSTREAMS.google, 'POST', PATH);
    assert.deepEqual(decided, { path: PATH, model: 'gemini-2.5-pro', spends: true });

    // A literal-path provider names no model; its body does.
    assert.deepEqual(route(UPSTREAMS.openai, 'POST', '/v1/chat/completions'), {
      path: '/v1/chat/completions',
      model: null,
      spends: true,
    });
    assert.equal(route(UPSTREAMS.openai, 'POST', '/v1/chat/completions?stream=1'), null);
  });

  it('refuses an absent URL rather than defaulting to the path it forwards', () => {
    assert.equal(route(UPSTREAMS.google, 'POST', undefined), null);
    assert.equal(route(UPSTREAMS.anthropic, 'POST', undefined), null);
  });
});
