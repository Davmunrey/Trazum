import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  heliconeRecords,
  looksLikeHelicone,
  profileUsage,
} from '../dist/index.js';

/**
 * Helicone's request export, read as a usage log.
 *
 * The columns here are the SELECT that builds Helicone's own request table,
 * `web/lib/api/request/request.ts` in Helicone/helicone — including the three
 * that can disagree about the model and the two this converter must refuse to
 * touch. A fixture written from memory of an API would prove the converter
 * agrees with the memory.
 */

/** Text no record may carry, distinctive enough that a substring hit is real. */
const SECRET = 'ACME-CONFIDENTIAL-Q3-PRICING';

const row = (over = {}) => ({
  request_id: 'req-1',
  request_created_at: '2026-08-01T10:00:00.000Z',
  response_created_at: '2026-08-01T10:00:03.000Z',
  request_model: 'claude-opus-5',
  model_override: null,
  response_model: 'claude-opus-5',
  prompt_tokens: 1200,
  completion_tokens: 100,
  total_tokens: 1300,
  request_properties: { 'Helicone-Property-Label': 'support' },
  // An email address in Helicone's own documented example.
  request_user_id: `person-${SECRET}@example.com`,
  // The prompt and the completion, on the row.
  request_body: { messages: [{ role: 'user', content: `Summarise ${SECRET}` }] },
  response_body: { choices: [{ message: { content: `About ${SECRET}` } }] },
  signed_body_url: `https://assets.invalid/${SECRET}`,
  cache_enabled: 0,
  ...over,
});

