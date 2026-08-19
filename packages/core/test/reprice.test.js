import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BUNDLED_CATALOGUE, profileUsage, repriceProfile } from '../dist/index.js';

/**
 * The same tokens at another model's rates.
 *
 * Hand arithmetic throughout. Claude Opus 5 is $5/MTok input and $25/MTok
 * output; Claude Haiku 4.5 is $1/MTok and $5/MTok. So 200k input tokens are
 * $1.00 on Opus and $0.20 on Haiku, and 40k output tokens are $1.00 on Opus
 * and $0.20 on Haiku. Every figure below is checkable without running
 * anything.
 */

const ON = new Date('2026-08-18T00:00:00Z');
const HAIKU = 'claude-haiku-4-5';

const profile = (records) =>
  profileUsage(records.map((r) => JSON.stringify(r)).join('\n'), {
    catalogue: BUNDLED_CATALOGUE,
    on: ON,
  });

const call = (over = {}) => ({
  model: 'claude-opus-5',
  label: 'chat',
  usage: { input_tokens: 200_000, output_tokens: 0 },
  ...over,
});

const reprice = (records, target = HAIKU) =>
  repriceProfile(profile(records), target, BUNDLED_CATALOGUE, ON);

const near = (actual, expected, what) =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: ${actual} !== ${expected}`);

describe('repricing a profile onto another model', () => {
  it('states the current bill, the target bill and the difference', () => {
    // 200k input: $1.00 on Opus, $0.20 on Haiku.
    const out = reprice([call()]);
    near(out.currentUsd, 1, 'current');
    near(out.targetUsd, 0.2, 'target');
    near(out.deltaUsd, -0.8, 'delta');
  });

  it('prices input and output separately, because their rates differ', () => {
    // 200k input + 40k output: $2.00 on Opus, $0.40 on Haiku.
    const out = reprice([call({ usage: { input_tokens: 200_000, output_tokens: 40_000 } })]);
    near(out.currentUsd, 2, 'current');
    near(out.targetUsd, 0.4, 'target');
  });

  it('reprices each cache write TTL at its own rate', () => {
    // 200k at the 1-hour rate is 2x input: $2.00 on Opus, $0.40 on Haiku.
    // Pricing both TTLs at 1.25x would report $0.25 for the Haiku side.
    const out = reprice([
      call({
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 200_000 },
        },
      }),
    ]);
    near(out.currentUsd, 2, 'current');
    near(out.targetUsd, 0.4, 'target');
  });

  it('refuses to price a slice holding a call the target could not accept', () => {
    // Haiku 4.5's window is 200k tokens; a 250k-token call does not fit, so
    // the move is not cheaper — it is impossible, and pricing it would call
    // an impossibility a saving.
    const out = reprice([call({ label: 'huge', usage: { input_tokens: 250_000, output_tokens: 0 } })]);
    assert.equal(out.slices.length, 0);
    assert.equal(out.overContext.length, 1);
    assert.equal(out.overContext[0].label, 'huge');
    assert.equal(out.overContext[0].maxCallInputTokens, 250_000);
    // And its money is in none of the totals.
    near(out.currentUsd, 0, 'current');
    near(out.deltaUsd, 0, 'delta');
  });

  it('judges the ceiling on the largest call, not the slice total', () => {
    // Two 150k calls are 300k tokens in the slice and both fit; a mean or a
    // sum would reject them.
    const out = reprice([
      call({ usage: { input_tokens: 150_000, output_tokens: 0 } }),
      call({ usage: { input_tokens: 150_000, output_tokens: 0 } }),
    ]);
    assert.equal(out.overContext.length, 0);
    assert.equal(out.slices.length, 1);
    assert.equal(out.slices[0].maxCallInputTokens, 150_000);
  });

  it('counts cache reads and writes toward the ceiling', () => {
    // 150k fresh input plus 100k read is a 250k-token request.
    const out = reprice([
      call({
        usage: { input_tokens: 150_000, output_tokens: 0, cache_read_input_tokens: 100_000 },
      }),
    ]);
    assert.equal(out.overContext.length, 1);
    assert.equal(out.overContext[0].maxCallInputTokens, 250_000);
  });

  it('keeps calls already on the target out of both totals', () => {
    // $10 already on Haiku next to $1 on Opus: folding the $10 in would report
    // a difference of 7% on a bill where the movable part drops by 80%.
    const out = reprice([
      call(),
      call({ model: HAIKU, label: 'cheap', usage: { input_tokens: 10_000_000, output_tokens: 0 } }),
    ]);
    near(out.alreadyOnTarget.usd, 10, 'already there');
    assert.equal(out.alreadyOnTarget.calls, 1);
    near(out.currentUsd, 1, 'current');
    near(out.deltaUsd, -0.8, 'delta');
  });

  it('orders slices by the largest saving first', () => {
    // 'big' is five 200k calls — 1M input tokens, none of them over the
    // ceiling. $5.00 on Opus and $1.00 on Haiku. 'small' is 40k: $0.20 and
    // $0.04.
    const out = reprice([
      call({ label: 'small', usage: { input_tokens: 40_000, output_tokens: 0 } }),
      ...Array.from({ length: 5 }, () => call({ label: 'big' })),
    ]);
    assert.deepEqual(
      out.slices.map((s) => s.label),
      ['big', 'small'],
    );
    near(out.slices[0].deltaUsd, -4, 'biggest delta');
    near(out.slices[1].deltaUsd, -0.16, 'smallest delta');
  });

  it('reports a move that costs more as costing more', () => {
    // Haiku to Fable 5 ($10/MTok input) is 10x, and the sign says so.
    const out = reprice([call({ model: HAIKU })], 'claude-fable-5');
    near(out.currentUsd, 0.2, 'current');
    near(out.targetUsd, 2, 'target');
    near(out.deltaUsd, 1.8, 'delta');
  });

  it('names the models it could not price, since their difference is unknowable', () => {
    const out = reprice([call(), { model: 'ft:acme-internal', usage: { input_tokens: 900_000 } }]);
    assert.deepEqual(out.unpricedModels, ['ft:acme-internal']);
    assert.equal(out.unpricedCalls, 1);
  });

  it('carries the assumed write TTL through, because both sides inherit it', () => {
    const out = reprice([
      call({ usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 200_000 } }),
    ]);
    assert.equal(out.assumedWriteTtlCalls, 1);
  });

  it('returns null for a model the catalogue does not know', () => {
    assert.equal(reprice([call()], 'gpt-imaginary'), null);
  });

  it('says out loud that the token counts are assumed to survive the move', () => {
    assert.equal(reprice([call()]).sameTokensAssumed, true);
  });

  it('flags cache traffic the target could not grant, with the no-cache price', () => {
    // A 400-token call with cache reads, against Haiku's 4,096-token cache
    // minimum: no call in the slice could create an entry, so the standard
    // repriced figure grants rates the target would refuse — an error in the
    // flattering direction. The no-cache figure is the honest one: all 400
    // tokens at Haiku's full $1/MTok input rate = $0.0004 per call.
    const [slice] = reprice([
      call({ usage: { input_tokens: 100, cache_read_input_tokens: 300, output_tokens: 0 } }),
    ]).slices;
    assert.notEqual(slice.cacheBeyondTarget, null);
    assert.equal(slice.cacheBeyondTarget.minTokens, 4096);
    near(slice.cacheBeyondTarget.noCacheUsd, 400 / 1_000_000, 'no-cache price');
    // And the no-cache figure is above the discounted one, as it must be:
    // cache reads at 0.1x are the cheaper lie.
    assert.ok(slice.cacheBeyondTarget.noCacheUsd > slice.targetUsd);
  });

  it('stays silent when the calls clear the minimum, or never cached at all', () => {
    // 200k tokens clear any minimum in the catalogue.
    const [cleared] = reprice([
      call({ usage: { input_tokens: 100_000, cache_read_input_tokens: 100_000, output_tokens: 0 } }),
    ]).slices;
    assert.equal(cleared.cacheBeyondTarget, null);

    // No cache traffic: nothing for the minimum to refuse.
    const [uncached] = reprice([
      call({ usage: { input_tokens: 400, output_tokens: 0 } }),
    ]).slices;
    assert.equal(uncached.cacheBeyondTarget, null);
  });
});
