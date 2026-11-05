import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  MODELS,
  bucketedProfile,
  bucketsFromRecords,
  catalogueFromOverlay,
  claudeCodeRecords,
  normalizeAnthropicUsage,
  parsePricingOverlay,
  parseUsageLine,
  profileUsage,
  receiptFrom,
  recordsFromBuckets,
  sharesOf,
  streamingUsageReader,
  usageFromResponse,
} from '../dist/index.js';
import { costOf } from '../dist/session-cost.js';

/**
 * Anthropic's web search, billed per search on top of the tokens.
 *
 * platform.claude.com/docs/en/about-claude/pricing and the web search tool's
 * page, read 2026-11-05: "Web search is available on the Claude API for $10
 * USD per 1,000 searches, plus standard token costs for search-generated
 * content", on "every model". Every Messages response and every Claude Code
 * log line counts them in `usage.server_tool_use.web_search_requests`, and
 * Trazum read the tokens and dropped the count: a session that searched a
 * thousand times billed $10 short, with nothing on screen saying so.
 *
 * The fee is flat. The tool page: searches through the Batches API "are priced
 * the same as those in regular Messages API requests". The 1.1x of US-only
 * inference is stated for "all token pricing categories", and fast mode
 * prices tokens; a search is neither.
 */

const ON = new Date('2026-11-01T10:00:00Z');
const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);
const line = (over = {}, usage = {}) => JSON.stringify({
  model: 'claude-opus-5',
  ts: '2026-11-01T10:00:00Z',
  ...over,
  usage: { input_tokens: 1_000_000, output_tokens: 1_000_000, server_tool_use: { web_search_requests: 1_000 }, ...usage },
});
const profile = (text) => profileUsage(text, { catalogue: BUNDLED_CATALOGUE, on: ON });

describe('the catalogue', () => {
  it('carries $10 per 1,000 searches on every Claude row, and on no other', () => {
    for (const model of MODELS) {
      if (model.provider === 'anthropic') assert.equal(model.webSearchPerThousandUsd, 10, model.id);
      else assert.equal(model.webSearchPerThousandUsd, undefined, model.id);
    }
  });
});

describe('a call that searched', () => {
  it('reads the count off the response, and only a positive one', () => {
    assert.equal(parseUsageLine(line()).webSearchRequests, 1_000);
    assert.equal(parseUsageLine(line({}, { server_tool_use: { web_search_requests: 0 } })).webSearchRequests, undefined);
    assert.equal(parseUsageLine(line({}, { server_tool_use: undefined })).webSearchRequests, undefined);
  });

  it('rejects a line whose count is there and unreadable, rather than searching for free', () => {
    assert.equal(parseUsageLine(line({}, { server_tool_use: { web_search_requests: '1000' } })), null);
    assert.equal(parseUsageLine(line({}, { server_tool_use: { web_search_requests: -1 } })), null);
  });

  it('bills $10 per 1,000 on top of the tokens, as its own part of the total', () => {
    // Opus 5: $5 in, $25 out, and a thousand searches $10.
    const { total } = profile(line());
    close(total.inputUsd + total.outputUsd, 30, 'tokens');
    assert.equal(total.webSearchRequests, 1_000);
    close(total.webSearchUsd, 10, 'searches');
    close(total.totalUsd, 40, 'total');
    close(sharesOf(total).webSearch, 0.25, 'share');
    assert.equal(total.webSearchUnpricedRequests, 0);
  });

  it('keeps the fee whole on the Batch API, which halves only the tokens', () => {
    const { total } = profile(line({}, { service_tier: 'batch' }));
    close(total.inputUsd + total.outputUsd, 15, 'batch tokens');
    close(total.webSearchUsd, 10, 'batch searches');
  });

  it('keeps the fee whole on US-only inference, which scales only the tokens', () => {
    const { total } = profile(line({}, { inference_geo: 'us' }));
    close(total.inputUsd + total.outputUsd, 33, 'US-only tokens');
    close(total.webSearchUsd, 10, 'US-only searches');
  });

  it('keeps the fee whole in fast mode, which prices only the tokens', () => {
    // Opus 5.5 fast: $8 in, $40 out.
    const { total } = profile(line({ model: 'claude-opus-5-5' }, { speed: 'fast' }));
    close(total.inputUsd + total.outputUsd, 48, 'fast tokens');
    close(total.webSearchUsd, 10, 'fast searches');
  });

  it('names searches on a model with no per-search fee, and leaves them out of the total', () => {
    const { total } = profile(line({ model: 'gpt-6-astra' }, { input_tokens: 100_000, output_tokens: 0 }));
    assert.equal(total.webSearchRequests, 1_000);
    assert.equal(total.webSearchUnpricedRequests, 1_000);
    assert.equal(total.webSearchUsd, 0);
    close(total.totalUsd, total.inputUsd, 'only the tokens');
  });
});

