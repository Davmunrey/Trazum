import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { looksLikeOpenaiUsage, openaiUsageRecords } from '../dist/openai-usage.js';
import { parseUsageLine } from '../dist/usage.js';

/**
 * OpenAI's own usage report, read as a log.
 *
 * The fixture is the published OpenAPI example for
 * `organization.usage.completions.result`, field for field and figure for
 * figure, because its numbers are an identity the converter leans on:
 * input_tokens = uncached + cached + cache-write, and each of those is the
 * sum of its text, audio and image parts. A fixture with rounder numbers
 * would pass a converter that got the identity wrong.
 */

const START = 1730419200; // 2024-11-01T00:00:00Z, the schema's own example.

const bucket = (results, start = START) => ({
  object: 'bucket',
  start_time: start,
  end_time: start + 86400,
  results,
});

/** The schema's example, verbatim. Text, audio and image all present. */
const example = (over = {}) => ({
  object: 'organization.usage.completions.result',
  input_tokens: 5000,
  input_cached_tokens: 1800,
  input_cache_write_tokens: 200,
  input_uncached_tokens: 3000,
  output_tokens: 1000,
  input_text_tokens: 2500,
  output_text_tokens: 800,
  input_cached_text_tokens: 1500,
  input_audio_tokens: 300,
  input_cached_audio_tokens: 100,
  output_audio_tokens: 100,
  input_image_tokens: 200,
  input_cached_image_tokens: 200,
  output_image_tokens: 100,
  num_model_requests: 5,
  project_id: 'proj_abc',
  user_id: 'user-abc',
  api_key_id: 'key_abc',
  model: 'gpt-4o-mini-2024-07-18',
  batch: false,
  service_tier: 'default',
  ...over,
});

/** The same row with nothing but text on it. */
const text = (over = {}) =>
  example({
    input_tokens: 1000,
    input_cached_tokens: 400,
    input_cache_write_tokens: 100,
    input_uncached_tokens: 500,
    output_tokens: 500,
    input_text_tokens: 500,
    output_text_tokens: 500,
    input_cached_text_tokens: 400,
    input_audio_tokens: 0,
    input_cached_audio_tokens: 0,
    output_audio_tokens: 0,
    input_image_tokens: 0,
    input_cached_image_tokens: 0,
    output_image_tokens: 0,
    ...over,
  });

const report = (data, over = {}) =>
  JSON.stringify({ object: 'page', data, has_more: false, next_page: null, ...over });

describe('the usage report becomes records in the shape the parser reads OpenAI', () => {
  it('writes prompt_tokens with the cached half inside it, as the schema counts it', () => {
    /*
      `input_tokens` includes cached and cache-write tokens, says the schema.
      That is the Chat Completions convention, so the record uses its names:
      writing it as Anthropic's `input_tokens` would charge the cached half
      twice, on the largest line, silently.
    */
    const { records, rows, buckets } = openaiUsageRecords(report([bucket([text()])]));
    assert.equal(buckets, 1);
    assert.equal(rows, 1);
    assert.deepEqual(records[0], {
      model: 'gpt-4o-mini-2024-07-18',
      ts: '2024-11-01T00:00:00.000Z',
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        prompt_tokens_details: { cached_tokens: 400 },
      },
    });
  });

  it('and the record parses to the right split, which is the only claim that matters', () => {
    const { records } = openaiUsageRecords(report([bucket([text()])]));
    const parsed = parseUsageLine(JSON.stringify(records[0]));
    assert.ok(parsed !== null, 'the converted record is not a usage line');
    assert.equal(parsed.model, 'gpt-4o-mini-2024-07-18');
    /* 1000 on the record, 400 of them cached: the parser subtracts once,
       which is the whole reason the record is written in this shape. */
    assert.equal(parsed.inputTokens, 600);
    assert.equal(parsed.outputTokens, 500);
    assert.equal(parsed.cacheReadTokens, 400);
  });

  it('reads the bucket clock as Unix seconds, not milliseconds', () => {
    /* A converter that took the field for milliseconds would date every
       row in January 1970, and a receipt's span would be nonsense. */
    const { records } = openaiUsageRecords(
      report([bucket([text()], START), bucket([text()], START + 86400)]),
    );
    assert.deepEqual(
      records.map((record) => record.ts),
      ['2024-11-01T00:00:00.000Z', '2024-11-02T00:00:00.000Z'],
    );
  });

  it('takes the label from the operator, because the provider does not have one', () => {
    const { records } = openaiUsageRecords(report([bucket([text()])]), { label: 'billing' });
    assert.equal(records[0].label, 'billing');
    const without = openaiUsageRecords(report([bucket([text()])]));
    assert.equal('label' in without.records[0], false, 'a label nobody chose was invented');
  });

  it('counts requests and buckets, and a bucket with no usage as a bucket', () => {
    const { buckets, rows, requests } = openaiUsageRecords(report([bucket([]), bucket([text(), text()])]));
    assert.equal(buckets, 2);
    assert.equal(rows, 2);
    assert.equal(requests, 10);
  });
});

