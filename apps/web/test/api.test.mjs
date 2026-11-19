import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { register } from 'node:module';
import { after, before, describe, it } from 'node:test';

/**
 * The route handler, called for real.
 *
 * Every other test in this directory reads source and asserts on the text of it,
 * which is honest about what it can see and cannot see this: `applySuggestions`
 * without `suggest` returned `200`, a complete report, and silently did not
 * apply anything. Nothing about the source looked wrong — the field parsed, the
 * guard around it was correct, and the branch that would have used it was never
 * entered. It took sending the request.
 *
 * So this file sends requests. `next/server` is redirected to a stub (see
 * `helpers/loader.mjs`); the core, the rules and both i18n catalogues are the
 * real ones.
 */

register('./helpers/loader.mjs', import.meta.url);

/** Suggestions the fake model always returns: one real, one that is not there. */
const SUGGESTIONS = [
  { before: 'You should always make sure to', after: 'Always' },
  { before: 'a phrase that is not in the prompt at all', after: 'nope' },
];

const PROMPT = 'You should always make sure to answer in English.';

let server;
let endpoint;
/** Every request the fake model received, so a test can assert none arrived. */
let calls = 0;
/** The `model` of each request the fake model received. */
const models = [];
let POST;
let GET;

before(async () => {
  server = createServer((req, res) => {
    calls++;
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try { models.push(JSON.parse(Buffer.concat(chunks).toString('utf8')).model); } catch { models.push(null); }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify(SUGGESTIONS) } }] }),
      );
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${server.address().port}/v1`;

  /**
   * The fake model is configured on the server, not named in the request, and
   * that is not a shortcut — it is the only door a loopback address has.
   * `allowedEndpoints` drops any entry that would fail validation and offers no
   * `allowInsecure`, so `http://127.0.0.1` cannot be made selectable by a
   * caller however the operator lists it. `TRAZUM_LLM_BASE_URL` is trusted
   * because the operator configured their own machine, which is the documented
   * Ollama-on-localhost case.
   *
   * So these tests take the same path a real deployment does: the server has a
   * provider, and the request asks for work rather than for a host.
   */
  process.env.TRAZUM_LLM_BASE_URL = endpoint;
  process.env.TRAZUM_LLM_MODEL = 'fake';
  /**
   * **Set on purpose, and now inert.**
   *
   * This variable is what the hole was made of: the route read it and served a
   * caller who had brought no key. It stays set so these tests run against the
   * configuration that used to be dangerous rather than a tidy one where the
   * question cannot arise, and the two guards below assert it is never spent.
   */
  process.env.TRAZUM_LLM_API_KEY = 'test-key';
  delete process.env.TRAZUM_ALLOWED_LLM_ENDPOINTS;
  delete process.env.TRAZUM_ALLOWED_LLM_MODELS;

  ({ POST, GET } = await import('../app/api/optimize/route.ts'));
});

after(() => server?.close());

/**
 * The caller's own key, which the model-assisted path now requires.
 *
 * The endpoint and the model still come from the operator's environment, which
 * is the documented Ollama-on-localhost case. The credential is the part that
 * is never lent, and the model is the part a stranger does not choose: see the
 * test that names a model on the operator's endpoint.
 */
const CALLER_KEY = { apiKey: 'the-callers-own-key' };

