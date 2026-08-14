import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  UNLABELLED,
  cacheHitRate,
  parseUsageLine,
  profileUsage,
  sharesOf,
} from '../dist/index.js';

/**
 * Reading what was actually charged, rather than estimating what a file would cost.
 *
 * Every other module here reads a prompt and reasons forward. This one reads a
 * usage log and reasons backward, and it exists because the forward direction can
 * only see the smallest line item: on an ordinary support prompt the rules recover
 * about 1% of the monthly figure while output alone was 87% of it.
 */

const profile = (lines, options = {}) =>
  profileUsage(lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    ...options,
  });

describe('reading a usage line', () => {
  it('takes the shape the Anthropic API already returns', () => {
    // Nothing invented. A response object with `model` and `usage` is what somebody
    // has without writing a transformer, and a tool that demands a bespoke schema
    // before it will read anything does not get run twice.
    const record = parseUsageLine(
      JSON.stringify({
        model: 'claude-opus-5',
        usage: {
          input_tokens: 1500,
          output_tokens: 500,
          cache_read_input_tokens: 12000,
          cache_creation_input_tokens: 800,
        },
      }),
    );

    assert.equal(record.model, 'claude-opus-5');
    assert.equal(record.inputTokens, 1500);
    assert.equal(record.outputTokens, 500);
    assert.equal(record.cacheReadTokens, 12000);
    assert.equal(record.cacheWriteTokens, 800);
  });

  it('takes a flattened line too, because that is what people log', () => {
    const record = parseUsageLine(
      JSON.stringify({ model: 'claude-opus-5', input_tokens: 100, output_tokens: 50 }),
    );
    assert.equal(record.inputTokens, 100);
    assert.equal(record.outputTokens, 50);
  });

  it('subtracts OpenAI cached tokens, because they are counted twice otherwise', () => {
    /**
     * The one place the two providers genuinely differ rather than just renaming.
     * Anthropic reports cache reads **beside** `input_tokens`; OpenAI reports them
     * **inside** `prompt_tokens`. Treating them the same bills the cached half at
     * the full rate as well as the cached rate.
     */
    const record = parseUsageLine(
      JSON.stringify({
        model: 'gpt-5',
        usage: {
          prompt_tokens: 10000,
          completion_tokens: 400,
          prompt_tokens_details: { cached_tokens: 9000 },
        },
      }),
    );

    assert.equal(record.inputTokens, 1000, 'the cached tokens were billed twice');
    assert.equal(record.cacheReadTokens, 9000);
    assert.equal(record.outputTokens, 400);
  });

  it('refuses a line that is not a usage record', () => {
    // Each of these would otherwise become a zero-cost call, inflating the call
    // count while contributing nothing — which lowers every per-call figure.
    assert.equal(parseUsageLine('{ not json'), null);
    assert.equal(parseUsageLine('[]'), null);
    assert.equal(parseUsageLine('"a string"'), null);
    assert.equal(parseUsageLine(JSON.stringify({ usage: { input_tokens: 5 } })), null, 'no model');
    assert.equal(parseUsageLine(JSON.stringify({ model: 'claude-opus-5' })), null, 'no counts');
  });
});

