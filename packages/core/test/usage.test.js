import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  UNLABELLED,
  cacheEconomics,
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
    // A flat write count with no TTL stated lands on the 5-minute rate, and the
    // record says the rate was assumed rather than read.
    assert.equal(record.cacheWrite5mTokens, 800);
    assert.equal(record.cacheWrite1hTokens, 0);
    assert.equal(record.writeTtlKnown, false);
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

  it('refuses a line whose count is present but unreadable', () => {
    /**
     * Absent and corrupt are different, and conflating them cost the whole bill.
     *
     * One helper returned a fallback for both, so `"200000"` out of `jq` or a
     * `null` out of a Postgres round-trip became a clean zero indistinguishable
     * from a real one. The record survived, its token class vanished, and it never
     * reached `skippedLines` — so nothing said a number had been thrown away.
     *
     * Measured on a two-line log: $0.0150 against a true $2.015, with the headline
     * flipped to "output is 100% of this bill" on a workload that was almost
     * entirely prompt. The advice was the exact opposite of correct.
     */
    for (const bad of ['"200000"', 'null', '-5', 'true', '{}']) {
      const line = `{"model":"claude-opus-5","usage":{"input_tokens":${bad},"output_tokens":300}}`;
      assert.equal(parseUsageLine(line), null, `a count of ${bad} was accepted as zero`);
    }
  });

  it('still treats a genuinely absent count as zero', () => {
    // The other half. Somebody who logs only what they care about is not corrupt,
    // and rejecting their whole log would be the fix overshooting.
    const record = parseUsageLine(JSON.stringify({ model: 'claude-opus-5', output_tokens: 300 }));
    assert.ok(record, 'a log with only output was rejected');
    assert.equal(record.inputTokens, 0);
    assert.equal(record.outputTokens, 300);
  });

  it('reads the cache-write TTL split, because the two rates differ', () => {
    /**
     * Anthropic charges 1.25x input for a 5-minute cache entry and **2x** for a
     * 1-hour one. Reading only the flat `cache_creation_input_tokens` threw the
     * distinction away and priced everything at the cheaper rate: a 1-hour
     * workload reported 37.5% under, on its largest line, silently.
     */
    const record = parseUsageLine(
      JSON.stringify({
        model: 'claude-opus-5',
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 10_000,
          cache_creation: { ephemeral_5m_input_tokens: 4_000, ephemeral_1h_input_tokens: 6_000 },
        },
      }),
    );

    assert.equal(record.cacheWrite5mTokens, 4_000);
    assert.equal(record.cacheWrite1hTokens, 6_000);
    assert.equal(record.writeTtlKnown, true);
  });

  it('says when it had to assume a TTL rather than assuming quietly', () => {
    // Only the flat count: which rate applies is unknowable, so the cheaper one is
    // used and the record admits it. Choosing the cheaper rate in silence is the
    // flattering direction.
    const record = parseUsageLine(
      JSON.stringify({ model: 'claude-opus-5', input_tokens: 100, cache_creation_input_tokens: 9_000 }),
    );
    assert.equal(record.cacheWrite5mTokens, 9_000);
    assert.equal(record.writeTtlKnown, false, 'it assumed a rate without saying so');
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

  it('prices a 1-hour cache write at 2x, not 1.25x', () => {
    // The exact scenario an adversarial reviewer found: 10M tokens of 1-hour cache
    // writes on Opus 5. Anthropic bills 10M x $5/MTok x 2.0 = $100.
    const report = profile([
      {
        model: 'claude-opus-5',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 10_000_000,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 10_000_000 },
        },
      },
    ]);

    assert.equal(Math.round(report.total.cacheWriteUsd), 100, 'the 1-hour rate is not applied');
    assert.equal(report.total.assumedWriteTtlCalls, 0, 'a stated TTL was recorded as assumed');
  });

  it('counts the calls whose TTL it had to assume', () => {
    const report = profile([
      { model: 'claude-opus-5', input_tokens: 10, cache_creation_input_tokens: 5_000 },
      { model: 'claude-opus-5', input_tokens: 10, cache_creation_input_tokens: 0 },
    ]);
    // Only the call with actual writes is an assumption; zero writes assume nothing.
    assert.equal(report.total.assumedWriteTtlCalls, 1);
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

describe('did caching pay for itself', () => {
  /**
   * The question nothing else in this repository can answer, and the only finding
   * here that can contradict the advice Trazum gives everywhere else.
   *
   * A cache write costs 1.25x plain input on Anthropic and 2x at the one-hour TTL.
   * A prefix rebuilt faster than it is reused pays that premium and gets nothing
   * back, so the workload is cheaper with caching switched off — and every other
   * report in the package, including the cache hit rate two functions up, would
   * describe that bill as healthy.
   */

  const opus = (extra) => ({ model: 'claude-opus-5', input_tokens: 100, output_tokens: 100, ...extra });
  const write5m = (tokens) => opus({ cache_creation: { ephemeral_5m_input_tokens: tokens, ephemeral_1h_input_tokens: 0 } });
  const write1h = (tokens) => opus({ cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: tokens } });
  const read = (tokens) => opus({ cache_read_input_tokens: tokens });

  it('says so when the cache cost more than it saved', () => {
    /**
     * Ten calls, each rebuilding the same 10,000-token prefix and never reading it
     * back. Opus 5 input is $5/MTok, so 100,000 written tokens are $0.625 at the
     * 1.25x write rate against $0.500 as plain input: caching added $0.125.
     *
     * Checked against the arithmetic rather than a recorded string, because a
     * snapshot of a wrong number is a test that defends the bug.
     */
    const report = profile(Array.from({ length: 10 }, () => write5m(10_000)));
    const cache = cacheEconomics(report.total);

    assert.equal(cache.verdict, 'lost-money');
    assert.ok(Math.abs(cache.spentUsd - 0.625) < 1e-9, `spent ${cache.spentUsd}`);
    assert.ok(Math.abs(cache.withoutCachingUsd - 0.5) < 1e-9, `without ${cache.withoutCachingUsd}`);
    assert.ok(Math.abs(cache.deltaUsd - 0.125) < 1e-9, `delta ${cache.deltaUsd}`);
    assert.equal(cache.readsPerWrite, 0);
  });

  it('charges the one-hour TTL its own premium, which is four times the loss', () => {
    /**
     * The same ten calls at the 1-hour rate: 2x input rather than 1.25x, so the
     * premium over not caching is $0.50 rather than $0.125. Pricing both TTLs the
     * same is the fault this whole area was rewritten for, and a verdict that
     * cannot tell them apart would report a quarter of the real loss.
     */
    const hour = cacheEconomics(profile(Array.from({ length: 10 }, () => write1h(10_000))).total);
    const minute = cacheEconomics(profile(Array.from({ length: 10 }, () => write5m(10_000))).total);

    assert.equal(hour.verdict, 'lost-money');
    assert.ok(Math.abs(hour.deltaUsd - 0.5) < 1e-9, `1h delta ${hour.deltaUsd}`);
    assert.ok(hour.deltaUsd > minute.deltaUsd * 3.9, 'the 1-hour TTL was not costed above the 5-minute one');
  });

  it('says so when the cache did its job', () => {
    /**
     * Written once, read nine times: $0.0625 of write plus $0.045 of reads against
     * $0.50 as plain input. Negative is the good direction here, which is the
     * opposite of the sign convention everywhere else in Trazum and the reason the
     * verdict is a word rather than a number for a caller to interpret.
     */
    const cache = cacheEconomics(profile([write5m(10_000), ...Array.from({ length: 9 }, () => read(10_000))]).total);

    assert.equal(cache.verdict, 'paid-off');
    assert.ok(Math.abs(cache.deltaUsd + 0.3925) < 1e-9, `delta ${cache.deltaUsd}`);
    assert.equal(cache.readsPerWrite, 9);
  });

  it('does not accuse a provider whose writes cost no more than input', () => {
    /**
     * OpenAI-style automatic caching writes at 1x, so it cannot lose money and the
     * user could not switch it off if it did. A verdict derived from Anthropic's
     * multipliers rather than the model's own would report a loss against a bill
     * that has none, on a knob nobody can turn.
     */
    const cache = cacheEconomics(
      profile([{ model: 'gpt-5', prompt_tokens: 100, completion_tokens: 100, cache_creation_input_tokens: 10_000 }]).total,
    );
    assert.equal(cache.verdict, 'no-difference');
    assert.equal(cache.deltaUsd, 0);
  });

  it('stays quiet when caching was never attempted', () => {
    const cache = cacheEconomics(profile([opus({})]).total);
    assert.equal(cache.verdict, 'not-attempted');
    assert.equal(cache.readsPerWrite, null);
  });

  it('refuses a verdict on tokens it could not price', () => {
    /**
     * An unpriced model contributes counts through `countInto` and never any
     * dollars, so both sides of the comparison are zero and the naive answer is
     * "no difference" — a confident claim about a bill that was never computed.
     * There is nothing to compare, and saying nothing is the only honest answer.
     */
    const report = profile([
      { model: 'some-finetune-nobody-published', input_tokens: 100, output_tokens: 100, cache_read_input_tokens: 50_000 },
    ]);
    assert.equal(cacheEconomics(report.unpriced).verdict, 'unpriced');
  });

  it('finds the loss a healthy total is hiding', () => {
    /**
     * The case this is for. `chat` saves $0.3925 and `rag` burns $0.125, so the
     * total comes to a comfortable $0.2675 saved and the cache hit rate reads 97.8%
     * — while one of the two workloads would be cheaper with caching turned off.
     * An aggregate is exactly where that hides.
     */
    const report = profile([
      { ...write5m(10_000), label: 'chat' },
      ...Array.from({ length: 9 }, () => ({ ...read(10_000), label: 'chat' })),
      ...Array.from({ length: 10 }, () => ({ ...write5m(10_000), label: 'rag' })),
    ]);

    assert.equal(cacheEconomics(report.total).verdict, 'paid-off');
    const byLabel = Object.fromEntries(report.byLabel.map((r) => [r.label, cacheEconomics(r.breakdown).verdict]));
    assert.equal(byLabel.rag, 'lost-money', 'the losing workload was not visible per label');
    assert.equal(byLabel.chat, 'paid-off');
  });

  it('prices the counterfactual per model rather than at one blended rate', () => {
    /**
     * Haiku input is $1/MTok against Opus 5's $5. Costing the uncached equivalent
     * at a single rate would move the verdict by whichever model happened to be
     * summed — so the same tokens under two models must come to five times apart,
     * and the per-call accumulation is what makes that true.
     */
    const on = (model) =>
      cacheEconomics(
        profileUsage(
          JSON.stringify({ model, input_tokens: 100, output_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: 10_000, ephemeral_1h_input_tokens: 0 } }),
          { catalogue: BUNDLED_CATALOGUE },
        ).total,
      );
    const opusDelta = on('claude-opus-5').deltaUsd;
    const haikuDelta = on('claude-haiku-4-5').deltaUsd;
    assert.ok(opusDelta > 0 && haikuDelta > 0);
    assert.ok(Math.abs(opusDelta / haikuDelta - 5) < 1e-6, `ratio ${opusDelta / haikuDelta} — the counterfactual was not priced per model`);
  });
});

