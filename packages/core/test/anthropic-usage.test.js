import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { anthropicUsageRecords, looksLikeAnthropicUsage } from '../dist/anthropic-usage.js';
import { parseUsageLine } from '../dist/usage.js';

/**
 * The provider's own usage report, read as a log.
 *
 * The fixture below is the response schema's own example, field for field,
 * because a converter tested against a shape somebody remembered is a
 * converter that mis-reads a real bill and passes its own tests doing it.
 *
 * What is checked here is mostly what the converter **refuses**: the rows it
 * leaves out, and whether it says why. A converter that silently dropped a
 * batch row would produce a smaller number with no explanation, and a
 * converter that priced one would produce a bigger number with no warning.
 * Both are worse than the refusal.
 */

const bucket = (results, starting = '2026-09-01T00:00:00Z') => ({
  starting_at: starting,
  ending_at: '2026-09-02T00:00:00Z',
  results,
});

/** One result, exactly as the published example shapes it. */
const result = (over = {}) => ({
  account_id: 'user_01WCz1FkmYMm4gnmykNKUu3Q',
  api_key_id: 'apikey_01Rj2N8SVvo6BePZj99NhmiT',
  cache_creation: { ephemeral_1h_input_tokens: 1000, ephemeral_5m_input_tokens: 500 },
  cache_read_input_tokens: 200,
  context_window: '0-200k',
  inference_geo: 'global',
  model: 'claude-opus-5',
  output_tokens: 500,
  server_tool_use: { web_search_requests: 10 },
  service_account_id: 'svac_01Hk3R9TWxq7CfQak00OiVw4',
  service_tier: 'standard',
  uncached_input_tokens: 1500,
  workspace_id: 'wrkspc_01JwQvzr7rXLA5AGx3HKfFUJ',
  ...over,
});

const report = (data, over = {}) => JSON.stringify({ data, has_more: false, next_page: null, ...over });

describe('the usage report becomes records every door already prices', () => {
  it('carries the counts across under the names the parser reads', () => {
    const { records, rows, buckets } = anthropicUsageRecords(report([bucket([result()])]));
    assert.equal(buckets, 1);
    assert.equal(rows, 1);
    assert.deepEqual(records[0], {
      model: 'claude-opus-5',
      ts: '2026-09-01T00:00:00Z',
      usage: {
        input_tokens: 1500,
        output_tokens: 500,
        cache_read_input_tokens: 200,
        cache_creation: { ephemeral_5m_input_tokens: 500, ephemeral_1h_input_tokens: 1000 },
      },
    });
  });

  it('and the record parses, which is the only claim that matters', () => {
    /*
      The rename is the whole risk: `uncached_input_tokens` is this endpoint's
      name for what every other shape calls the input, and cached reads sit
      beside it rather than folded into it. If that were wrong the number would
      be wrong and everything above would still pass.
    */
    const { records } = anthropicUsageRecords(report([bucket([result()])]));
    const parsed = parseUsageLine(JSON.stringify(records[0]));
    assert.ok(parsed !== null, 'the converted record is not a usage line');
    assert.equal(parsed.model, 'claude-opus-5');
    assert.equal(parsed.inputTokens, 1500);
    assert.equal(parsed.outputTokens, 500);
    assert.equal(parsed.cacheReadTokens, 200);
    assert.equal(parsed.cacheWrite5mTokens, 500);
    assert.equal(parsed.cacheWrite1hTokens, 1000);
  });

  it('takes the label from the operator, because the provider does not have one', () => {
    const { records } = anthropicUsageRecords(report([bucket([result()])]), { label: 'billing' });
    assert.equal(records[0].label, 'billing');
    const without = anthropicUsageRecords(report([bucket([result()])]));
    assert.equal('label' in without.records[0], false, 'a label nobody chose was invented');
  });

  it('stamps every record with its bucket, which is the only instant there is', () => {
    const { records } = anthropicUsageRecords(
      report([bucket([result()], '2026-09-01T00:00:00Z'), bucket([result()], '2026-09-02T00:00:00Z')]),
    );
    assert.deepEqual(
      records.map((record) => record.ts),
      ['2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z'],
    );
  });

  it('counts a bucket with no usage as a bucket, not as nothing', () => {
    const { buckets, rows } = anthropicUsageRecords(report([bucket([]), bucket([result()])]));
    assert.equal(buckets, 2);
    assert.equal(rows, 1);
  });
});

