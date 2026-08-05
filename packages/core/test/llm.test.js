import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { optimize, refineWithLlm, providerFromEnv } from '../dist/index.js';

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
