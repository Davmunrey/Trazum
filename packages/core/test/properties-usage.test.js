import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  effectivePricing,
  listModels,
  priceTokensOn,
  profileUsage,
  receiptFrom,
  repriceProfile,
  repriceReceipt,
} from '../dist/index.js';
import { CASES, Draw, replayWith } from './support/random.mjs';

/**
 * The money, held to identities rather than to expected answers.
 *
 * A usage log is the one input this package takes from a machine it does not
 * control, and every figure the product prints is downstream of what happens to
 * it here. The example suites check what a hand-written log produces; these
 * check the statements the module makes about itself over logs nobody wrote:
 * the slices add to the total, the order lines arrive in changes nothing,
 * adding a record never makes a bill smaller, and a price is a finite
 * non-negative number for every model in the catalogue on every date it can be
 * asked about.
 *
 * Doctrine: [An example only contains what somebody thought of](../../../docs/doctrine.md#an-example-only-contains-what-somebody-thought-of)
 */

const draw = new Draw();
const ON = new Date('2026-08-20T00:00:00Z');
const profile = (text) => profileUsage(text, { catalogue: BUNDLED_CATALOGUE, on: ON });
const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) < tolerance;

describe('a usage log, whatever arrives in it', () => {
  it('never throws, on any text at all', () => {
    /*
      A log is lines somebody's tooling wrote, and half the value of reading one
      is being handed the half that is not JSON. An exception here is a crashed
      command on the file a customer most wants read.
    */
    for (let n = 0; n < CASES; n += 1) {
      const text = draw.chance(0.5) ? draw.usageLog() : String(JSON.stringify(draw.anything()));
      assert.doesNotThrow(
        () => profile(text),
        `${replayWith('usage')} — threw on ${JSON.stringify(text).slice(0, 120)}`,
      );
    }
  });

  it('has slices that add up to its own total', () => {
    for (let n = 0; n < CASES; n += 1) {
      const report = profile(draw.usageLog());
      const summed = report.byLabelAndModel.reduce(
        (sum, slice) => sum + slice.breakdown.totalUsd,
        0,
      );
      assert.ok(
        near(summed, report.total.totalUsd, 1e-6),
        `${replayWith('usage')} — slices sum to ${summed}, total says ${report.total.totalUsd}`,
      );
      const calls = report.byLabelAndModel.reduce((sum, slice) => sum + slice.breakdown.calls, 0);
      assert.equal(calls, report.total.calls, `${replayWith('usage')} — call counts disagree`);
    }
  });

  it('agrees with itself whichever way it is grouped', () => {
    /*
      By label, by model, by both. Three foldings of one set of records, and a
      folding that dropped or double-counted a record shows up here and in no
      fixture, because a fixture has one record per label per model.
    */
    for (let n = 0; n < CASES; n += 1) {
      const report = profile(draw.usageLog());
      const byLabel = report.byLabel.reduce((sum, slice) => sum + slice.breakdown.totalUsd, 0);
      const byModel = report.byModel.reduce((sum, slice) => sum + slice.breakdown.totalUsd, 0);
      assert.ok(
        near(byLabel, byModel, 1e-6) && near(byLabel, report.total.totalUsd, 1e-6),
        `${replayWith('usage')} — by label ${byLabel}, by model ${byModel}, `
          + `total ${report.total.totalUsd}`,
      );
    }
  });

  it('does not depend on the order the lines arrived in', () => {
    /**
     * A metamorphic property. A log is a file somebody concatenated, often out
     * of order, and a total that moved when the lines did would be a total
     * nobody could reconcile against an invoice.
     */
    for (let n = 0; n < CASES; n += 1) {
      const lines = draw.list(1, 10, () => JSON.stringify(draw.usageRecord()));
      const forwards = profile(lines.join('\n'));
      const backwards = profile([...lines].reverse().join('\n'));
      assert.ok(
        near(forwards.total.totalUsd, backwards.total.totalUsd, 1e-9),
        `${replayWith('usage')} — reversing the log moved the total`,
      );
      assert.equal(forwards.total.calls, backwards.total.calls);
      assert.equal(
        forwards.byLabelAndModel.length,
        backwards.byLabelAndModel.length,
        `${replayWith('usage')} — reversing the log changed which slices exist`,
      );
    }
  });

  it('never gets cheaper when a record is added', () => {
    /**
     * Monotonicity, which is the one arithmetic property a bill cannot be
     * allowed to break. Every token class is priced at a non-negative rate, so
     * more calls is never less money — and a discount, a promotion or a cache
     * rate that came out negative would show here rather than in whatever
     * quarter somebody noticed the invoice.
     */
    for (let n = 0; n < CASES; n += 1) {
      const lines = draw.list(0, 8, () => JSON.stringify(draw.usageRecord()));
      const before = profile(lines.join('\n')).total.totalUsd;
      const after = profile([...lines, JSON.stringify(draw.usageRecord())].join('\n')).total.totalUsd;
      assert.ok(
        after >= before - 1e-9,
        `${replayWith('usage')} — adding a record took the bill from ${before} to ${after}`,
      );
    }
  });

  it('keeps what it could not price out of what it did', () => {
    /*
      An unpriced model has tokens and no rate. Folding it into the total would
      be tokens from one set of calls divided by dollars from another, which is
      the one thing a figure claiming to be a bill must never be.
    */
    for (let n = 0; n < CASES; n += 1) {
      const report = profile(draw.usageLog());
      assert.equal(
        report.unpriced.totalUsd,
        0,
        `${replayWith('usage')} — unpriced calls were given a price`,
      );
      if (report.unpriced.calls > 0) {
        assert.ok(
          report.unpricedModels.length > 0,
          `${replayWith('usage')} — unpriced calls with no model named`,
        );
      }
      for (const model of report.unpricedModels) {
        assert.equal(
          report.byLabelAndModel.some((slice) => slice.model === model),
          false,
          `${replayWith('usage')} — ${model} is both priced and unpriced`,
        );
      }
    }
  });

  it('reports a maximum that is a maximum and a sum that is a sum', () => {
    /*
      `maxCallInputTokens` is the number a repricing refuses on, and the one
      figure on a breakdown that is not additive. A version of it that summed
      would say every workload fits everywhere.
    */
    for (let n = 0; n < CASES; n += 1) {
      const report = profile(draw.usageLog());
      for (const slice of report.byLabelAndModel) {
        const { breakdown } = slice;
        if (breakdown.calls === 0) continue;
        assert.ok(
          breakdown.maxCallInputTokens <= breakdown.inputTokens + breakdown.cacheReadTokens + breakdown.cacheWriteTokens,
          `${replayWith('usage')} — a largest call exceeds the slice's own tokens`,
        );
        assert.ok(
          breakdown.maxCallInputTokens >= 0,
          `${replayWith('usage')} — a negative largest call`,
        );
      }
    }
  });
});

