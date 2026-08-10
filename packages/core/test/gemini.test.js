import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { geminiProvider, providerFromEnv } from '../dist/index.js';

/**
 * Gemini, which is the one provider on the list that needs its own function.
 *
 * Everything else people asked for — Groq, Together, Fireworks, DeepInfra,
 * Cerebras, SiliconFlow, OpenRouter, LiteLLM — speaks the OpenAI shape, so
 * `openAiCompatibleProvider` with a base URL is the whole integration. Google's
 * is a different document, and more importantly it has three failure modes that
 * arrive as **HTTP 200**. Those are what most of this file is about: a provider
 * that only checks `res.ok` treats all three as success.
 */

/** A fetch that records the request and returns a fixed body. */
function fake(body, { status = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  return { fetchImpl, calls };
}

const ok = (text, extra = {}) => ({
  candidates: [{ content: { parts: [{ text }] }, ...extra }],
});

describe('the request it builds', () => {
  it('sends the system prompt as systemInstruction, not as a turn', async () => {
    // The whole reason this is not the OpenAI path. Sent as a message, Gemini
    // treats the instructions as something the user said, which is a different
    // request from the one every other provider gets.
    const { fetchImpl, calls } = fake(ok('done'));
    await geminiProvider({ apiKey: 'k', fetchImpl }).complete({ system: 'be terse', user: 'hello' });

    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.systemInstruction, { parts: [{ text: 'be terse' }] });
    assert.deepEqual(body.contents, [{ role: 'user', parts: [{ text: 'hello' }] }]);
  });

  it('puts the key in a header, never in the query string', async () => {
    /**
     * Google's own examples use `?key=…`, which writes a live credential into
     * every proxy log, access log and `Referer` between here and there. A URL
     * is not a secret-carrying medium.
     */
    const { fetchImpl, calls } = fake(ok('done'));
    await geminiProvider({ apiKey: 'super-secret', fetchImpl }).complete({ system: 's', user: 'u' });

    assert.ok(!calls[0].url.includes('super-secret'), `the key is in the URL: ${calls[0].url}`);
    assert.equal(calls[0].init.headers['x-goog-api-key'], 'super-secret');
  });

  it('escapes the model name into the path', async () => {
    // The model is caller-supplied and lands in a URL path segment.
    const { fetchImpl, calls } = fake(ok('done'));
    await geminiProvider({ apiKey: 'k', model: 'weird/../model', fetchImpl }).complete({
      system: 's',
      user: 'u',
    });

    assert.ok(!calls[0].url.includes('/../'), `path traversal reached the URL: ${calls[0].url}`);
  });

  it('refuses an endpoint that is not one, before any request', async () => {
    // The same door every other provider goes through. Checked at construction
    // so a provider that can never work fails where it is built.
    assert.throws(
      () => geminiProvider({ apiKey: 'k', baseUrl: 'https://169.254.169.254' }),
      /private-host/,
    );
  });
});

describe('the three failures that arrive as 200', () => {
  it('a blocked prompt is an error, not an empty answer', async () => {
    // `promptFeedback.blockReason` comes back with no candidates at all, so
    // reading `candidates[0]` gives undefined and the caller is told "no text"
    // for what is actually a refusal.
    const { fetchImpl } = fake({ promptFeedback: { blockReason: 'SAFETY' } });
    await assert.rejects(
      () => geminiProvider({ apiKey: 'k', fetchImpl }).complete({ system: 's', user: 'u' }),
      /blocked the prompt \(SAFETY\)/,
    );
  });

  it('a truncated answer is an error, not a shorter answer', async () => {
    /**
     * `finishReason: MAX_TOKENS` returns 200 with half a result.
     *
     * For a rewrite pass this is the worst possible outcome — worse than an
     * HTTP error, because the text looks like an answer. Everything in this
     * package exists to avoid handing somebody a prompt that was silently
     * changed into something else.
     */
    const { fetchImpl } = fake(ok('half a rewri', { finishReason: 'MAX_TOKENS' }));
    await assert.rejects(
      () => geminiProvider({ apiKey: 'k', fetchImpl }).complete({ system: 's', user: 'u' }),
      /stopped at the token limit/,
    );
  });

  it('a candidate with no text is an error', async () => {
    const { fetchImpl } = fake({ candidates: [{ content: { parts: [] } }] });
    await assert.rejects(
      () => geminiProvider({ apiKey: 'k', fetchImpl }).complete({ system: 's', user: 'u' }),
      /no text in the candidate/,
    );
  });

  it('a candidate stopped for safety is an error', async () => {
    const { fetchImpl } = fake(ok('', { finishReason: 'SAFETY' }));
    await assert.rejects(
      () => geminiProvider({ apiKey: 'k', fetchImpl }).complete({ system: 's', user: 'u' }),
      /declined the request \(SAFETY\)/,
    );
  });

  it('but a normal answer comes back whole', async () => {
    // The other side, so none of the above can be satisfied by refusing
    // everything. Multiple parts are joined: a long answer arrives split.
    const { fetchImpl } = fake({
      candidates: [{ content: { parts: [{ text: 'one ' }, { text: 'two' }] }, finishReason: 'STOP' }],
    });
    const text = await geminiProvider({ apiKey: 'k', fetchImpl }).complete({ system: 's', user: 'u' });
    assert.equal(text, 'one two');
  });

  it('and an HTTP error still says the status', async () => {
    const { fetchImpl } = fake({ error: 'nope' }, { status: 429 });
    await assert.rejects(
      () => geminiProvider({ apiKey: 'k', fetchImpl }).complete({ system: 's', user: 'u' }),
      /responded 429/,
    );
  });
});

describe('choosing it from the environment', () => {
  it('is reachable by name, under either spelling', () => {
    for (const kind of ['gemini', 'google', 'GEMINI']) {
      const provider = providerFromEnv({ TRAZUM_LLM_PROVIDER: kind, TRAZUM_LLM_API_KEY: 'k' });
      assert.equal(provider?.name, 'gemini', kind);
    }
  });

  it('needs only a key, because the endpoint and model have defaults', () => {
    assert.equal(providerFromEnv({ TRAZUM_LLM_PROVIDER: 'gemini' }), null);
    assert.ok(providerFromEnv({ TRAZUM_LLM_PROVIDER: 'gemini', TRAZUM_LLM_API_KEY: 'k' }));
  });

  it('does not steal the default, which is still OpenAI-compatible', () => {
    // The path that covers every aggregator and open-weight host. If adding
    // Gemini had changed the default, most users would have been switched to a
    // provider they never configured.
    const provider = providerFromEnv({
      TRAZUM_LLM_BASE_URL: 'https://openrouter.ai/api/v1',
      TRAZUM_LLM_MODEL: 'meta-llama/llama-4',
      TRAZUM_LLM_API_KEY: 'k',
    });
    assert.notEqual(provider?.name, 'gemini');
    assert.equal(provider?.model, 'meta-llama/llama-4');
  });
});
