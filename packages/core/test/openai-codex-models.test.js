import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  codexRecords,
  effectivePricing,
  isOffered,
  multipliersFor,
  profileUsage,
} from '../dist/index.js';

/**
 * The Codex models and chat-latest, from OpenAI's own pages.
 *
 * developers.openai.com/api/docs/models/<id>.md for each, and the pricing
 * page's "Specialized models" table for gpt-5.3-codex and chat-latest, read
 * 2026-11-05. Codex CLI sessions name these models and none was priced, so a
 * Codex bill read every such call as unpriced. Every page says the Batch
 * endpoint is "Not supported".
 */

const ON = new Date('2026-11-01T10:00:00Z');
const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

// id: [input, output, cached input, context window]
const PUBLISHED = {
  'gpt-5.3-codex': [1.75, 14, 0.175, 400_000],
  'gpt-5.2-codex': [1.75, 14, 0.175, 400_000],
  'gpt-5.1-codex': [1.25, 10, 0.125, 400_000],
  'gpt-5.1-codex-max': [1.25, 10, 0.125, 400_000],
  'gpt-5.1-codex-mini': [0.25, 2, 0.025, 400_000],
  'gpt-5-codex': [1.25, 10, 0.125, 400_000],
  'codex-mini-latest': [1.5, 6, 0.375, 200_000],
  'chat-latest': [5, 30, 0.5, 400_000],
};

describe('the Codex models and chat-latest, priced from their own pages', () => {
  for (const [id, [input, output, cached, context]] of Object.entries(PUBLISHED)) {
    it(`${id}: ${input}/${output}, cached ${cached}, ${context.toLocaleString('en-US')} context, no batch`, () => {
      const model = BUNDLED_CATALOGUE.byId.get(id);
      assert.ok(model, `${id} is not in the catalogue`);
      assert.equal(model.provider, 'openai');
      const rates = effectivePricing(model, ON, { inputTokens: 1000 });
      close(rates.inputPerMTok, input, `${id} input`);
      close(rates.outputPerMTok, output, `${id} output`);
      const m = multipliersFor(model, ON);
      close(rates.inputPerMTok * m.cacheRead, cached, `${id} cached input`);
      assert.equal(m.batch, null, `${id} has a batch price its page does not publish`);
      assert.equal(model.contextWindow, context);
    });
  }

  it('recommends none: deprecated, shut down, or an alias that moves with ChatGPT', () => {
    for (const id of Object.keys(PUBLISHED)) {
      assert.equal(isOffered(BUNDLED_CATALOGUE.byId.get(id)), false, `${id} is offered`);
    }
  });

  it('bills a Codex CLI session on gpt-5.3-codex in full', () => {
    const rows = [
      { type: 'session_meta', payload: { id: 'synthetic-session', cwd: '/synthetic' } },
      { type: 'turn_context', payload: { model: 'gpt-5.3-codex' } },
      {
        timestamp: '2026-11-01T10:00:00Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: { input_tokens: 1_000_000, cached_input_tokens: 400_000, output_tokens: 100_000, reasoning_output_tokens: 0, total_tokens: 1_100_000 },
            last_token_usage: { input_tokens: 1_000_000, cached_input_tokens: 400_000, output_tokens: 100_000, reasoning_output_tokens: 0, total_tokens: 1_100_000 },
            model_context_window: 400_000,
          },
        },
      },
    ];
    const { records } = codexRecords(rows.map((row) => JSON.stringify(row)).join('\n'));
    assert.equal(records.length, 1);
    const report = profileUsage(records.map((record) => JSON.stringify(record)).join('\n'), { catalogue: BUNDLED_CATALOGUE });
    // 600,000 uncached at $1.75, 400,000 cached at $0.175, 100,000 output at $14.
    close(report.total.totalUsd, 0.6 * 1.75 + 0.4 * 0.175 + 0.1 * 14, 'a Codex session');
    assert.deepEqual(report.unpricedModels, []);
  });
});
