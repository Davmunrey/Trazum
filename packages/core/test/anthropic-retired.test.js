import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  claudeCodeRecords,
  effectivePricing,
  isOffered,
  multipliersFor,
  profileUsage,
} from '../dist/index.js';

/**
 * The retired Claude models still on Anthropic's pricing page.
 *
 * platform.claude.com/docs/en/about-claude/pricing, model-deprecations,
 * build-with-claude/context-windows and build-with-claude/prompt-caching,
 * read 2026-11-05 in their Markdown form. Opus 4.1, Opus 4, Sonnet 4 and
 * Haiku 3.5 are retired on the Claude API and still served elsewhere; a log
 * from before their retirement carries them, and without a row each of those
 * calls read as unpriced. Their model pages are gone, so the context window is
 * the context-windows page's "Other Claude models ... have a 200k-token
 * context window".
 */

const ON = new Date('2026-05-01T10:00:00Z');
const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

// id: [input, output, 5m write, 1h write, cache hit, batch input, batch output, cache minimum]
const PUBLISHED = {
  'claude-opus-4-1-20250805': [15, 75, 18.75, 30, 1.5, 7.5, 37.5, 1024],
  'claude-opus-4-20250514': [15, 75, 18.75, 30, 1.5, 7.5, 37.5, 1024],
  'claude-sonnet-4-20250514': [3, 15, 3.75, 6, 0.3, 1.5, 7.5, 1024],
  'claude-3-5-haiku-20241022': [0.8, 4, 1, 1.6, 0.08, 0.4, 2, 2048],
};

describe('the retired Claude models, priced from the pricing page', () => {
  for (const [id, [input, output, write5m, write1h, hit, batchIn, batchOut, minimum]] of Object.entries(PUBLISHED)) {
    it(`${id}: ${input}/${output}, writes ${write5m}/${write1h}, hits ${hit}, batch ${batchIn}/${batchOut}`, () => {
      const model = BUNDLED_CATALOGUE.byId.get(id);
      assert.ok(model, `${id} is not in the catalogue`);
      assert.equal(model.provider, 'anthropic');
      const rates = effectivePricing(model, ON, { inputTokens: 1000 });
      close(rates.inputPerMTok, input, `${id} input`);
      close(rates.outputPerMTok, output, `${id} output`);
      const m = multipliersFor(model, ON);
      close(input * m.cacheWrite5m, write5m, `${id} 5-minute write`);
      close(input * m.cacheWrite1h, write1h, `${id} 1-hour write`);
      close(input * m.cacheRead, hit, `${id} cache hit`);
      close(input * m.batch, batchIn, `${id} batch input`);
      close(output * m.batch, batchOut, `${id} batch output`);
      assert.equal(model.contextWindow, 200_000);
      assert.equal(model.cacheMinTokens, minimum);
    });
  }

  it('never recommends a retired model', () => {
    for (const id of Object.keys(PUBLISHED)) {
      assert.equal(isOffered(BUNDLED_CATALOGUE.byId.get(id)), false, `${id} is offered`);
    }
  });

  it('leaves unpriced the retired models the pricing page no longer lists', () => {
    for (const id of ['claude-3-7-sonnet-20250219', 'claude-3-haiku-20240307']) {
      assert.equal(BUNDLED_CATALOGUE.byId.get(id), undefined, `${id} was priced without a published price`);
    }
  });

  it('bills a Claude Code session from before the retirement in full', () => {
    const line = (id, model) => JSON.stringify({
      type: 'assistant', timestamp: '2026-05-01T10:00:00Z', sessionId: 's', requestId: `r-${id}`,
      message: {
        id: `m-${id}`, model, content: [],
        usage: { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000 },
      },
    });
    const transcript = [
      line('a', 'claude-opus-4-1-20250805'),
      line('b', 'claude-sonnet-4-20250514'),
    ].join('\n');
    const records = claudeCodeRecords(transcript).records;
    const report = profileUsage(records.map((record) => JSON.stringify(record)).join('\n'), { catalogue: BUNDLED_CATALOGUE });
    // Opus 4.1: $15 + $7.50 + $1.50. Sonnet 4: $3 + $1.50 + $0.30.
    close(report.total.totalUsd, (15 + 7.5 + 1.5) + (3 + 1.5 + 0.3), 'two retired-model calls');
    assert.deepEqual(report.unpricedModels, [], 'a retired model read as unpriced');
  });
});