describe('audio and image tokens, which a text rate is not the rate for', () => {
  it('reduces a mixed row to its text part, using the schema’s own split', () => {
    /*
      The published example: 5000 input tokens of which 2500 uncached text,
      1500 cached text, and the rest audio and image. The record prices the
      text and nothing else, and the rest is a named gap.
    */
    const conversion = openaiUsageRecords(report([bucket([example()])]));
    assert.equal(conversion.records.length, 1);
    assert.deepEqual(conversion.records[0].usage, {
      prompt_tokens: 4000,
      completion_tokens: 800,
      prompt_tokens_details: { cached_tokens: 1500 },
    });
    assert.equal(conversion.mixedRows, 1);
    /* 300 + 100 + 100 + 200 + 200 + 100 */
    assert.equal(conversion.nonTextTokens, 1000);
    /* Cache writes carry no modality, so on a mixed row they are left out
       rather than guessed text, and said. */
    assert.equal(conversion.cacheWriteUnplaced, 200);
  });

  it('refuses a mixed row the report gave no split for, rather than pricing audio as text', () => {
    const unsplit = example({
      input_text_tokens: undefined,
      input_cached_text_tokens: undefined,
      output_text_tokens: undefined,
    });
    const conversion = openaiUsageRecords(report([bucket([unsplit])]));
    assert.equal(conversion.records.length, 0);
    assert.equal(conversion.unsplitRows, 1);
    assert.equal(conversion.nonTextTokens, 1000);
  });

  it('prices a text-only row whole, cache writes included at the input rate the report puts them in', () => {
    const conversion = openaiUsageRecords(report([bucket([text()])]));
    assert.equal(conversion.mixedRows, 0);
    assert.equal(conversion.nonTextTokens, 0);
    assert.equal(conversion.cacheWriteUnplaced, 0);
    assert.equal(conversion.records[0].usage.prompt_tokens, 1000);
  });
});

describe('what it refuses to price, and says instead', () => {
  it('refuses a row with no model, because nothing on it says what answered', () => {
    const conversion = openaiUsageRecords(report([bucket([text({ model: null })])]));
    assert.equal(conversion.records.length, 0);
    assert.equal(conversion.unnamedModel, 1);
  });

  it('refuses a batch row, which is billed at a discount no catalogue rate is', () => {
    const conversion = openaiUsageRecords(report([bucket([text({ batch: true }), text()])]));
    assert.equal(conversion.records.length, 1, 'a batch row was priced from a standard rate');
    assert.equal(conversion.batch, 1);
    assert.equal(conversion.batchNamed, true);
  });

  it('says when the report never said whether anything was batch', () => {
    const conversion = openaiUsageRecords(report([bucket([text({ batch: null })])]));
    assert.equal(conversion.records.length, 1, 'a row was dropped for a question nobody asked');
    assert.equal(conversion.batchNamed, false);
  });

  it('refuses any tier but default, and names the tier it refused', () => {
    /* The schema does not enumerate the values, so neither does this: a
       name the reader can see beats a count of something unnamed. */
    const conversion = openaiUsageRecords(
      report([bucket([text({ service_tier: 'flex' }), text({ service_tier: 'priority' }), text()])]),
    );
    assert.equal(conversion.records.length, 1);
    assert.equal(conversion.nonDefaultTier, 2);
    assert.deepEqual(conversion.tiersRefused, ['flex', 'priority']);
    assert.equal(conversion.tierNamed, true);

    const untiered = openaiUsageRecords(report([bucket([text({ service_tier: null })])]));
    assert.equal(untiered.records.length, 1);
    assert.equal(untiered.tierNamed, false);
  });

  it('says when the report is one page of several', () => {
    assert.equal(openaiUsageRecords(report([bucket([text()])])).truncated, false);
    const partial = openaiUsageRecords(
      report([bucket([text()])], { has_more: true, next_page: 'page_AAAAAGdGxdEiJdKOAAAAAGcqsYA=' }),
    );
    assert.equal(partial.truncated, true, 'an understated bill was reported as whole');
  });

  it('refuses text that is not this endpoint’s answer', () => {
    for (const input of ['', 'not json', '[]', '{"buckets":[]}', 'null']) {
      const conversion = openaiUsageRecords(input);
      assert.equal(conversion.unparseable, 1, `${JSON.stringify(input)} was read as a report`);
      assert.equal(conversion.records.length, 0);
    }
  });
});