describe('the receipt', () => {
  it('adds up: its five money parts are the line, and the searches are counted beside them', () => {
    const report = profile([line(), line({ label: 'research' }, { server_tool_use: { web_search_requests: 3 } })].join('\n'));
    const receipt = receiptFrom(report, BUNDLED_CATALOGUE);
    for (const entry of receipt.lines) {
      const { inputUsd, cacheReadUsd, cacheWriteUsd, outputUsd, webSearchUsd } = entry.money;
      close(inputUsd + cacheReadUsd + cacheWriteUsd + outputUsd + webSearchUsd, entry.usd, `${entry.label} adds up`);
      close(webSearchUsd / entry.webSearchRequests, 0.01, `${entry.label} per search`);
    }
    assert.deepEqual(receipt.lines.map((entry) => entry.webSearchRequests).sort((a, b) => a - b), [3, 1_000]);
  });

  it('names unpriced searches as a gap, so the total reads as a floor', () => {
    const receipt = receiptFrom(profile(line({ model: 'gpt-6-astra' }, { input_tokens: 100_000 })), BUNDLED_CATALOGUE);
    assert.deepEqual(
      receipt.gaps.find((gap) => gap.kind === 'unpriced-web-search'),
      { kind: 'unpriced-web-search', requests: 1_000, models: ['gpt-6-astra'] },
    );
  });
});

describe('a Claude Code transcript', () => {
  const assistant = (requestId, searches, text = 'SYNTHETIC_PRIVATE_QUERY') => JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-01T10:00:00.000Z',
    sessionId: 'session-1',
    requestId,
    message: {
      model: 'claude-opus-5',
      content: [{ type: 'server_tool_use', name: 'web_search', input: { query: text } }],
      usage: { input_tokens: 1_000_000, output_tokens: 0, server_tool_use: { web_search_requests: searches } },
    },
  });

  it('keeps the search count, and nothing that was searched for', () => {
    const { records } = claudeCodeRecords([assistant('req-1', 4), assistant('req-2', 0)].join('\n'));
    assert.deepEqual(records.map((record) => record.usage.server_tool_use), [{ web_search_requests: 4 }, undefined]);
    assert.ok(!JSON.stringify(records).includes('SYNTHETIC_PRIVATE_QUERY'), 'the query crossed');
    const { total } = profile(records.map((record) => JSON.stringify(record)).join('\n'));
    close(total.webSearchUsd, 0.04, 'four searches');
  });

  it('takes the last snapshot of a streamed call, searches and all', () => {
    const out = claudeCodeRecords([assistant('req-1', 1), assistant('req-1', 3)].join('\n'));
    assert.equal(out.records.length, 1);
    assert.deepEqual(out.records[0].usage.server_tool_use, { web_search_requests: 3 });
    assert.equal(out.streamed, 1, 'a count that only grew was read as a disagreement');
  });
});