describe('reading a Helicone request export', () => {
  it('converts the columns a bill is made of', () => {
    const out = heliconeRecords(JSON.stringify([row()]));
    assert.equal(out.rows, 1);
    assert.deepEqual(out.records, [
      {
        model: 'claude-opus-5',
        ts: '2026-08-01T10:00:00.000Z',
        label: 'support',
        usage: { input_tokens: 1200, output_tokens: 100 },
      },
    ]);
  });

  it('carries no prompt, no completion, no person and no asset url', () => {
    const out = heliconeRecords(JSON.stringify([row()]));
    assert.ok(
      !JSON.stringify(out).includes(SECRET),
      'the conversion carried text out of the row',
    );
    // And the measurement survives, so this is not passing by emptiness.
    assert.equal(out.records[0].usage.input_tokens, 1200);
    assert.equal(out.records[0].model, 'claude-opus-5');
  });

  it('prices the model that answered, not the one that was asked for', () => {
    /**
     * The reason Helicone needs three columns where the others need one. A
     * proxy that substituted a model billed for the model that answered, so
     * that is what a bill prices; taking the requested one would report the
     * intention and call it the cost.
     */
    const out = heliconeRecords(
      JSON.stringify([row({ request_model: 'claude-opus-5', response_model: 'claude-haiku-4-5' })]),
    );
    assert.equal(out.records[0].model, 'claude-haiku-4-5');
    assert.equal(out.modelDisagreements, 1, 'a substitution happened and nothing said so');
  });

  it('counts no disagreement when the two agree', () => {
    assert.equal(heliconeRecords(JSON.stringify([row()])).modelDisagreements, 0);
  });

  it('falls back to the override, then the request, and counts a row with none', () => {
    const override = heliconeRecords(
      JSON.stringify([row({ response_model: null, model_override: 'claude-sonnet-5' })]),
    );
    assert.equal(override.records[0].model, 'claude-sonnet-5');

    const requested = heliconeRecords(
      JSON.stringify([row({ response_model: null, model_override: null })]),
    );
    assert.equal(requested.records[0].model, 'claude-opus-5');

    const none = heliconeRecords(
      JSON.stringify([
        row({ response_model: null, model_override: null, request_model: null }),
        row(),
      ]),
    );
    assert.equal(none.rows, 2);
    assert.equal(none.records.length, 1);
    assert.equal(none.unnamedModel, 1, 'a row with no model was dropped without being counted');
  });

  it('reads the four shapes an export actually arrives in', () => {
    const one = row();
    assert.equal(heliconeRecords(JSON.stringify([one, row({ request_id: 'r2' })])).rows, 2);
    assert.equal(heliconeRecords(JSON.stringify(one)).rows, 1);
    assert.equal(heliconeRecords(JSON.stringify({ data: [one] })).rows, 1);
    assert.equal(
      heliconeRecords(`${JSON.stringify(one)}\n${JSON.stringify(row({ request_id: 'r3' }))}\n`).rows,
      2,
    );
  });

  it('counts a cached row and invents no token split for it', () => {
    const out = heliconeRecords(JSON.stringify([row({ cache_enabled: 1 }), row()]));
    assert.equal(out.cacheFlagged, 1);
    for (const record of out.records) {
      assert.deepEqual(Object.keys(record.usage).sort(), ['input_tokens', 'output_tokens']);
    }
  });

  it('carries no session, because a request id is one call and not a conversation', () => {
    /**
     * Stated rather than filled in. Trazum's conversation findings need an
     * identity that spans calls, and Helicone's row has none — so they stay
     * unavailable instead of being answered from a per-call id, which would
     * report every call as a conversation of one.
     */
    const out = heliconeRecords(JSON.stringify([row()]));
    assert.ok(!('session' in out.records[0]), 'a request id was passed off as a conversation');
  });

  it('takes one label and never joins several', () => {
    const out = heliconeRecords(
      JSON.stringify([row({ request_properties: { label: 'rag', app: 'search', environment: 'prod' } })]),
    );
    assert.equal(out.records[0].label, 'rag');

    const none = heliconeRecords(JSON.stringify([row({ request_properties: {} })]));
    assert.equal(none.records[0].label, undefined, 'a label nobody set must not be invented');
  });

  it('skips a row that is not a request at all, and counts a line that will not parse', () => {
    const out = heliconeRecords(
      JSON.stringify([{ request_id: 'x', request_created_at: '2026-08-01T00:00:00Z' }, row()]),
    );
    assert.equal(out.rows, 1);

    const broken = heliconeRecords(`${JSON.stringify(row())}\nnot json at all\n`);
    assert.equal(broken.unparseable, 1);
    assert.equal(broken.rows, 1);
  });

  it('counts a logged request with no tokens rather than hiding it', () => {
    const out = heliconeRecords(JSON.stringify([row({ prompt_tokens: 0, completion_tokens: 0 })]));
    assert.equal(out.noTokens, 1);
    assert.equal(out.rows, 1);
  });

  it('prices what it converted, through the ordinary profile path', () => {
    const out = heliconeRecords(
      JSON.stringify([
        row({ prompt_tokens: 1_000_000, completion_tokens: 50_000 }),
        row({
          request_id: 'r2',
          request_model: 'claude-haiku-4-5',
          response_model: 'claude-haiku-4-5',
          prompt_tokens: 2_000_000,
          completion_tokens: 10_000,
          request_properties: { label: 'classify' },
        }),
      ]),
    );
    const log = out.records.map((record) => JSON.stringify(record)).join('\n');
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    assert.equal(report.total.calls, 2);
    assert.ok(report.total.totalUsd > 0);
    assert.deepEqual(report.byLabel.map((entry) => entry.label).sort(), ['classify', 'support']);
  });
});

describe('telling a Helicone export from everything else', () => {
  it('recognises one', () => {
    assert.equal(looksLikeHelicone(JSON.stringify([row()])), true);
  });

  it('does not claim a LiteLLM spend log or an OpenAI usage response', () => {
    /**
     * Both also carry `prompt_tokens`, and both have code that can read them.
     * A detector loose enough to claim either would take somebody's export
     * away from the converter that understands it and refuse it in this
     * file's words.
     */
    const litellm = JSON.stringify([
      { request_id: 'r', prompt_tokens: 10, completion_tokens: 1, model_group: 'route', custom_llm_provider: 'anthropic' },
    ]);
    const openai = JSON.stringify({
      data: [{ n_context_tokens_total: 100, prompt_tokens: 100, snapshot_id: 'gpt-4' }],
    });
    assert.equal(looksLikeHelicone(litellm), false);
    assert.equal(looksLikeHelicone(openai), false);
  });

  it('does not claim a plain usage log, an OTel export, or an empty file', () => {
    assert.equal(looksLikeHelicone('{"model":"claude-opus-5","usage":{"input_tokens":10}}'), false);
    assert.equal(looksLikeHelicone('{"resourceSpans":[]}'), false);
    assert.equal(looksLikeHelicone(''), false);
  });
});
