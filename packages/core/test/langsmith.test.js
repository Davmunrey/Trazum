import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  langsmithRecords,
  looksLikeLangsmith,
  profileUsage,
} from '../dist/index.js';

/**
 * LangSmith's run export, read as a usage log.
 *
 * Every field here is `RunBase` and `Run` from `python/langsmith/schemas.py`
 * in langchain-ai/langsmith-sdk — including the two this converter must refuse
 * to touch and the one that makes a run different from a call. A fixture
 * written from memory of an API would prove the converter agrees with the
 * memory.
 */

/** Text no record may carry, distinctive enough that a substring hit is real. */
const SECRET = 'ACME-CONFIDENTIAL-Q3-PRICING';

const run = (over = {}) => ({
  id: 'run-1',
  trace_id: 'trace-a',
  dotted_order: '20260801T100000000000Zrun-1',
  // LangChain names a run after the client class. Never a model.
  name: 'ChatAnthropic',
  run_type: 'llm',
  start_time: '2026-08-01T10:00:00.000Z',
  end_time: '2026-08-01T10:00:03.000Z',
  prompt_tokens: 1200,
  completion_tokens: 100,
  total_tokens: 1300,
  total_cost: 0.0421,
  prompt_cost: 0.036,
  prompt_cost_details: { cache_read: 0.001 },
  tags: ['support'],
  extra: {
    metadata: {
      ls_model_name: 'claude-opus-5',
      ls_provider: 'anthropic',
      // The free-form bag, and what an operator might leave in it.
      internal_note: `see ${SECRET}`,
    },
  },
  // The prompt and the completion, on every single run.
  inputs: { messages: [{ role: 'user', content: `Summarise ${SECRET}` }] },
  outputs: { generations: [{ text: `About ${SECRET}` }] },
  session_id: 'project-1',
  ...over,
});