describe('trazum connect', () => {
  const payload = (searches) => ({
    data: [{
      starting_at: '2026-11-01T00:00:00Z',
      ending_at: '2026-11-02T00:00:00Z',
      results: [{
        model: 'claude-opus-5',
        uncached_input_tokens: 200_000,
        cache_read_input_tokens: 0,
        output_tokens: 0,
        ...(searches === undefined ? {} : { server_tool_use: { web_search_requests: searches } }),
      }],
    }],
    has_more: false,
  });

  it('bills a bucket’s searches with its tokens, by model and by day', () => {
    // 200k Opus 5 input is $1.00; 250 searches $2.50.
    const report = bucketedProfile(normalizeAnthropicUsage(payload(250)), { catalogue: BUNDLED_CATALOGUE, on: ON });
    close(report.total.totalUsd, 3.5, 'total');
    assert.equal(report.total.webSearchRequests, 250);
    close(report.total.webSearchUsd, 2.5, 'searches');
    close(report.byModel[0].webSearchUsd, 2.5, 'by model');
    close(report.byDay[0].usd, 3.5, 'by day');
  });

  it('keeps the searches through the store, and reads a record without them as none', () => {
    const pull = normalizeAnthropicUsage(payload(250));
    const stored = recordsFromBuckets('anthropic', pull.buckets, Date.parse('2026-11-02T00:00:00Z'));
    assert.equal(stored[0].webSearch, 250);
    assert.equal(bucketsFromRecords(stored)[0].webSearchRequests, 250);
    const before = recordsFromBuckets('anthropic', normalizeAnthropicUsage(payload(undefined)).buckets, 0);
    assert.equal('webSearch' in before[0], false);
    assert.equal(bucketsFromRecords(before)[0].webSearchRequests, undefined);
    assert.equal(bucketsFromRecords([{ ...stored[0], webSearch: '250' }])[0].webSearchRequests, undefined);
  });
});

describe('a pricing overlay', () => {
  const overlay = (fee) => JSON.stringify({ lastReviewed: '2027-01-15', models: { 'claude-opus-5': { webSearchPerThousandUsd: fee } } });

  it('can state a contract price for searches', () => {
    const catalogue = catalogueFromOverlay(overlay(8));
    const { total } = profileUsage(line(), { catalogue, on: ON });
    close(total.webSearchUsd, 8, 'overlaid fee');
  });

  it('refuses a fee that is not a positive number', () => {
    for (const fee of [0, -10, '10']) {
      assert.throws(() => parsePricingOverlay(overlay(fee)), /webSearchPerThousandUsd/, String(fee));
    }
  });
});

describe('the gateway', () => {
  it('measures a whole response’s searches', () => {
    const usage = usageFromResponse('anthropic', {
      usage: { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 2 } },
    });
    assert.equal(usage.webSearchRequests, 2);
    assert.equal(usageFromResponse('anthropic', { usage: { input_tokens: 10, output_tokens: 5 } }).webSearchRequests, undefined);
  });

  it('takes a stream’s last count, which is cumulative like its output', () => {
    const reader = streamingUsageReader('anthropic');
    reader.push('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10,"output_tokens":1}}}\n\n');
    reader.push('event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":7,"server_tool_use":{"web_search_requests":3}}}\n\n');
    reader.push('event: message_stop\ndata: {"type":"message_stop"}\n\n');
    assert.equal(reader.done().webSearchRequests, 3);
  });
});

describe('every finding that costs a call', () => {
  it('costs its searches too, as the total does', () => {
    // Three identical turns a session, so the repeats and session-cost findings see them.
    const turns = Array.from({ length: 6 }, (_, i) => JSON.stringify({
      model: 'claude-opus-5', label: 'research', session: `s${i % 2}`,
      ts: new Date(Date.parse('2026-11-01T10:00:00Z') + i * 1_000).toISOString(),
      usage: { input_tokens: 200_000, output_tokens: 0, server_tool_use: { web_search_requests: 100 } },
    }));
    const report = profile(turns.join('\n'));
    // Each turn: $1.00 of input and $1.00 of searches.
    close(report.total.totalUsd, 12, 'total');
    close(costOf(parseUsageLine(turns[0]), BUNDLED_CATALOGUE, ON), 2, 'one call');
  });
});