describe('the prices themselves', () => {
  it('are finite and non-negative for every model, on any date', () => {
    /**
     * The catalogue is the one set of numbers in this product that cannot be
     * derived from anything in the repository, so what can be checked about it
     * is its shape. A promotional window that expired into a negative rate, or
     * a long-context tier that produced `NaN` on a date nobody tested, is a
     * figure printed as money.
     */
    const models = listModels(BUNDLED_CATALOGUE);
    assert.ok(models.length > 0, 'the catalogue is empty');
    for (let n = 0; n < CASES; n += 1) {
      const model = draw.pick(models);
      const on = new Date(Date.UTC(2024 + draw.int(0, 5), draw.int(0, 11), draw.int(1, 28)));
      const { inputPerMTok, outputPerMTok } = effectivePricing(model, on);
      for (const [what, rate] of [['input', inputPerMTok], ['output', outputPerMTok]]) {
        assert.ok(
          Number.isFinite(rate) && rate >= 0,
          `${replayWith('usage')} — ${model.id} has a ${what} rate of ${rate} on ${on.toISOString()}`,
        );
      }
    }
  });

  it('cost nothing for no tokens, and more for more', () => {
    const models = listModels(BUNDLED_CATALOGUE);
    for (let n = 0; n < CASES; n += 1) {
      const model = draw.pick(models);
      const zero = {
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWrite5mTokens: 0,
        cacheWrite1hTokens: 0,
        outputTokens: 0,
      };
      assert.equal(priceTokensOn(zero, model, ON), 0, `${replayWith('usage')} — ${model.id} charges for nothing`);

      const some = { ...zero };
      const field = draw.pick(Object.keys(zero));
      some[field] = draw.int(1, 1_000_000);
      const more = { ...some, [field]: some[field] * 2 };
      assert.ok(
        priceTokensOn(more, model, ON) >= priceTokensOn(some, model, ON),
        `${replayWith('usage')} — ${model.id} got cheaper with more ${field}`,
      );
    }
  });
});

describe('repricing, asked of a profile and of the receipt it produced', () => {
  it('answers the same either way, whatever the log', () => {
    /**
     * The identity `@trazum/core` 2.1.0 was built around. A receipt is an
     * aggregate of the profile it came from, so repricing it must give the same
     * answer — every figure, every refused slice, every caveat. Two loops
     * reading two shapes would drift on **which traffic is refused**, and a
     * refusal that quietly stops happening reads as a saving.
     *
     * Held here over logs nobody wrote, rather than over the one fixture the
     * example suite uses.
     */
    const targets = listModels(BUNDLED_CATALOGUE).map((model) => model.id);
    let compared = 0;
    for (let n = 0; n < CASES; n += 1) {
      const report = profile(draw.usageLog(draw.int(1, 8)));
      if (report.byLabelAndModel.length === 0) continue;
      const target = draw.pick(targets);

      const fromProfile = repriceProfile(report, target, BUNDLED_CATALOGUE, ON);
      const fromReceipt = repriceReceipt(
        receiptFrom(report, BUNDLED_CATALOGUE, { emittedAt: ON }),
        target,
        BUNDLED_CATALOGUE,
        ON,
      );
      compared += 1;
      assert.deepEqual(
        fromReceipt,
        fromProfile,
        `${replayWith('usage')} — the receipt and the profile disagree about ${target}`,
      );
    }
    assert.ok(compared > 0, `${replayWith('usage')} — nothing was repriced; this guard inspected nothing`);
  });

  it('never counts a call the target could not have accepted', () => {
    /*
      The refusal the whole comparison rests on. A model with a smaller context
      window does not make an oversized call cheaper, it makes it impossible,
      and an impossible call's price difference counted as a saving is the
      flattering direction this repository refuses.
    */
    const models = listModels(BUNDLED_CATALOGUE);
    for (let n = 0; n < CASES; n += 1) {
      const report = profile(draw.usageLog(draw.int(1, 6)));
      const target = draw.pick(models);
      const repriced = repriceProfile(report, target.id, BUNDLED_CATALOGUE, ON);
      if (repriced === null) continue;

      for (const slice of repriced.slices) {
        assert.ok(
          slice.maxCallInputTokens <= target.contextWindow,
          `${replayWith('usage')} — a ${slice.maxCallInputTokens}-token call was priced onto `
            + `${target.id}, whose window is ${target.contextWindow}`,
        );
      }
      for (const slice of repriced.overContext) {
        assert.ok(
          slice.maxCallInputTokens > target.contextWindow,
          `${replayWith('usage')} — a call that fits was refused as over-context`,
        );
      }
    }
  });
});
