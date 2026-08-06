import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  anthropicProvider,
  countTokensAnthropic,
  customProvider,
  openAiCompatible,
  optimize,
  providerFromEnv,
  refineWithLlm,
} from '../dist/index.js';

/** Fake provider: returns whatever we tell it to, without touching the network. */
function fakeProvider(reply) {
  return {
    name: 'fake',
    model: 'fake-1',
    async complete() {
      return typeof reply === 'function' ? reply() : reply;
    },
  };
}

const PROMPT = 'Please analyse the file {{path}} and read https://docs.example.com/guide.';

describe('optional LLM pass', () => {
  it('accepts a shorter candidate that keeps the protected content', async () => {
    const base = optimize(PROMPT);
    const shorter = 'Analyse {{path}} per https://docs.example.com/guide.';
    const result = await refineWithLlm(base, fakeProvider(shorter));

    assert.equal(result.llm.applied, true);
    assert.equal(result.optimized, shorter);
    assert.ok(result.tokensAfter < base.tokensAfter);
    // The saving is recomputed against the original prompt, not the intermediate one.
    assert.equal(result.tokensSaved, base.tokensBefore - result.tokensAfter);
  });

  it('rejects a candidate that alters a template placeholder', async () => {
    const base = optimize(PROMPT);
    const broken = 'Analyse {{the_path}} per https://docs.example.com/guide.';
    const result = await refineWithLlm(base, fakeProvider(broken));

    assert.equal(result.llm.applied, false);
    assert.match(result.llm.rejectedReason, /protected/i);
    assert.equal(result.optimized, base.optimized);
  });

  it('rejects a candidate that alters a URL', async () => {
    const base = optimize(PROMPT);
    const broken = 'Analyse {{path}} per https://docs.example.com/other-guide.';
    const result = await refineWithLlm(base, fakeProvider(broken));

    assert.equal(result.llm.applied, false);
    assert.equal(result.optimized, base.optimized);
  });

  it('rejects a candidate that is not shorter', async () => {
    const base = optimize(PROMPT);
    const longer = `${base.optimized} And also add a detailed explanation at the very end.`;
    const result = await refineWithLlm(base, fakeProvider(longer));

    assert.equal(result.llm.applied, false);
    assert.match(result.llm.rejectedReason, /not shorter/i);
  });

  it('rejects a summary dressed up as compression', async () => {
    const long = `Analyse {{path}} at https://docs.example.com/guide. ${'Relevant detail of the requirement. '.repeat(40)}`;
    const base = optimize(long);
    const summary = 'Analyse {{path}} at https://docs.example.com/guide.';
    const result = await refineWithLlm(base, fakeProvider(summary));

    assert.equal(result.llm.applied, false);
    assert.match(result.llm.rejectedReason, /summar/i);
  });

  it('rejects empty responses', async () => {
    const base = optimize(PROMPT);
    const result = await refineWithLlm(base, fakeProvider('   '));
    assert.equal(result.llm.applied, false);
    assert.match(result.llm.rejectedReason, /empty/i);
  });

  it('strips code fences when the model wraps its answer', async () => {
    const base = optimize(PROMPT);
    const wrapped = '```\nAnalyse {{path}} per https://docs.example.com/guide.\n```';
    const result = await refineWithLlm(base, fakeProvider(wrapped));

    assert.equal(result.llm.applied, true);
    assert.ok(!result.optimized.startsWith('```'));
  });

  it('reports the rejection in the requested locale', async () => {
    const base = optimize(PROMPT, { locale: 'es' });
    const result = await refineWithLlm(base, fakeProvider('   '));
    assert.equal(result.llm.applied, false);
    assert.match(result.llm.rejectedReason, /vacía/i);
  });
});

describe('configuration from the environment', () => {
  it('returns null when configuration is missing, instead of throwing', () => {
    assert.equal(providerFromEnv({}), null);
    assert.equal(providerFromEnv({ TRAZUM_LLM_BASE_URL: 'https://x' }), null);
    assert.equal(providerFromEnv({ TRAZUM_LLM_PROVIDER: 'anthropic' }), null);
  });

  it('builds an OpenAI-compatible provider', () => {
    const provider = providerFromEnv({
      TRAZUM_LLM_BASE_URL: 'https://llm.internal/v1',
      TRAZUM_LLM_MODEL: 'my-model',
      TRAZUM_LLM_API_KEY: 'k',
    });
    assert.ok(provider);
    assert.equal(provider.model, 'my-model');
  });

  it('builds an Anthropic provider', () => {
    const provider = providerFromEnv({
      TRAZUM_LLM_PROVIDER: 'anthropic',
      TRAZUM_LLM_API_KEY: 'k',
    });
    assert.ok(provider);
    assert.equal(provider.name, 'anthropic');
  });
});