describe('what deliberately does not cross', () => {
  it('reads no identity: not the user, the key, or the project', () => {
    const secret = 'tzp-planted-identity-4c1e';
    const conversion = openaiUsageRecords(
      report([bucket([text({ user_id: secret, api_key_id: secret, project_id: secret })])]),
      { label: 'billing' },
    );
    assert.equal(conversion.records.length, 1, 'the fixture converted nothing to check');
    assert.equal(JSON.stringify(conversion.records).includes(secret), false, 'an identity crossed');
  });
});

describe('the project mapping the operator writes', () => {
  const spread = () =>
    report([
      bucket([
        text({ project_id: 'proj_pay' }),
        text({ project_id: 'proj_other' }),
      ]),
    ]);
  const RULES = [{ project: 'proj_pay', label: 'payments' }];

  it('labels by project where a rule names one, and falls back to --label', () => {
    const { records, labelledByProject, unruledProject } = openaiUsageRecords(spread(), {
      label: 'fallback',
      labelByProject: RULES,
    });
    assert.deepEqual(records.map((record) => record.label), ['payments', 'fallback']);
    assert.equal(labelledByProject, 1);
    assert.equal(unruledProject, 1);

    /* Unattributed without a fallback, rather than attributed to a neighbour. */
    const bare = openaiUsageRecords(spread(), { labelByProject: RULES });
    assert.equal('label' in bare.records[1], false);
  });

  it('says when rules were given and the report was not grouped by project', () => {
    const ungrouped = openaiUsageRecords(report([bucket([text({ project_id: null })])]), {
      label: 'fallback',
      labelByProject: RULES,
    });
    assert.equal(ungrouped.projectNotGrouped, true);
    assert.equal(ungrouped.records[0].label, 'fallback');
    assert.equal(openaiUsageRecords(spread(), { labelByProject: RULES }).projectNotGrouped, false);
    assert.equal(openaiUsageRecords(spread()).projectNotGrouped, false, 'said without being asked');
  });

  it('matches a project exactly, because an opaque id has no hierarchy', () => {
    const conversion = openaiUsageRecords(report([bucket([text({ project_id: 'proj_payments_eu' })])]), {
      labelByProject: RULES,
    });
    assert.equal('label' in conversion.records[0], false, 'a prefix was treated as a match');
    assert.equal(conversion.unruledProject, 1);
  });
});

describe('telling this report from every other JSON', () => {
  it('recognises one, and claims neither a saved response nor the Anthropic report', () => {
    assert.equal(looksLikeOpenaiUsage(report([bucket([text()])])), true);
    const response = JSON.stringify({
      id: 'chatcmpl-1',
      created: START,
      usage: { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 0 } },
    });
    assert.equal(looksLikeOpenaiUsage(response), false);
    const anthropic = JSON.stringify({
      data: [{ starting_at: '2026-09-01T00:00:00Z', results: [{ uncached_input_tokens: 1, output_tokens: 1 }] }],
      has_more: false,
    });
    assert.equal(looksLikeOpenaiUsage(anthropic), false);
    assert.equal(looksLikeOpenaiUsage('{}'), false);
  });
});