describe('what it refuses to price, and says instead', () => {
  it('refuses a row with no model, because nothing on it says what answered', () => {
    const conversion = anthropicUsageRecords(report([bucket([result({ model: null })])]));
    assert.equal(conversion.records.length, 0);
    assert.equal(conversion.unnamedModel, 1);
  });

  it('refuses a tier a catalogue rate is not the rate for', () => {
    /*
      The one that would be worst to get wrong. Batch is billed at a discount;
      pricing it from the standard rate overstates the bill by half and looks
      entirely right doing it, which is this product's own definition of the
      unforgivable failure.
    */
    for (const tier of ['batch', 'priority', 'flex', 'flex_discount', 'priority_on_demand']) {
      const conversion = anthropicUsageRecords(report([bucket([result({ service_tier: tier })])]));
      assert.equal(conversion.records.length, 0, `${tier} was priced from a standard rate`);
      assert.equal(conversion.nonStandardTier, 1);
    }
  });

  it('says when the report never named a tier at all', () => {
    /* Not a refusal: most organisations run standard only. It is said because
       the alternative is a reader assuming a question was answered. */
    const untiered = anthropicUsageRecords(report([bucket([result({ service_tier: null })])]));
    assert.equal(untiered.records.length, 1, 'a row was dropped for a question nobody asked');
    assert.equal(untiered.tierNamed, false);

    const named = anthropicUsageRecords(report([bucket([result()])]));
    assert.equal(named.tierNamed, true);
  });

  it('counts server tool requests, which no token rate reaches', () => {
    const conversion = anthropicUsageRecords(
      report([bucket([result(), result({ server_tool_use: { web_search_requests: 5 } })])]),
    );
    assert.equal(conversion.webSearchRequests, 15);
    /* And they are in no line: a web search is not tokens. */
    assert.equal(conversion.records.length, 2);
  });

  it('says when the report is one page of several', () => {
    const whole = anthropicUsageRecords(report([bucket([result()])]));
    assert.equal(whole.truncated, false);
    const partial = anthropicUsageRecords(
      report([bucket([result()])], { has_more: true, next_page: 'page_abc' }),
    );
    assert.equal(partial.truncated, true, 'an understated bill was reported as whole');
  });

  it('refuses text that is not this endpoint’s answer', () => {
    for (const text of ['', 'not json', '[]', '{"buckets":[]}', 'null']) {
      const conversion = anthropicUsageRecords(text);
      assert.equal(conversion.unparseable, 1, `${JSON.stringify(text)} was read as a report`);
      assert.equal(conversion.records.length, 0);
    }
  });
});

describe('what deliberately does not cross', () => {
  it('reads no identity: not the person, the key, or the workspace', () => {
    /*
      Planted and grepped, the way every other converter here proves it. The
      account and service-account ids name people; the key and workspace ids
      are the organisation's own infrastructure, and a workspace id is not a
      project name. Mapping one to the other is the operator's decision, made
      with --label.
    */
    const secret = 'tzp-planted-identity-9f3a';
    const conversion = anthropicUsageRecords(
      report([
        bucket([
          result({
            account_id: secret,
            api_key_id: secret,
            service_account_id: secret,
            workspace_id: secret,
          }),
        ]),
      ]),
      { label: 'billing' },
    );
    assert.equal(conversion.records.length, 1, 'the fixture converted nothing to check');
    assert.equal(JSON.stringify(conversion.records).includes(secret), false, 'an identity crossed');
  });
});

describe('telling this report from every other JSON', () => {
  it('recognises one, and does not claim a saved Messages response', () => {
    assert.equal(looksLikeAnthropicUsage(report([bucket([result()])])), true);
    /* A Messages response has output_tokens too. It has no uncached input
       count, which is the field only this endpoint uses. */
    const message = JSON.stringify({
      id: 'msg_1',
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
    });
    assert.equal(looksLikeAnthropicUsage(message), false);
    assert.equal(looksLikeAnthropicUsage('{}'), false);
  });
});
