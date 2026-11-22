import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_PROVIDER_ERROR_CHARS, PROVIDER_TIMEOUT_MS, ProviderError, openAiCompatible } from '../dist/index.js';

/**
 * A provider's error is read only as far as it is repeated, and a model call
 * does not wait for ever (penetration test of 2026-11-22, finding L-2).
 */

/** A body of `chunks` 64 KB pieces that counts how many were read. */
const hugeBody = (chunks) => {
  let pulled = 0;
  const piece = new TextEncoder().encode('e'.repeat(65_536));
  const stream = new ReadableStream({
    pull(controller) {
      if (pulled >= chunks) return controller.close();
      pulled += 1;
      controller.enqueue(piece);
    },
  });
  return { stream, pulled: () => pulled };
};

describe('a provider that answers with an error', () => {
  it('is a ProviderError with the status and no more of the body than is repeated', async () => {
    const body = hugeBody(3_200); // 200 MB if read to the end
    const provider = openAiCompatible({
      baseUrl: 'https://llm.example.com/v1',
      model: 'm',
      fetchImpl: async () => new Response(body.stream, { status: 500 }),
    });
    const error = await provider.complete({ system: 's', user: 'u' }).catch((e) => e);
    assert.ok(error instanceof ProviderError, String(error));
    assert.equal(error.status, 500);
    assert.ok(error.detail.length <= MAX_PROVIDER_ERROR_CHARS, `detail of ${error.detail.length} characters`);
    assert.ok(body.pulled() <= 3, `${body.pulled()} pieces of the body were read`);
  });
});

describe('a model call', () => {
  it('carries a time limit', async () => {
    let signal;
    const provider = openAiCompatible({
      baseUrl: 'https://llm.example.com/v1',
      model: 'm',
      fetchImpl: async (_url, init) => {
        signal = init.signal;
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }));
      },
    });
    await provider.complete({ system: 's', user: 'u' });
    assert.ok(signal instanceof AbortSignal, 'the call was made with no signal');
    assert.ok(PROVIDER_TIMEOUT_MS > 0 && PROVIDER_TIMEOUT_MS <= 300_000);
  });
});