describe('the cache verdict under an unstated write TTL', () => {
  /**
   * Found by an adversarial review of the verdict this file had just gained, and
   * confirmed by four independent verifiers. It is the same fault the profile has
   * now produced twice: a rate that has to be assumed, assumed in the cheap
   * direction, and then reported as measured.
   *
   * A log carrying only the flat `cache_creation_input_tokens` cannot say which
   * TTL a write used. The total already admitted the assumption; the verdict did
   * not, and the verdict is the part that inverts. Reported delta is `0.25w -
   * 0.9r`; at the 1-hour rate the truth is `w - 0.9r`, so the **sign** disagrees
   * for any workload reading back between 0.278 and 1.111 tokens per token
   * written — an entirely ordinary shape.
   */

  const flat = (writes, reads) => [
    { model: 'claude-opus-5', input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: writes },
    { model: 'claude-opus-5', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: reads },
  ];

  it('refuses to answer when the assumed rate is what decides the answer', () => {
    /**
     * A million written, three hundred thousand read back. Opus 5 input is $5/MTok:
     * $6.40 at the assumed 1.25x against $6.50 uncached — a $0.10 saving — and
     * $10.15 at 2x, a $3.65 loss. A $3.75 swing across the sign, and the flattering
     * half was the one the log's silence selected.
     */
    const cache = cacheEconomics(profile(flat(1_000_000, 300_000)).total);

    assert.equal(cache.verdict, 'paid-off');
    assert.equal(cache.worstCaseVerdict, 'lost-money', 'the long TTL was never costed');
    assert.ok(Math.abs(cache.deltaUsd + 0.1) < 1e-9, `as recorded ${cache.deltaUsd}`);
    assert.ok(Math.abs(cache.worstCaseDeltaUsd - 3.65) < 1e-9, `at 1h ${cache.worstCaseDeltaUsd}`);
  });

  it('leaves the worst case equal to the measurement when every TTL was recorded', () => {
    /**
     * The hedge has to disappear on a well-recorded log or it is noise on every
     * report — and noise is what gets a warning ignored on the run that mattered.
     */
    const cache = cacheEconomics(
      profile([
        { model: 'claude-opus-5', input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 1_000_000, ephemeral_1h_input_tokens: 0 } },
        { model: 'claude-opus-5', input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 300_000 },
      ]).total,
    );
    assert.equal(cache.verdict, cache.worstCaseVerdict);
    assert.equal(cache.deltaUsd, cache.worstCaseDeltaUsd);
  });

  it('never makes the worst case the better one, on any model in the catalogue', () => {
    /**
     * Derived over the catalogue rather than over a list typed here. "Worst" is a
     * claim about the 1-hour multiplier being at or above the 5-minute one, and a
     * model added later with a cheaper long TTL would make the word a lie in a
     * report that prints the two as a floor and a ceiling.
     */
    for (const model of BUNDLED_CATALOGUE.models) {
      const cache = cacheEconomics(
        profileUsage(
          JSON.stringify({ model: model.id, input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 }),
          { catalogue: BUNDLED_CATALOGUE },
        ).total,
      );
      assert.ok(
        cache.worstCaseDeltaUsd >= cache.deltaUsd - 1e-9,
        `${model.id}: the 1-hour rate came out cheaper than the 5-minute one`,
      );
    }
  });

  it('does not invent a range for a provider whose writes cost what input costs', () => {
    // Both multipliers are 1 on gpt-5, so there is no assumption to be wrong
    // about and the hedge must stay silent rather than manufacture a doubt.
    const cache = cacheEconomics(
      profile([{ model: 'gpt-5', prompt_tokens: 0, completion_tokens: 0, cache_creation_input_tokens: 1_000_000 }]).total,
    );
    assert.equal(cache.deltaUsd, cache.worstCaseDeltaUsd);
    assert.equal(cache.worstCaseVerdict, 'no-difference');
  });
});