/** One request, with the fields under test and nothing else. */
async function post(body, headers = {}) {
  const response = await POST(
    new Request('http://localhost/api/optimize', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

describe('a request field that cannot be honoured is refused, not ignored', () => {
  it('refuses applySuggestions without suggest', async () => {
    const { status, body } = await post({ prompt: PROMPT, applySuggestions: true });

    assert.equal(status, 400, 'the request succeeded and applied nothing');
    assert.match(body.error, /applySuggestions/);
    assert.match(body.error, /suggest/);
  });

  it('refuses it before calling the model', async () => {
    // The order is the point, not an implementation detail: a validation failure
    // that has already spent a paid API call is a worse answer than a slow one.
    // `llm.enabled` is what makes this a real assertion — that request *would*
    // have called the model, so the count staying put means the refusal came
    // first rather than there being nothing to call.
    const before = calls;
    const { status } = await post({
      prompt: PROMPT,
      applySuggestions: true,
      llm: { enabled: true },
    });

    assert.equal(status, 400);
    assert.equal(calls, before, 'the model was called for a request that was then refused');
  });

  it('answers in the language the caller asked in', async () => {
    const { body } = await post({ prompt: PROMPT, applySuggestions: true, locale: 'es' });

    assert.match(body.error, /no tiene nada que aplicar/);
  });

  it('refuses a string where true or false goes, rather than reading it either way', async () => {
    // `"false"` used to be read as asking for nothing, and `"true"` as not
    // asking either. Both were guesses about a caller with a bug; the body's
    // schema now says which field is wrong instead.
    for (const value of ['false', 'true', 1, 'yes']) {
      const { status, body } = await post({ prompt: PROMPT, applySuggestions: value });
      assert.equal(status, 400, String(value));
      assert.match(body.error, /"applySuggestions" must be true or false/);
    }
  });
});

describe('suggestions over HTTP', () => {
  it('returns them without touching the prompt', async () => {
    const { status, body } = await post({ prompt: PROMPT, suggest: true, llm: CALLER_KEY });

    assert.equal(status, 200);
    assert.equal(body.suggestions.applied, false);
    assert.equal(body.suggestions.suggestions.length, 1, 'the invented phrase was not rejected');
    assert.deepEqual(
      body.suggestions.rejected.map((r) => r.reason),
      ['not-found'],
    );
    assert.equal(body.optimized, PROMPT, 'the prompt changed without applySuggestions');
  });

  it('applies them when asked, and the saving follows', async () => {
    const { body } = await post({
      prompt: PROMPT,
      suggest: true,
      applySuggestions: true,
      llm: CALLER_KEY,
    });

    assert.equal(body.suggestions.applied, true);
    assert.equal(body.optimized, 'Always answer in English.');
    assert.ok(
      body.tokensAfter < body.tokensBefore,
      `${body.tokensBefore} → ${body.tokensAfter}: the count did not follow the rewrite`,
    );
    assert.equal(body.tokensSaved, body.tokensBefore - body.tokensAfter);
  });

  it('does not apply them for a string that merely looks like a boolean, nor call the model', async () => {
    // The rewrite comes from a model. Being non-empty is not consent, and a
    // refusal that arrives after the model was paid for is a refusal too late.
    const before = calls;
    const { status, body } = await post({
      prompt: PROMPT,
      suggest: true,
      applySuggestions: 'true',
      llm: CALLER_KEY,
    });

    assert.equal(status, 400);
    assert.match(body.error, /applySuggestions/);
    assert.equal(calls, before, 'the model was called for a body that was refused');
  });

  it('never spends the operator\u2019s key on a caller who brought none', async () => {
    /**
     * The hole, planted as the configuration that had it.
     *
     * `TRAZUM_LLM_API_KEY` is set in this file's setup, so a deployment in
     * exactly this state used to serve `{"suggest": true}` from a stranger and
     * bill the operator: no account, no session, nothing to attribute it to,
     * and a rate limiter in front of it keyed on a header the caller controls.
     *
     * `calls` is asserted beside the status, because a 400 that arrives after
     * the model was called is a refusal too late to matter.
     */
    const before = calls;
    const { status, body } = await post({ prompt: PROMPT, suggest: true });

    assert.equal(status, 400, 'a keyless request was served');
    assert.match(body.error, /your own API key/i);
    assert.equal(calls, before, 'the model was called before the refusal');
  });

  it('refuses the refining pass on the same terms', async () => {
    // Two doors into the same room: `suggest` and `llm.enabled`. Closing one
    // and leaving the other is how this kind of fix is usually half-made.
    const before = calls;
    const { status } = await post({ prompt: PROMPT, llm: { enabled: true } });

    assert.equal(status, 400, 'a keyless refining request was served');
    assert.equal(calls, before, 'the model was called before the refusal');
  });

  it('does not let a caller pick the model on the operator\u2019s own endpoint', async () => {
    /**
     * The hole: `TRAZUM_LLM_BASE_URL` pointed at a server that checks no key
     * (Ollama), `apiKey: "x"` to get past the route's key check, and
     * `llm.model` to run any model the operator had pulled. Planted as the
     * configuration that had it: the fake endpoint here checks no key either.
     *
     * The model that reaches the endpoint is asserted, not the status, because
     * the request still succeeds. It is served with the operator's model.
     */
    delete process.env.TRAZUM_ALLOWED_LLM_MODELS;
    const before = models.length;
    const { status } = await post({
      prompt: PROMPT,
      suggest: true,
      llm: { apiKey: 'x', model: 'any-model-the-operator-pulled' },
    });

    assert.equal(status, 200);
    assert.deepEqual(models.slice(before), ['fake'], 'the caller chose the model on the operator\u2019s endpoint');
  });

  it('lets a caller pick only a model the operator listed on that endpoint', async () => {
    process.env.TRAZUM_ALLOWED_LLM_MODELS = 'small-one, listed-two';
    try {
      const before = models.length;
      await post({ prompt: PROMPT, suggest: true, llm: { ...CALLER_KEY, model: 'listed-two' } });
      await post({ prompt: PROMPT, suggest: true, llm: { ...CALLER_KEY, model: 'unlisted' } });
      assert.deepEqual(models.slice(before), ['listed-two', 'fake']);
    } finally {
      delete process.env.TRAZUM_ALLOWED_LLM_MODELS;
    }
  });

  it('will not fetch an endpoint the caller names', async () => {
    // The default posture, and the one the SSRF fix turned on: with no allowlist
    // configured there is nothing to select, so a body that names a host is
    // refused outright rather than validated and then called. Note the server
    // *does* have a working provider at this point — the refusal is about who
    // chose the endpoint, not about whether one exists.
    const before = calls;
    const { status, body } = await post({
      prompt: PROMPT,
      suggest: true,
      llm: { baseUrl: 'https://example.invalid/v1', model: 'whatever' },
    });

    assert.equal(status, 400);
    assert.match(body.error, /does not call endpoints chosen by the caller/);
    assert.equal(calls, before, 'a caller-named endpoint reached the network');
  });
});

describe('the models the page is offered', () => {
  it('carry `capability` and not the `tier` 3.0.0 removed', async () => {
    // `GET /api/optimize` hands the catalogue to the page as JSON, a document
    // that carries every model whole. `tier` left a model in 3.0.0 (#764), and
    // this is where it would come back into a document somebody reads.
    const response = await GET(new Request('http://localhost/api/optimize'));
    assert.equal(response.status, 200);
    const { models } = await response.json();
    assert.ok(models.length > 0, 'no models, so nothing was checked');
    for (const model of models) {
      assert.equal('tier' in model, false, `${model.id} carries \`tier\` in GET /api/optimize`);
      assert.ok(model.capability, `${model.id} has no capability`);
    }
  });
});

describe('the capability a recommendation names', () => {
  it('is `small`, `mid` or `large` in the advisory POST /api/optimize returns', async () => {
    // `recommendTier` answered `haiku`, `sonnet` or `opus` until 3.0.0, and the
    // answer reaches the page as the `detail` of the `model-downgrade` advisory.
    // The page and any caller read it from this response.
    const usage = { model: 'claude-opus-5', callsPerMonth: 50_000, avgOutputTokens: 300, batchEligible: false };
    for (const locale of ['en', 'es']) {
      const { status, body } = await post({ prompt: 'Translate this sentence into English.', usage, locale });
      assert.equal(status, 200);
      const downgrade = body.advisories.find((advisory) => advisory.id === 'model-downgrade');
      assert.ok(downgrade, `${locale}: no model-downgrade advisory, so nothing was checked`);
      assert.ok(downgrade.detail.includes('"small"'), `${locale}: the advisory does not quote "small": ${downgrade.detail}`);
      assert.doesNotMatch(JSON.stringify(body), /\\?["“](haiku|sonnet|opus)\\?["”]/i, `${locale}: an old name is still in the response`);
    }
  });
});
