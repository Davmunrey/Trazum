import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage, receiptFrom } from '../dist/index.js';

/**
 * A receipt's money adds up, and the rates beside it are not the arithmetic.
 *
 * ## The defect this file was written to stop, which was real
 *
 * The first version of the emitter published the catalogue's `inputPerMTok` and
 * `outputPerMTok` next to a dollar figure `profileUsage` had computed. Those are
 * not always the same rates. A model inside a promotional window is billed at
 * the promotion; one whose long-context tier applied is billed at the tier; and
 * **a cached read is billed at a fraction of input that no published field named
 * at all**.
 *
 * So a consumer doing the obvious thing -- tokens times the stated rate -- got a
 * number that disagreed with the stated total, with nothing on the document
 * saying which of the two to believe. In a file whose whole purpose is that a
 * figure can be recomputed by whoever receives it, that is the defect rather
 * than a rounding difference.
 *
 * ## What replaced it, and what this checks
 *
 * A line now carries the money as it was actually apportioned, split four ways,
 * and `usd` is their sum. The checks below are the ones a stranger holding a
 * receipt would want to run:
 *
 * 1. the four buckets add to the line's total, and the lines add to the
 *    document's;
 * 2. no bucket holds money for tokens that are not there, or tokens whose money
 *    went missing;
 * 3. the rate actually charged is recoverable by dividing a bucket by its
 *    tokens, which is the only way to get the cached-read rate at all;
 * 4. a cached read really is cheaper than fresh input, which is the property
 *    that makes a cache worth measuring.
 *
 * The fixture uses a model with a real cache multiplier and a real 1-hour write
 * rate, so the two buckets a naive emitter forgets are both exercised.
 */

/** Anthropic reads at 0.1x input and writes at 1.25x / 2x, so all four differ. */
const MODEL = 'claude-haiku-4-5';

const log = () =>
  [
    JSON.stringify({
      model: MODEL,
      input_tokens: 120_000,
      output_tokens: 8_000,
      cache_read_input_tokens: 400_000,
      cache_creation_input_tokens: 30_000,
      label: 'summarise',
      ts: '2026-08-01T10:00:00Z',
    }),
    /*
     * A stated TTL split, which the line above deliberately lacks. Without one
     * of each, every write lands in the 5-minute bucket and a plant that zeroes
     * the 1-hour field changes nothing -- the split would then be checked
     * against a fixture that cannot tell it apart from a total.
     */
    JSON.stringify({
      model: MODEL,
      input_tokens: 40_000,
      output_tokens: 2_500,
      cache_read_input_tokens: 90_000,
      cache_creation: { ephemeral_5m_input_tokens: 12_000, ephemeral_1h_input_tokens: 25_000 },
      label: 'classify',
      ts: '2026-08-02T10:00:00Z',
    }),
  ].join('\n');

const build = () => {
  const report = profileUsage(log(), { catalogue: BUNDLED_CATALOGUE, on: new Date('2026-08-15') });
  return { report, receipt: receiptFrom(report, BUNDLED_CATALOGUE) };
};

const cents = (a, b) => Math.abs(a - b) < 0.000001;

describe('a receipt can be added up by whoever receives it', () => {
  it('is a receipt with money in it, so the checks below are not watching zeroes', () => {
    // The failure this exists to stop: every sum below holding because every
    // figure in the document was zero, which balances perfectly.
    const { receipt } = build();
    assert.ok(receipt.lines.length >= 2, `only ${receipt.lines.length} lines`);
    assert.ok(receipt.total.usd > 0, 'the receipt priced nothing');
    for (const line of receipt.lines) {
      assert.ok(line.cacheReadTokens > 0, `${line.label} exercises no cached reads`);
    }
  });

  it('adds each line s four buckets to that line s total', () => {
    const { receipt } = build();
    for (const line of receipt.lines) {
      const { inputUsd, cacheReadUsd, cacheWriteUsd, outputUsd } = line.money;
      assert.ok(
        cents(inputUsd + cacheReadUsd + cacheWriteUsd + outputUsd, line.usd),
        `${line.label}/${line.model}: buckets sum to ${inputUsd + cacheReadUsd + cacheWriteUsd + outputUsd}, usd says ${line.usd}`,
      );
    }
  });

  it('adds the lines to the document total', () => {
    const { receipt } = build();
    const summed = receipt.lines.reduce((total, line) => total + line.usd, 0);
    assert.ok(cents(summed, receipt.total.usd), `lines sum to ${summed}, total says ${receipt.total.usd}`);
  });

  it('never holds money in a bucket with no tokens in it', () => {
    /**
     * The direction a defect actually takes: an emitter that put a whole line's
     * money in `inputUsd` would still balance, and this is what sees it. Cache
     * writes are exempt in the second fixture line, which has none -- so the
     * check is that money and tokens are absent together, not merely that both
     * are present.
     */
    const { receipt } = build();
    for (const line of receipt.lines) {
      const pairs = [
        ['input', line.inputTokens, line.money.inputUsd],
        ['cache read', line.cacheReadTokens, line.money.cacheReadUsd],
        ['cache write', line.cacheWriteTokens, line.money.cacheWriteUsd],
        ['output', line.outputTokens, line.money.outputUsd],
      ];
      for (const [what, tokens, usd] of pairs) {
        assert.equal(tokens > 0, usd > 0, `${line.label}: ${what} has ${tokens} tokens and $${usd}`);
      }
    }
  });

  it('splits cache writes by TTL, and the two add to the whole', () => {
    /**
     * The ratio between the TTLs is not a constant across providers, so a total
     * that has lost the split can be repriced only by guessing at it.
     *
     * The second assertion is what makes the first a check. With every write in
     * the 5-minute bucket -- which is what an unstated TTL produces, and what
     * this fixture's first line still exercises -- zeroing the 1-hour field
     * changes nothing at all, and a guard that cannot notice a field being
     * dropped is not guarding it.
     */
    const { receipt } = build();
    for (const line of receipt.lines) {
      assert.ok(
        cents(line.cacheWrite5mTokens + line.cacheWrite1hTokens, line.cacheWriteTokens),
        `${line.label}: TTL split does not add to the write total`,
      );
    }
    assert.ok(
      receipt.lines.some((line) => line.cacheWrite1hTokens > 0),
      'no line carries a 1-hour write, so the split above is checking one bucket against itself',
    );
  });
});

