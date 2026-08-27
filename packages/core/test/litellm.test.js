import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  litellmRecords,
  looksLikeLiteLlm,
  profileUsage,
} from '../dist/index.js';

/**
 * LiteLLM's spend log, read as a usage log.
 *
 * The shape here is not invented: every field is `LiteLLM_SpendLogs` from
 * `litellm/proxy/schema.prisma` in BerriAI/litellm, including the four this
 * converter must refuse to touch. A fixture written from memory of an API
 * would prove the converter agrees with the memory.
 */

/** Text no record may carry, distinctive enough that a substring hit is real. */
const SECRET = 'ACME-CONFIDENTIAL-Q3-PRICING';

const row = (over = {}) => ({
  request_id: 'req-1',
  call_type: 'acompletion',
  // Hashed by LiteLLM, and still credential-shaped. Never read.
  api_key: `sk-hash-${SECRET}`,
  spend: 0.0421,
  total_tokens: 1300,
  prompt_tokens: 1200,
  completion_tokens: 100,
  startTime: '2026-08-01T10:00:00.000Z',
  endTime: '2026-08-01T10:00:03.000Z',
  model: 'claude-opus-5',
  model_group: 'opus-route',
  custom_llm_provider: 'anthropic',
  api_base: 'https://api.anthropic.com',
  user: `person-${SECRET}@example.com`,
  metadata: { tags: ['support'] },
  cache_hit: '',
  cache_key: '',
  request_tags: ['support'],
  team_id: 'team-1',
  end_user: `end-${SECRET}`,
  requester_ip_address: '203.0.113.9',
  // The prompt and the completion, on every single row.
  messages: [{ role: 'user', content: `Summarise ${SECRET}` }],
  response: { choices: [{ message: { content: `About ${SECRET}` } }] },
  session_id: 'sess-a',
  status: 'success',
  ...over,
});