describe('reading a LangSmith run export', () => {
  it('converts the columns a bill is made of', () => {
    const out = langsmithRecords(JSON.stringify([run()]));
    assert.equal(out.rows, 1);
    assert.deepEqual(out.records, [
      {
        model: 'claude-opus-5',
        ts: '2026-08-01T10:00:00.000Z',
        label: 'support',
        session: 'trace-a',
        usage: { input_tokens: 1200, output_tokens: 100 },
      },
    ]);
  });

  it('carries no prompt, no completion and nothing else from the metadata bag', () => {
    /**
     * `extra.metadata` is free-form and the operator fills it. This converter
     * reads named keys out of it and copies none of it, so the next thing
     * somebody puts in there — a ticket id, a customer name, a key — does not
     * become a leak by default.
     */
    const out = langsmithRecords(JSON.stringify([run()]));
    assert.ok(
      !JSON.stringify(out).includes(SECRET),
      'the conversion carried text out of the run',
    );
    // And the measurement survives, so this is not passing by emptiness.
    assert.equal(out.records[0].usage.input_tokens, 1200);
    assert.equal(out.records[0].model, 'claude-opus-5');
  });

  it('skips the runs that are not model calls, and counts them', () => {
    /**
     * The difference between a run and a call, and the reason this converter
     * is not the others with a different field list. A LangSmith trace is a
     * tree: the chain that wrapped the call carries the same tokens as the
     * call, so summing the tree bills them twice. Most of an export is not
     * llm runs at all.
     */
    const out = langsmithRecords(
      JSON.stringify([
        run(),
        run({ id: 'r2', run_type: 'chain', name: 'AgentExecutor', prompt_tokens: 1200 }),
        run({ id: 'r3', run_type: 'tool', name: 'search', prompt_tokens: 400 }),
        run({ id: 'r4', run_type: 'retriever', name: 'vectorstore' }),
      ]),
    );
    assert.equal(out.rows, 1, 'a chain or a tool was counted as a call');
    assert.equal(out.records.length, 1);
    assert.equal(out.notModelCalls, 3, 'the runs that were skipped were skipped silently');
    assert.equal(out.records[0].usage.input_tokens, 1200);
  });

  it('refuses to name a model from the run, and counts the run it dropped', () => {
    /**
     * The plant that matters most. `name` is right there, it is a string, and
     * it looks like a model to anything that is not reading carefully —
     * `ChatAnthropic` is a client class. Pricing a call by the class that made
     * it is a figure attributed to something it does not describe.
     */
    const out = langsmithRecords(
      JSON.stringify([run({ id: 'r2', extra: { metadata: { ls_provider: 'anthropic' } } }), run()]),
    );
    assert.equal(out.rows, 2);
    assert.equal(out.records.length, 1);
    assert.equal(out.unnamedModel, 1, 'a run with no model was dropped without being counted');
    assert.ok(
      !out.records.some((record) => /ChatAnthropic/.test(record.model)),
      'the client class was priced as a model',
    );
  });

  it('reads the model from the invocation params when the SDK put it there', () => {
    const out = langsmithRecords(
      JSON.stringify([
        run({ extra: { metadata: { invocation_params: { model: 'claude-haiku-4-5' } } } }),
      ]),
    );
    assert.equal(out.records[0].model, 'claude-haiku-4-5');
  });

  it('reads the newer nested token counts as well as the flat ones', () => {
    const out = langsmithRecords(
      JSON.stringify([
        run({
          prompt_tokens: undefined,
          completion_tokens: undefined,
          usage_metadata: { input_tokens: 900, output_tokens: 60 },
        }),
      ]),
    );
    assert.deepEqual(out.records[0].usage, { input_tokens: 900, output_tokens: 60 });
  });

  it('takes the trace as the conversation, never the run id', () => {
    /**
     * A trace spans the calls one request made, which is the identity the
     * conversation findings need. `id` is one call, and answering from it
     * would report every call as a conversation of one.
     */
    const out = langsmithRecords(
      JSON.stringify([run(), run({ id: 'run-2', trace_id: 'trace-a' })]),
    );
    assert.deepEqual(
      out.records.map((record) => record.session),
      ['trace-a', 'trace-a'],
    );

    const none = langsmithRecords(JSON.stringify([run({ trace_id: null })]));
    assert.ok(!('session' in none.records[0]), 'a conversation nobody recorded was invented');
  });

  it('keeps LangSmith’s own cost apart from anything Trazum computes', () => {
    /**
     * Two price tables, two figures. `total_cost` and `prompt_cost_details`
     * are LangSmith's arithmetic over LangSmith's prices; merging them into a
     * Trazum total is how a report becomes quietly wrong.
     */
    const out = langsmithRecords(JSON.stringify([run(), run({ id: 'r2', total_cost: 0.1 })]));
    assert.equal(out.reportedCostUsd, 0.1421);
    for (const record of out.records) {
      assert.ok(!('usd' in record), 'the tracer’s own figure entered a usage record');
      assert.ok(!('total_cost' in record));
      assert.deepEqual(Object.keys(record.usage).sort(), ['input_tokens', 'output_tokens']);
    }
  });

  it('reports no cost as an absence, never as zero', () => {
    const out = langsmithRecords(JSON.stringify([run({ total_cost: undefined })]));
    assert.equal(out.reportedCostUsd, null, 'a total nobody reported is not a total of nothing');
  });

  it('takes one tag and never joins several', () => {
    const out = langsmithRecords(JSON.stringify([run({ tags: ['support', 'eu', 'v2'] })]));
    assert.equal(out.records[0].label, 'support');

    const fromMetadata = langsmithRecords(
      JSON.stringify([run({ tags: [], extra: { metadata: { ls_model_name: 'claude-opus-5', label: 'rag' } } })]),
    );
    assert.equal(fromMetadata.records[0].label, 'rag');

    const none = langsmithRecords(
      JSON.stringify([run({ tags: [], extra: { metadata: { ls_model_name: 'claude-opus-5' } } })]),
    );
    assert.equal(none.records[0].label, undefined, 'a label nobody set must not be invented');
  });

  it('reads the four shapes an export actually arrives in', () => {
    const one = run();
    assert.equal(langsmithRecords(JSON.stringify([one, run({ id: 'r2' })])).rows, 2);
    assert.equal(langsmithRecords(JSON.stringify(one)).rows, 1);
    assert.equal(langsmithRecords(JSON.stringify({ runs: [one] })).rows, 1);
    assert.equal(
      langsmithRecords(`${JSON.stringify(one)}\n${JSON.stringify(run({ id: 'r3' }))}\n`).rows,
      2,
    );
  });

  it('counts a logged call with no tokens rather than hiding it', () => {
    const out = langsmithRecords(
      JSON.stringify([run({ prompt_tokens: undefined, completion_tokens: undefined })]),
    );
    assert.equal(out.noTokens, 1);
    assert.equal(out.rows, 1);
    assert.equal(out.records.length, 0);
  });

  it('counts a line that will not parse', () => {
    const out = langsmithRecords(`${JSON.stringify(run())}\nnot json at all\n`);
    assert.equal(out.unparseable, 1);
    assert.equal(out.rows, 1);
  });

  it('prices what it converted, through the ordinary profile path', () => {
    const out = langsmithRecords(
      JSON.stringify([
        run({ prompt_tokens: 1_000_000, completion_tokens: 50_000 }),
        run({
          id: 'r2',
          trace_id: 'trace-b',
          tags: ['classify'],
          prompt_tokens: 2_000_000,
          completion_tokens: 10_000,
          extra: { metadata: { ls_model_name: 'claude-haiku-4-5' } },
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

describe('telling a LangSmith export from everything else', () => {
  it('recognises one', () => {
    assert.equal(looksLikeLangsmith(JSON.stringify([run()])), true);
  });

  it('does not claim a Helicone export, a LiteLLM spend log or an OpenAI usage response', () => {
    /**
     * All three carry `prompt_tokens`, and all three have code that can read
     * them. A detector loose enough to claim any of them would take somebody's
     * export away from the converter that understands it and refuse it in this
     * file's words.
     */
    const helicone = JSON.stringify([
      { request_id: 'r', request_created_at: '2026-08-01T00:00:00Z', prompt_tokens: 10, response_model: 'x' },
    ]);
    const litellm = JSON.stringify([
      { request_id: 'r', prompt_tokens: 10, completion_tokens: 1, model_group: 'route', custom_llm_provider: 'anthropic' },
    ]);
    const openai = JSON.stringify({
      data: [{ n_context_tokens_total: 100, prompt_tokens: 100, snapshot_id: 'gpt-4' }],
    });
    assert.equal(looksLikeLangsmith(helicone), false);
    assert.equal(looksLikeLangsmith(litellm), false);
    assert.equal(looksLikeLangsmith(openai), false);
  });

  it('does not claim a plain usage log, an OTel export, or an empty file', () => {
    assert.equal(looksLikeLangsmith('{"model":"claude-opus-5","usage":{"input_tokens":10}}'), false);
    assert.equal(looksLikeLangsmith('{"resourceSpans":[]}'), false);
    assert.equal(looksLikeLangsmith(''), false);
  });
});