describe('the rate that was really charged is recoverable', () => {
  it('recovers a cached-read rate no published field names', () => {
    /**
     * The reason the money split exists at all. Nothing in `pricing` says what
     * a cached read costs -- the catalogue holds it as a multiplier of input --
     * so before this, the one figure a consumer most wanted was the one they
     * could not get.
     */
    const { receipt } = build();
    const line = receipt.lines.find((entry) => entry.cacheReadTokens > 0);
    assert.ok(line, 'the fixture stopped caching');

    const perMTok = (usd, tokens) => (usd / tokens) * 1_000_000;
    const cachedRate = perMTok(line.money.cacheReadUsd, line.cacheReadTokens);
    const inputRate = perMTok(line.money.inputUsd, line.inputTokens);

    assert.ok(cachedRate > 0, 'cached reads came out free');
    assert.ok(
      cachedRate < inputRate,
      `a cached read cost ${cachedRate} per MTok against ${inputRate} for fresh input`,
    );
  });

  it('recovers an input rate that matches the published one when nothing is discounted', () => {
    /**
     * Pins that the money and the rates are describing the same model rather
     * than drifting apart. It holds only where no promotion or tier applied,
     * which is the case for this fixture and is stated rather than assumed.
     */
    const { receipt } = build();
    const line = receipt.lines[0];
    const recovered = (line.money.inputUsd / line.inputTokens) * 1_000_000;
    assert.ok(
      Math.abs(recovered - line.pricing.inputPerMTok) < 0.0001,
      `recovered ${recovered} against a published ${line.pricing.inputPerMTok}`,
    );
  });

  it('recovers an output rate the same way', () => {
    const { receipt } = build();
    const line = receipt.lines[0];
    const recovered = (line.money.outputUsd / line.outputTokens) * 1_000_000;
    assert.ok(Math.abs(recovered - line.pricing.outputPerMTok) < 0.0001, `recovered ${recovered}`);
  });
});

describe('a receipt says when its total is a floor', () => {
  it('reports an assumed write TTL as a gap, because the figure is then a floor', () => {
    /**
     * A log that records a cache write without saying how long it lives gets
     * the cheaper of the two rates. That is the right assumption and it is the
     * flattering one, so the document has to say it was made: a total resting
     * on it is a floor on those calls, and `counting: 'counted'` beside a
     * silent assumption claims a precision the document does not have.
     */
    const { report, receipt } = build();
    const assumed = report.byLabelAndModel.reduce(
      (sum, slice) => sum + slice.breakdown.assumedWriteTtlCalls,
      0,
    );
    assert.ok(assumed > 0, 'the fixture stopped exercising an unstated TTL');

    const gap = receipt.gaps.find((entry) => entry.kind === 'assumed-write-ttl');
    assert.ok(gap, 'a receipt resting on an assumed rate reported no gap');
    assert.equal(gap.calls, assumed);
  });

  it('reports no such gap when every TTL was stated', () => {
    // "Nothing was assumed" and "this document does not track assumptions" are
    // different statements, and only the second is worth nothing to a reader.
    const stated = JSON.stringify({
      model: MODEL,
      input_tokens: 1_000,
      output_tokens: 100,
      ts: '2026-08-01T10:00:00Z',
    });
    const report = profileUsage(stated, { catalogue: BUNDLED_CATALOGUE, on: new Date('2026-08-15') });
    const receipt = receiptFrom(report, BUNDLED_CATALOGUE);
    assert.equal(
      receipt.gaps.some((entry) => entry.kind === 'assumed-write-ttl'),
      false,
      'a receipt with no cache writes claimed to have assumed a TTL',
    );
  });
});
