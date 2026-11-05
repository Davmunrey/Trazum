import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  MODELS,
  claudeCodeRecords,
  effectivePricing,
  parseUsageLine,
  profileUsage,
  streamingUsageReader,
  usageFromResponse,
} from '../dist/index.js';

/**
 * Anthropic's fast mode, priced by the speed the response records.
 *
 * platform.claude.com/docs/en/about-claude/pricing#fast-mode-pricing and
 * build-with-claude/fast-mode, read 2026-11-05: Opus 5.5 at $8/$40, Opus 5 and
 * Opus 4.8 at $10/$50, "across the full context window", with the caching
 * multipliers applied on top. The response's `usage.speed` is "fast" or
 * "standard". Trazum dropped the field, so every fast call was priced at the
 * standard rate: half of what it cost.
 */

const ON = new Date('2026-11-01T10:00:00Z');
const byId = (id) => MODELS.find((model) => model.id === id);
const close = (actual, expected, what) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

describe('fast mode in the catalogue', () => {
  it('prices each model at the rate its page publishes, and standard where the speed is standard or unrecorded', () => {
    for (const [id, standard, fast] of [
      ['claude-opus-5-5', [4, 20], [8, 40]],
      ['claude-opus-5', [5, 25], [10, 50]],
      ['claude-opus-4-8', [5, 25], [10, 50]],
    ]) {
      const model = byId(id);
      const quick = effectivePricing(model, ON, { inputTokens: 1000, speed: 'fast' });
      assert.deepEqual([quick.inputPerMTok, quick.outputPerMTok], fast, `${id} fast`);
      assert.equal(quick.tier.applied, 'fast');
      assert.equal(quick.tier.decided, true);
      for (const size of [{ inputTokens: 1000, speed: 'standard' }, { inputTokens: 1000 }, {}]) {
        const rates = effectivePricing(model, ON, size);
        assert.deepEqual([rates.inputPerMTok, rates.outputPerMTok], standard, `${id} ${JSON.stringify(size)}`);
        // Decided: an unrecorded speed never asked for fast mode, so it is not a ceiling with a floor.
        assert.equal(rates.tier.decided, true, `${id} ${JSON.stringify(size)} was left undecided`);
      }
    }
  });

  it('leaves models without fast mode alone, whatever the log says', () => {
    for (const id of ['claude-opus-4-7', 'claude-sonnet-5-5', 'claude-fable-5-1']) {
      const model = byId(id);
      assert.deepEqual(effectivePricing(model, ON, { speed: 'fast' }), effectivePricing(model, ON, {}), id);
    }
  });

  it('prices Claude Sonnet 4.5, which was missing, from its own page', () => {
    const sonnet = BUNDLED_CATALOGUE.byId.get('claude-sonnet-4-5-20250929') ?? byId('claude-sonnet-4-5');
    assert.equal(sonnet.id, 'claude-sonnet-4-5');
    assert.deepEqual([sonnet.inputPerMTok, sonnet.outputPerMTok, sonnet.contextWindow], [3, 15, 200_000]);
    assert.equal(sonnet.recommendable, false, 'a deprecated model was left recommendable');
  });
});

describe('the speed reaches the bill', () => {
  // One million of each, so the dollars read straight off the rates.
  const transcript = (speed) => JSON.stringify({
    type: 'assistant', timestamp: '2026-11-01T10:00:00Z', sessionId: 's', requestId: `r-${speed ?? 'none'}`,
    message: {
      id: `m-${speed ?? 'none'}`, model: 'claude-opus-5-5', content: [],
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, ...(speed ? { speed } : {}) },
    },
  });

  it('keeps usage.speed through a Claude Code transcript and prices the call by it', () => {
    const records = claudeCodeRecords([transcript('fast'), transcript('standard'), transcript(undefined)].join('\n')).records;
    assert.deepEqual(records.map((record) => record.usage.speed), ['fast', 'standard', undefined]);
    const report = profileUsage(records.map((record) => JSON.stringify(record)).join('\n'), { catalogue: BUNDLED_CATALOGUE });
    // Standard: $4 input + $20 output + $0.20 cache read (0.05x). Fast: twice each, cache read on top of the fast rate.
    close(report.total.totalUsd, (8 + 40 + 0.4) + 2 * (4 + 20 + 0.2), 'three calls');
  });

  it('reads the speed from a logged API response, nested or flat', () => {
    const nested = parseUsageLine(JSON.stringify({ model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: 1, speed: 'fast' } }));
    const flat = parseUsageLine(JSON.stringify({ model: 'claude-opus-5-5', input_tokens: 1, output_tokens: 1, speed: 'fast' }));
    assert.equal(nested.speed, 'fast');
    assert.equal(flat.speed, 'fast');
    assert.equal(parseUsageLine(JSON.stringify({ model: 'claude-opus-5-5', input_tokens: 1, output_tokens: 1 })).speed, undefined);
  });
});

describe('the gateway measures the speed it was answered at', () => {
  it('from a whole response', () => {
    const usage = usageFromResponse('anthropic', { usage: { input_tokens: 10, output_tokens: 5, speed: 'fast' } });
    assert.equal(usage.speed, 'fast');
    assert.equal(usageFromResponse('anthropic', { usage: { input_tokens: 10, output_tokens: 5 } }).speed, undefined);
  });

  it('from a stream, whichever event carries it', () => {
    const reader = streamingUsageReader('anthropic');
    reader.push('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":1,"speed":"fast"}}}\n\n');
    reader.push('event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7}}\n\n');
    reader.push('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    const usage = reader.done();
    assert.equal(usage.speed, 'fast');
    assert.equal(usage.outputTokens, 7);
  });
});
