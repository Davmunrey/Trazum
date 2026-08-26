import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BUNDLED_CATALOGUE,
  MIN_SCALE_DAYS,
  labelCoverage,
  measuredUsage,
  profileUsage,
} from '@trazum/core';

/**
 * The usage profile, measured instead of typed. Hand arithmetic throughout:
 * Claude Opus 5 is $5/MTok input, so 200k input tokens are $1.00.
 */

const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...over,
});

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
  });

describe('measuredUsage', () => {
  it('measures calls, output size and cache share instead of guessing them', () => {
    const m = measuredUsage(
      profile([
        call({ ts: '2026-08-01T09:00:00Z', usage: { input_tokens: 100_000, cache_read_input_tokens: 100_000, output_tokens: 400 } }),
        call({ ts: '2026-08-11T09:00:00Z', usage: { input_tokens: 100_000, cache_read_input_tokens: 100_000, output_tokens: 600 } }),
      ]),
      'chat',
    );
    assert.equal(m.calls, 2);
    assert.equal(m.profile.avgOutputTokens, 500);
    // Token share, and named as such: half the input tokens were cache reads.
    assert.ok(Math.abs(m.cacheReadShare - 0.5) < 1e-9);
    assert.equal(m.profile.model, 'claude-opus-5');
    assert.equal(m.outputUnmeasured, false);
  });

  it('counts cache writes as input, so a rewritten cache cannot report a high hit rate', () => {
    /**
     * The share was `reads / (input + reads)`, which leaves cache writes out of
     * the total it claims to be a share of. A workload that rewrites its prefix
     * on every call and reads it back rarely then reports a **high** hit rate.
     *
     * That is the worst direction for this number to be wrong in: it is handed
     * to `optimize` as `cacheHitRate`, which decides whether caching is paying
     * off, so the shape burning money on writes was the one most likely to be
     * told its cache was working perfectly.
     *
     * Hand arithmetic: 100 read, 0 plain input, 9,900 written. Reads are 1% of
     * the 10,000 input tokens. The old expression answers 100%.
     */
    const m = measuredUsage(
      profile([
        call({
          ts: '2026-08-01T09:00:00Z',
          usage: {
            input_tokens: 0,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 9_900,
            output_tokens: 10,
          },
        }),
      ]),
      'chat',
    );

    assert.ok(
      Math.abs(m.cacheReadShare - 0.01) < 1e-9,
      `writes were left out of the denominator: share is ${m.cacheReadShare}, expected 0.01`,
    );
    // Stated the other way round so the failure names the symptom rather than
    // an arithmetic near-miss: this must never read as a healthy cache.
    assert.ok(m.cacheReadShare < 0.5, 'a cache rewritten on every call reported a majority hit rate');
    assert.equal(m.profile.cacheHitRate, m.cacheReadShare);
  });

  it('scales to a month only when the span covers a full week, and says how', () => {
    // Ten days, two calls: the factor is 3 and the arithmetic is visible.
    const scaled = measuredUsage(
      profile([
        call({ ts: '2026-08-01T09:00:00Z' }),
        call({ ts: '2026-08-11T09:00:00Z' }),
      ]),
      'chat',
    );
    assert.notEqual(scaled.scaled, null);
    assert.ok(Math.abs(scaled.scaled.fromDays - 10) < 0.01);
    assert.equal(scaled.profile.callsPerMonth, 6);

    // Three days: under the week floor. The count stays raw and `scaled` says
    // so — a Tuesday with a multiplier is not a monthly figure.
    const short = measuredUsage(
      profile([
        call({ ts: '2026-08-01T09:00:00Z' }),
        call({ ts: '2026-08-04T09:00:00Z' }),
      ]),
      'chat',
    );
    assert.equal(short.scaled, null);
    assert.equal(short.profile.callsPerMonth, 2);
    assert.ok(short.spanDays < MIN_SCALE_DAYS);
  });

  it('keeps the raw count when the log has no clock, and says the span is unknown', () => {
    const m = measuredUsage(profile([call(), call(), call()]), 'chat');
    assert.equal(m.spanDays, null);
    assert.equal(m.scaled, null);
    assert.equal(m.profile.callsPerMonth, 3);
  });

  it('names the chosen model and its share when the slice used several', () => {
    const m = measuredUsage(
      profile([
        call({ usage: { input_tokens: 2_000_000, output_tokens: 0 } }),
        call({ model: 'claude-haiku-4-5', usage: { input_tokens: 200_000, output_tokens: 0 } }),
      ]),
      'chat',
    );
    // Opus carries $10.00 of $10.20: it is the model handed over, at ~98%.
    assert.equal(m.models.chosen, 'claude-opus-5');
    assert.equal(m.models.count, 2);
    assert.ok(m.models.chosenShareOfSpend > 0.97 && m.models.chosenShareOfSpend < 0.99);
  });

  it('returns null for a label with nothing priced, never a zero-call profile', () => {
    assert.equal(measuredUsage(profile([call()]), 'nope'), null);
  });

  it('says when output was never measured rather than reporting zero as a size', () => {
    const m = measuredUsage(profile([call(), call()]), 'chat');
    assert.equal(m.outputUnmeasured, true);
    assert.equal(m.profile.avgOutputTokens, 0);
  });
});

describe('labelCoverage', () => {
  it('names both mismatches: mapped without traffic, traffic without a prompt', () => {
    const report = profile([
      call({ label: 'chat', usage: { input_tokens: 200_000, output_tokens: 0 } }),
      call({ label: 'rag', usage: { input_tokens: 2_000_000, output_tokens: 0 } }),
    ]);
    const cov = labelCoverage(report, { chat: 'prompts/chat.md', retired: 'prompts/old.md' });

    assert.deepEqual(cov.joined.map((j) => j.label), ['chat']);
    assert.deepEqual(cov.mappedWithoutTraffic, [{ label: 'retired', promptPath: 'prompts/old.md' }]);
    // rag carries $10.00 and nobody said where its prompt lives.
    assert.deepEqual(cov.trafficWithoutPrompt.map((t) => t.label), ['rag']);
  });

  it('does not report the unlabelled bucket as a workload missing a prompt', () => {
    const report = profile([call({ label: undefined })]);
    const cov = labelCoverage(report, {});
    assert.deepEqual(cov.trafficWithoutPrompt, []);
  });
});