describe('reading a LiteLLM spend log', () => {
  it('converts the columns a bill is made of', () => {
    const out = litellmRecords(JSON.stringify([row()]));
    assert.equal(out.rows, 1);
    assert.deepEqual(out.records, [
      {
        model: 'claude-opus-5',
        ts: '2026-08-01T10:00:00.000Z',
        label: 'support',
        session: 'sess-a',
        usage: { input_tokens: 1200, output_tokens: 100 },
      },
    ]);
  });

  it('carries no prompt, no completion, no key, no address and no person', () => {
    /**
     * The guard this converter exists under. Every one of these is a real
     * column on a real LiteLLM row, and a converter that took the whole
     * object and deleted a few fields would leak the next one they add.
     * This takes the fields it names and nothing else.
     */
    const out = litellmRecords(JSON.stringify([row()]));
    const serialised = JSON.stringify(out);
    assert.ok(!serialised.includes(SECRET), 'the conversion carried text out of the row');
    assert.ok(!serialised.includes('203.0.113.9'), 'the conversion carried the requester address');
    assert.ok(!serialised.includes('api.anthropic.com'), 'the conversion carried the endpoint');
    // And the measurement survives, so this is not passing by emptiness.
    assert.equal(out.records[0].usage.input_tokens, 1200);
  });

  it('reads the four shapes an export actually arrives in', () => {
    const one = row();
    const array = litellmRecords(JSON.stringify([one, row({ request_id: 'req-2' })]));
    const single = litellmRecords(JSON.stringify(one));
    const wrapped = litellmRecords(JSON.stringify({ data: [one] }));
    const ndjson = litellmRecords(`${JSON.stringify(one)}\n${JSON.stringify(row({ request_id: 'r3' }))}\n`);
    assert.equal(array.rows, 2);
    assert.equal(single.rows, 1);
    assert.equal(wrapped.rows, 1);
    assert.equal(ndjson.rows, 2);
  });

  it('counts a row naming no model rather than guessing one from the route', () => {
    /**
     * `model_group` is the public name of a proxy route and several models can
     * sit behind one. Pricing a call by the route it took would be a figure
     * attributed to something it does not describe, which is the fault this
     * repository keeps finding in itself.
     */
    const out = litellmRecords(JSON.stringify([row({ model: '' }), row()]));
    assert.equal(out.rows, 2);
    assert.equal(out.records.length, 1);
    assert.equal(out.unnamedModel, 1, 'a row with no model was dropped without being counted');
  });

  it('keeps LiteLLM’s own spend apart from anything Trazum computes', () => {
    /**
     * Two price tables, two figures. Merging them into one total is how a
     * report becomes quietly wrong, so the gateway's arithmetic is returned
     * on its own and never enters a record.
     */
    const out = litellmRecords(JSON.stringify([row(), row({ spend: 0.1 })]));
    assert.equal(out.reportedSpendUsd, 0.1421);
    for (const record of out.records) {
      assert.ok(!('spend' in record), 'the gateway’s own figure entered a usage record');
      assert.ok(!('usd' in record));
    }
  });

  it('reports no spend as an absence, never as zero', () => {
    const out = litellmRecords(JSON.stringify([row({ spend: undefined })]));
    assert.equal(out.reportedSpendUsd, null, 'a total nobody reported is not a total of nothing');
  });

  it('counts a cache hit and invents no token split for it', () => {
    /**
     * `cache_hit` is a flag; there is no cache_read or cache_creation count
     * anywhere on the row. The count exists so the gap is visible, and the
     * record carries no cache fields at all rather than a guessed split.
     */
    const out = litellmRecords(JSON.stringify([row({ cache_hit: 'true' }), row()]));
    assert.equal(out.cacheFlagged, 1);
    for (const record of out.records) {
      assert.deepEqual(Object.keys(record.usage).sort(), ['input_tokens', 'output_tokens']);
    }
  });

  it('takes the tag from the column, then the metadata, then the route', () => {
    const fromColumn = litellmRecords(JSON.stringify([row({ request_tags: ['billing'] })]));
    assert.equal(fromColumn.records[0].label, 'billing');

    const fromMetadata = litellmRecords(
      JSON.stringify([row({ request_tags: [], metadata: { tags: ['rag'] } })]),
    );
    assert.equal(fromMetadata.records[0].label, 'rag');

    const fromRoute = litellmRecords(
      JSON.stringify([row({ request_tags: [], metadata: {}, model_group: 'fast-lane' })]),
    );
    assert.equal(fromRoute.records[0].label, 'fast-lane');

    const none = litellmRecords(
      JSON.stringify([row({ request_tags: [], metadata: {}, model_group: '' })]),
    );
    assert.equal(none.records[0].label, undefined, 'a label nobody set must not be invented');
  });

  it('joins no tags together, because a workload has one name in a bill', () => {
    const out = litellmRecords(JSON.stringify([row({ request_tags: ['support', 'eu', 'v2'] })]));
    assert.equal(out.records[0].label, 'support');
  });

  it('skips a row that is not a call at all, rather than recording a zero', () => {
    const out = litellmRecords(
      JSON.stringify([{ request_id: 'x', call_type: 'health_check' }, row()]),
    );
    assert.equal(out.rows, 1);
    assert.equal(out.records.length, 1);
  });

  it('counts a logged call with no tokens rather than hiding it', () => {
    const out = litellmRecords(JSON.stringify([row({ prompt_tokens: 0, completion_tokens: 0 })]));
    assert.equal(out.noTokens, 1);
    assert.equal(out.rows, 1);
  });

  it('counts a line that will not parse', () => {
    const out = litellmRecords(`${JSON.stringify(row())}\nnot json at all\n`);
    assert.equal(out.unparseable, 1);
    assert.equal(out.rows, 1);
  });

  it('prices what it converted, through the ordinary profile path', () => {
    /**
     * The point of a converter: the records go through the same reader every
     * other door uses, with nothing special about their provenance.
     */
    const out = litellmRecords(
      JSON.stringify([
        row({ prompt_tokens: 1_000_000, completion_tokens: 50_000 }),
        row({ request_id: 'r2', model: 'claude-haiku-4-5', prompt_tokens: 2_000_000, completion_tokens: 10_000, request_tags: ['classify'] }),
      ]),
    );
    const log = out.records.map((record) => JSON.stringify(record)).join('\n');
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    assert.equal(report.total.calls, 2);
    assert.ok(report.total.totalUsd > 0);
    assert.deepEqual(report.byLabel.map((entry) => entry.label).sort(), ['classify', 'support']);
  });
});

describe('telling a LiteLLM export from everything else', () => {
  it('recognises one', () => {
    assert.equal(looksLikeLiteLlm(JSON.stringify([row()])), true);
  });

  it('does not claim an OpenAI usage response, whose rows also have prompt_tokens', () => {
    /**
     * The plant that matters. A test that only fed it LiteLLM rows would pass
     * with `looksLikeLiteLlm` returning true for everything, and the tab that
     * calls it would take somebody's OpenAI export away from the code that
     * can read it.
     */
    const openai = JSON.stringify({
      data: [{ n_context_tokens_total: 100, prompt_tokens: 100, snapshot_id: 'gpt-4' }],
    });
    assert.equal(looksLikeLiteLlm(openai), false);
  });

  it('does not claim a plain usage log, an OTel export, or an empty file', () => {
    assert.equal(looksLikeLiteLlm('{"model":"claude-opus-5","usage":{"input_tokens":10}}'), false);
    assert.equal(looksLikeLiteLlm('{"resourceSpans":[]}'), false);
    assert.equal(looksLikeLiteLlm(''), false);
  });
});
