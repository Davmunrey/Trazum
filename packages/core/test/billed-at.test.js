import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  budgetPositions,
  computeSavings,
  monthOf,
  profileUsage,
  repriceProfile,
} from '../dist/index.js';

/**
 * Every figure drawn from a call prices it the way the bill does.
 *
 * 2.4.3 taught the total to bill each call at its own moment. The findings
 * drawn from the same calls did not learn it: conversation cost, retries,
 * repeats, the TTL verdict and the session ledger priced at the report's date,
 * so a DeepSeek conversation held at peak was costed off-peak in the row
 * beneath a total that had it at peak. They now go through the same two
 * questions the total asks, `billedAt` and `promptSizeOf`. Alongside it, three
 * places priced with numbers that were not the model's: a budget used one set
 * of cache ratios for every model, savings priced both sides of an edit in
 * one band, and a what-if onto a model priced by prompt length had no way to
 * say its figure was a ceiling.
 */

const close = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual}, expected ${expected}`);

describe('a finding prices a call at the moment the bill does', () => {
  it('the dearest conversation is the bill, at peak, read on a Saturday', () => {
    // Friday 2026-10-02 07:30 UTC: inside DeepSeek's 06:00-10:00 peak.
    const log = JSON.stringify({
      model: 'deepseek-v4-flash',
      ts: '2026-10-02T07:30:00Z',
      session: 's1',
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    });
    const report = profileUsage(log, {
      catalogue: BUNDLED_CATALOGUE,
      on: new Date('2026-10-03T12:00:00Z'),
    });
    close(report.total.totalUsd, 0.3, 'the bill, at peak');
    close(report.sessionSpend.maxUsd, report.total.totalUsd, 'the conversation beneath it');
  });
});

describe('a call with no clock is billed at the date the report is given', () => {
  it('at peak, when that date is at peak, and not at some other moment', () => {
    /*
      The same million input tokens on DeepSeek V4 Flash, with no timestamp.
      `on` is the only moment the record can mean: Friday 2026-10-02 07:30 UTC,
      inside the 06:00-10:00 peak, where the row bills $0.30 per million.
      A record with no clock read as some other instant would fall outside
      that window, or before the row's 2026-09-10 price change.
    */
    const log = JSON.stringify({ model: 'deepseek-v4-flash', usage: { input_tokens: 1_000_000, output_tokens: 0 } });
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE, on: new Date('2026-10-02T07:30:00Z') });
    close(report.total.totalUsd, 0.3, 'the bill, at the given moment');
  });
});

describe('a call is priced by the size of its whole prompt', () => {
  it('counts its one-hour cache writes toward the line, as it counts every other input token', () => {
    /*
      Claude Haiku 5.5 bills a request over 100,000 input tokens at $0.50 in,
      and a one-hour write at twice that, "cache reads and writes included" in
      the count (the catalogue's row). This call carries 1,000 input tokens and
      150,000 written to the one-hour cache: 151,000, over the line.
      1,000 at $0.50 and 150,000 at $1.00 is $0.1505.
    */
    const log = JSON.stringify({
      model: 'claude-haiku-5-5',
      ts: '2026-10-05T12:00:00Z',
      usage: {
        input_tokens: 1_000,
        output_tokens: 0,
        cache_creation_input_tokens: 150_000,
        cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 150_000 },
      },
    });
    const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE });
    close(report.total.inputUsd, 0.0005, '1,000 input tokens at the over-100,000 rate');
    close(report.total.cacheWriteUsd, 0.15, '150,000 one-hour writes at the over-100,000 rate');
    close(report.total.totalUsd, 0.1505, 'the call');
  });
});

describe('a budget prices a record at its own model\'s ratios', () => {
  it('reads an Opus 5.5 cache hit at 5% of input, not 10%', () => {
    /*
      A month of one record: 1,000,000 cache-read tokens on Opus 5.5, whose
      read is $0.20 against a $4 input. The old constant read it at 10%: $0.40.
    */
    const jan = monthOf(new Date('2026-10-15T00:00:00Z'));
    const report = budgetPositions(
      [
        {
          v: 1,
          provider: 'anthropic',
          fromMs: Date.UTC(2026, 9, 1),
          toMs: Date.UTC(2026, 9, 2),
          model: 'claude-opus-5-5',
          calls: null,
          input: 0,
          cacheRead: 1_000_000,
          write5m: 0,
          write1h: 0,
          ttlKnown: true,
          output: 0,
          group: {},
          pulledAtMs: Date.UTC(2026, 9, 2),
        },
      ],
      { monthlyUsd: 100 },
      { catalogue: BUNDLED_CATALOGUE, now: new Date('2026-10-02T00:00:00Z'), period: jan },
    );
    close(report.positions[0].consumedUsd, 0.2, 'consumed');
  });
});

describe('savings price each side of an edit on its own band', () => {
  it('an edit that brings a prompt under the line saves the rate as well as the tokens', () => {
    const usage = { model: 'claude-haiku-5-5', callsPerMonth: 1, avgOutputTokens: 0, batchEligible: false };
    const report = computeSavings(120_000, 90_000, usage, new Date('2026-10-05T00:00:00Z'));
    close(report.perCall.before.totalUsd, 0.06, 'before: 120,000 at $0.50');
    close(report.perCall.after.totalUsd, 0.009, 'after: 90,000 at $0.10');
  });
});

describe('a what-if onto a model priced by prompt length', () => {
  const log = (inputTokens) =>
    JSON.stringify({
      model: 'claude-sonnet-5-5',
      ts: '2026-10-05T12:00:00Z',
      label: 'agent',
      usage: { input_tokens: inputTokens, output_tokens: 0 },
    });
  const whatIf = (lines) =>
    repriceProfile(
      profileUsage(lines.join('\n'), { catalogue: BUNDLED_CATALOGUE }),
      'claude-haiku-5-5',
      BUNDLED_CATALOGUE,
      new Date('2026-10-05T12:00:00Z'),
    );

  it('decides a slice whose largest call is under the line', () => {
    const report = whatIf([log(40_000), log(60_000)]);
    assert.equal(report.tierCeiling, null);
    close(report.targetUsd, 0.01, '100,000 tokens at $0.10');
  });

  it('prices a slice holding a call over the line at the dearer band, and says what the cheaper would be', () => {
    const report = whatIf([log(40_000), log(160_000)]);
    assert.deepEqual(report.tierCeiling?.slices, 1);
    close(report.targetUsd, 0.1, '200,000 tokens at the dearer $0.50');
    close(report.tierCeiling.targetFloorUsd, 0.02, 'the same at $0.10');
  });
});
