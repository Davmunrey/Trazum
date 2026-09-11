import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { looksLikeOpenrouterActivity, openrouterActivityRecords } from '../dist/openrouter-activity.js';
import { parseUsageLine } from '../dist/usage.js';

/**
 * OpenRouter's activity report, read as a log.
 *
 * The fixture is the endpoint's published example, field for field. What is
 * checked is mostly what is kept apart: the dollars OpenRouter charged are
 * carried beside the records and never into them, and the reasoning tokens
 * are counted and never added, because the schema does not say whether the
 * completion count already holds them.
 */

/** The published example row, verbatim. */
const row = (over = {}) => ({
  byok_usage_inference: 0.012,
  completion_tokens: 125,
  date: '2025-08-24',
  endpoint_id: '550e8400-e29b-41d4-a716-446655440000',
  model: 'openai/gpt-4.1',
  model_permaslug: 'openai/gpt-4.1-2025-04-14',
  prompt_tokens: 50,
  provider_name: 'OpenAI',
  reasoning_tokens: 25,
  requests: 5,
  usage: 0.015,
  ...over,
});

const report = (data) => JSON.stringify({ data });

describe('the activity report becomes records the overlay can price', () => {
  it('keys the record by the slug the pricing overlay is keyed by', () => {
    const { records, rows } = openrouterActivityRecords(report([row()]));
    assert.equal(rows, 1);
    assert.deepEqual(records[0], {
      model: 'openai/gpt-4.1',
      ts: '2025-08-24T00:00:00.000Z',
      usage: { prompt_tokens: 50, completion_tokens: 125 },
    });
  });

  it('and the record parses', () => {
    const { records } = openrouterActivityRecords(report([row()]));
    const parsed = parseUsageLine(JSON.stringify(records[0]));
    assert.ok(parsed !== null);
    assert.equal(parsed.inputTokens, 50);
    assert.equal(parsed.outputTokens, 125);
  });

  it('counts reasoning tokens and does not add them, because the schema does not say', () => {
    const conversion = openrouterActivityRecords(report([row(), row({ reasoning_tokens: 75 })]));
    assert.equal(conversion.reasoningTokens, 100);
    assert.equal(conversion.records[1].usage.completion_tokens, 125, 'reasoning was added to the completion count');
  });

  it('carries what OpenRouter charged beside the records, never inside them', () => {
    const conversion = openrouterActivityRecords(report([row(), row({ usage: 0.5, byok_usage_inference: 0 })]));
    assert.ok(Math.abs(conversion.reportedUsageUsd - 0.515) < 1e-9);
    assert.ok(Math.abs(conversion.byokUsd - 0.012) < 1e-9);
    assert.equal(JSON.stringify(conversion.records).includes('0.015'), false, 'a billed figure reached a record');
  });

  it('sums the billed figures over refused rows too, so the total is not understated', () => {
    const conversion = openrouterActivityRecords(report([row({ model: null, usage: 2 })]));
    assert.equal(conversion.records.length, 0);
    assert.equal(conversion.reportedUsageUsd, 2);
  });

  it('counts requests and days', () => {
    const conversion = openrouterActivityRecords(report([row(), row({ date: '2025-08-25' }), row()]));
    assert.equal(conversion.requests, 15);
    assert.equal(conversion.days, 2);
  });
});

describe('what it refuses, and says', () => {
  it('refuses a row with no model slug', () => {
    const conversion = openrouterActivityRecords(report([row({ model: '' })]));
    assert.equal(conversion.records.length, 0);
    assert.equal(conversion.unnamedModel, 1);
  });

  it('refuses a row whose date is not a day', () => {
    const conversion = openrouterActivityRecords(report([row({ date: '2025-08-24T10:00:00Z' })]));
    assert.equal(conversion.records.length, 0);
    assert.equal(conversion.undatedRows, 1);
  });

  it('refuses text that is not this endpoint’s answer', () => {
    for (const input of ['', 'not json', '[]', 'null', '{"rows":[]}']) {
      const conversion = openrouterActivityRecords(input);
      assert.equal(conversion.unparseable, 1, `${JSON.stringify(input)} was read`);
    }
  });
});

describe('what deliberately does not cross', () => {
  it('reads neither the endpoint id, the provider, nor the workspace into a record', () => {
    const secret = 'tzp-planted-identity-7a2d';
    const conversion = openrouterActivityRecords(
      report([row({ endpoint_id: secret, provider_name: secret, workspace_id: secret })]),
      { label: 'billing' },
    );
    assert.equal(conversion.records.length, 1);
    assert.equal(JSON.stringify(conversion.records).includes(secret), false, 'an identity crossed');
  });
});

describe('the workspace mapping the operator writes', () => {
  const RULES = [{ workspace: 'ws-pay', label: 'payments' }];
  const spread = () => report([row({ workspace_id: 'ws-pay' }), row({ workspace_id: 'ws-other' })]);

  it('labels by workspace where a rule names one, and falls back to --label', () => {
    const conversion = openrouterActivityRecords(spread(), { label: 'fallback', labelByWorkspace: RULES });
    assert.deepEqual(conversion.records.map((record) => record.label), ['payments', 'fallback']);
    assert.equal(conversion.labelledByWorkspace, 1);
    assert.equal(conversion.unruledWorkspace, 1);
  });

  it('says when rules were given and the report was not grouped by workspace', () => {
    const conversion = openrouterActivityRecords(report([row()]), { labelByWorkspace: RULES });
    assert.equal(conversion.workspaceNotGrouped, true);
    assert.equal(openrouterActivityRecords(spread(), { labelByWorkspace: RULES }).workspaceNotGrouped, false);
  });

  it('matches exactly, never by prefix', () => {
    const conversion = openrouterActivityRecords(report([row({ workspace_id: 'ws-payments' })]), {
      labelByWorkspace: RULES,
    });
    assert.equal('label' in conversion.records[0], false);
  });
});

describe('telling this report from every other JSON', () => {
  it('recognises one and claims neither the model catalogue nor a chat response', () => {
    assert.equal(looksLikeOpenrouterActivity(report([row()])), true);
    const catalogue = JSON.stringify({ data: [{ id: 'openai/gpt-4.1', pricing: { prompt: '0.000002' } }] });
    assert.equal(looksLikeOpenrouterActivity(catalogue), false);
    const chat = JSON.stringify({ id: 'gen-1', model: 'openai/gpt-4.1', usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.01 } });
    assert.equal(looksLikeOpenrouterActivity(chat), false);
  });
});