describe('the request itself, not just the URL it was aimed at', () => {
  /**
   * Every check above this line reads the URL the caller named. None of them
   * survive a redirect, and `fetch` follows redirects by default.
   *
   * So the whole host filter — the metadata address, the RFC1918 ranges, the
   * `.internal` suffix, all of it — could be walked past by any endpoint that
   * passed validation and then answered
   * `302 Location: http://169.254.169.254/latest/meta-data/`. One HTTP
   * response. The `authorization` header goes along for the ride.
   *
   * This applies to the CLI pointed at a compromised gateway exactly as much
   * as to the deployed app, which is why it is fixed in the provider rather
   * than in the route.
   */
  const captureInit = () => {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url, init });
      return {
        ok: true,
        async json() {
          return { choices: [{ message: { content: 'short' } }], content: [{ type: 'text', text: 'short' }], input_tokens: 1 };
        },
      };
    };
    return { seen, fetchImpl };
  };

  it('refuses to follow a redirect on an OpenAI-compatible call', async () => {
    const { seen, fetchImpl } = captureInit();
    const provider = openAiCompatible({
      baseUrl: 'https://llm.example.com/v1',
      model: 'm',
      apiKey: 'k',
      fetchImpl,
    });
    await provider.complete({ system: 's', user: 'u' });

    assert.equal(seen[0].init.redirect, 'error');
  });

  it('refuses to follow one on the Claude call either', async () => {
    const { seen, fetchImpl } = captureInit();
    const provider = anthropicProvider({ apiKey: 'k', fetchImpl });
    await provider.complete({ system: 's', user: 'u' });

    assert.equal(seen[0].init.redirect, 'error');
  });

  it('and on the token counter, which sends the key to the same kind of host', async () => {
    const { seen, fetchImpl } = captureInit();
    await countTokensAnthropic({ apiKey: 'k', fetchImpl })('hello');

    assert.equal(seen[0].init.redirect, 'error');
  });

  it('sends no cookies and no referrer to an endpoint the caller named', async () => {
    const { seen, fetchImpl } = captureInit();
    const provider = openAiCompatible({
      baseUrl: 'https://llm.example.com/v1',
      model: 'm',
      fetchImpl,
    });
    await provider.complete({ system: 's', user: 'u' });

    assert.equal(seen[0].init.credentials, 'omit');
    assert.equal(seen[0].init.referrerPolicy, 'no-referrer');
  });

  it('lets a custom provider override the redirect, since it built the request', async () => {
    // The escape hatch exists for endpoints that speak nothing standard, and
    // one of those may genuinely need to follow a hop. It gets the safe default
    // without being trapped by it.
    const { seen, fetchImpl } = captureInit();
    const provider = customProvider({
      name: 'c',
      model: 'm',
      request: () => ({ url: 'https://x.example.com', init: { redirect: 'follow' } }),
      extract: () => 'x',
      fetchImpl,
    });
    await provider.complete({ system: 's', user: 'u' });

    assert.equal(seen[0].init.redirect, 'follow');
  });
});

describe('the token counter goes through the same door as the providers', () => {
  it('refuses a private host, having previously accepted anything', () => {
    // It takes a baseUrl and sends an x-api-key to it. Both providers were
    // hardened and this was left open, because it is called a counter.
    assert.throws(
      () => countTokensAnthropic({ apiKey: 'k', baseUrl: 'https://169.254.169.254' }),
      /private-host/,
    );
  });

  it('refuses http, and says which option would allow it', () => {
    assert.throws(
      () => countTokensAnthropic({ apiKey: 'k', baseUrl: 'http://llm.example.com' }),
      /insecure-scheme[\s\S]*allowInsecure/,
    );
  });

  it('still allows a local endpoint the operator chose', () => {
    assert.ok(
      countTokensAnthropic({
        apiKey: 'k',
        baseUrl: 'http://localhost:11434',
        allowInsecure: true,
      }),
    );
  });
});