describe('profiling a log', () => {
  it('says where the money went, largest first', () => {
    const report = profile([
      { model: 'claude-opus-5', label: 'support', input_tokens: 1500, output_tokens: 500 },
      { model: 'claude-opus-5', label: 'support', input_tokens: 1500, output_tokens: 500 },
      { model: 'claude-haiku-4-5', label: 'classify', input_tokens: 800, output_tokens: 20 },
    ]);

    assert.equal(report.total.calls, 3);
    assert.equal(report.byLabel[0].label, 'support', 'the biggest bill is not first');
    assert.ok(report.byLabel[0].breakdown.totalUsd > report.byLabel[1].breakdown.totalUsd);
  });

  it('groups unlabelled calls rather than dropping them', () => {
    // A log nobody annotated is the common case, and refusing to read it until it
    // is annotated is how a tool goes unused.
    const report = profile([{ model: 'claude-opus-5', input_tokens: 100, output_tokens: 10 }]);
    assert.equal(report.byLabel[0].label, UNLABELLED);
    assert.equal(report.total.calls, 1);
  });

  it('keeps an unpriced model entirely out of the totals', () => {
    /**
     * The bug this test was written for, found in the first smoke run.
     *
     * Counts were accumulated **before** the price lookup could fail, so an
     * unknown model contributed its tokens to `total` and its dollars to nothing.
     * `total.inputTokens` included it and `total.inputUsd` did not, and anybody
     * dividing one by the other got a cost per token that was wrong by however
     * much of the log was unpriced — silently, and low.
     *
     * A production log **will** contain models this catalogue does not know: a
     * fine-tune, a preview, a competitor. So the split has to be exact.
     */
    const report = profile([
      { model: 'claude-opus-5', input_tokens: 1000, output_tokens: 100 },
      { model: 'a-model-nobody-priced', input_tokens: 900_000, output_tokens: 100_000 },
    ]);

    assert.equal(report.total.calls, 1, 'the unpriced call is in the priced totals');
    assert.equal(report.total.inputTokens, 1000, 'unpriced tokens leaked into the total');
    assert.equal(report.unpriced.calls, 1);
    assert.equal(report.unpriced.inputTokens, 900_000);
    assert.deepEqual(report.unpricedModels, ['a-model-nobody-priced']);

    // The property underneath: every token in the priced total is a token the
    // dollars describe. A ratio taken from this report is meaningful.
    assert.ok(report.total.totalUsd > 0);
    assert.ok(
      report.total.inputTokens + report.total.outputTokens < report.unpriced.inputTokens,
      'the fixture no longer makes the leak visible — the unpriced call must dominate',
    );
  });

  it('names the lines it could not read instead of dying or hiding them', () => {
    // Real logs have torn lines. Throwing makes the tool unusable; skipping
    // quietly makes the total wrong by an unknown amount.
    const report = profile([
      { model: 'claude-opus-5', input_tokens: 100, output_tokens: 10 },
      '{ torn',
      { model: 'claude-opus-5', input_tokens: 100, output_tokens: 10 },
    ]);
    assert.equal(report.total.calls, 2);
    assert.deepEqual(report.skippedLines, [2]);
  });

  it('reads an empty log without inventing anything', () => {
    const report = profile([]);
    assert.equal(report.total.calls, 0);
    assert.equal(report.total.totalUsd, 0);
    assert.deepEqual(sharesOf(report.total), { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 });
  });
});

describe('what the profile is for', () => {
  it('shows output dominating a bill, which is the finding prompts cannot reach', () => {
    /**
     * The sentence the module exists to produce. On this shape — a short prompt
     * and a long answer — shortening the prompt has almost nothing to work with,
     * and no amount of static analysis of a `.txt` file can say so.
     */
    const report = profile(
      Array.from({ length: 20 }, () => ({
        model: 'claude-opus-5',
        label: 'chat',
        input_tokens: 1200,
        output_tokens: 2000,
      })),
    );

    const shares = sharesOf(report.total);
    assert.ok(shares.output > 0.8, `output is only ${(shares.output * 100).toFixed(0)}% of the bill`);
    assert.ok(shares.input < 0.2);
  });

  it('measures the cache hit rate that actually happened', () => {
    const report = profile([
      { model: 'claude-opus-5', input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 9000 },
    ]);
    assert.equal(cacheHitRate(report.total), 0.9);
  });

  it('answers null rather than zero when caching was never attempted', () => {
    /**
     * "0% cache hit rate" told to somebody who never turned caching on is a finding
     * about nothing, and it would sit in a report beside real ones. Undefined is
     * not zero.
     */
    const report = profile([{ model: 'claude-opus-5', input_tokens: 1000, output_tokens: 100 }]);
    assert.equal(cacheHitRate(report.total), null);
  });

  it('does not count a cache write as a miss', () => {
    /**
     * A write is the cost of establishing an entry, not a failed read. Counting it
     * in the denominator makes a healthy cache look broken on the day it warms —
     * which is the day somebody would be looking at this number.
     */
    const warming = profile([
      { model: 'claude-opus-5', input_tokens: 0, output_tokens: 100, cache_creation_input_tokens: 9000 },
    ]);
    assert.notEqual(cacheHitRate(warming.total), 0, 'a warming cache reported as a total miss');
  });
});
