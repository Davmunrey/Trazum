import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { partnerModelId } from '../dist/index.js';

/**
 * A Claude model as Amazon Bedrock or Vertex AI names it (#858). The forms are
 * the ones Claude Code's Bedrock and Vertex pages show, read 2026-11-21. Read
 * only: nothing here prices anything.
 */
describe('partnerModelId', () => {
  it('reads each Bedrock profile prefix, the bare namespace, a date and a version', () => {
    const cases = {
      'us.anthropic.claude-sonnet-4-6': 'claude-sonnet-4-6',
      'eu.anthropic.claude-opus-5-5': 'claude-opus-5-5',
      'apac.anthropic.claude-opus-5-5': 'claude-opus-5-5',
      'jp.anthropic.claude-opus-5-5': 'claude-opus-5-5',
      'au.anthropic.claude-opus-5-5': 'claude-opus-5-5',
      'global.anthropic.claude-opus-5-5': 'claude-opus-5-5',
      'us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0': 'claude-sonnet-4-5-20250929',
      'us.anthropic.claude-haiku-4-5-20251001-v1:0': 'claude-haiku-4-5-20251001',
      'anthropic.claude-sonnet-5': 'claude-sonnet-5',
      'anthropic.claude-haiku-4-5-v2': 'claude-haiku-4-5',
    };
    for (const [id, model] of Object.entries(cases)) {
      assert.deepEqual(partnerModelId(id), { platform: 'bedrock', model }, id);
    }
  });

  it('reads a Vertex id as the dated model it names', () => {
    assert.deepEqual(partnerModelId('claude-sonnet-4-5@20250929'), { platform: 'vertex', model: 'claude-sonnet-4-5-20250929' });
    assert.deepEqual(partnerModelId('claude-haiku-4-5@20251001'), { platform: 'vertex', model: 'claude-haiku-4-5-20251001' });
  });

  it('reads nothing else: plain ids, slugs, ARNs, unknown prefixes and broken shapes', () => {
    for (const id of [
      'claude-sonnet-4-6',
      'openai/gpt-5',
      'anthropic/claude-sonnet-4-6',
      'arn:aws:bedrock:us-east-2:111122223333:application-inference-profile/abc',
      'xx.anthropic.claude-sonnet-4-6',
      'us.meta.llama3-70b-instruct-v1:0',
      'anthropic.claude--x',
      'anthropic.claude-',
      'anthropic.gpt-5',
      'claude-sonnet-4-5@2025',
      'claude-sonnet-4-5@2025092a',
      'gemini-2.5-pro@20250929',
      '',
    ]) {
      assert.equal(partnerModelId(id), undefined, id);
    }
  });

  it('answers in linear time on a long hostile id', () => {
    const id = `anthropic.claude${'-a'.repeat(50_000)}!`;
    const started = process.hrtime.bigint();
    assert.equal(partnerModelId(id), undefined);
    assert.ok(process.hrtime.bigint() - started < 500_000_000n, 'took longer than half a second');
  });
});
