import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { MODELS, effectivePricing, multipliersFor, profileUsage, BUNDLED_CATALOGUE } from '../dist/index.js';

/**
 * A price is not always one number, and the catalogue only just learned it.
 *
 * Two providers were read off their own pages on 2026-08-28 and neither charges
 * the way this table was shaped:
 *
 * - **DeepSeek V4 bills by the clock.** Peak is 01:00-04:00 and 06:00-10:00 UTC
 *   on weekdays, off-peak is exactly half, and peak is 35 hours of 168. One
 *   number would have been wrong by 2x in whichever direction it was chosen —
 *   and wrong *without saying so*, which is the part that matters.
 * - **Gemini 3.1 Pro bills by prompt size**, $2/$12 up to 200k input tokens and
 *   $4/$18 above.
 *
 * The first is decidable everywhere, because every caller of `effectivePricing`
 * already passes the date it is pricing for. The second is decidable only where
 * the token count is known, and this file's job is that the difference is never
 * papered over: an undecided tier returns the **dearer** rate and says it was
 * not decided, so the figure is a ceiling a reader has been told about rather
 * than a floor chosen for looking better.
 */

const ROOT = new URL('../../../', import.meta.url).pathname;
const tiered = MODELS.filter((model) => model.tiers !== undefined && model.tiers.length > 0);

/** Friday 07:30 UTC: inside the 06:00-10:00 window. */
const PEAK = new Date('2026-08-28T07:30:00Z');
/** Saturday 07:30 UTC: the same hour, and the weekend rules it out. */
const WEEKEND = new Date('2026-08-29T07:30:00Z');
/** Friday 12:30 UTC: a weekday outside both windows. */
const QUIET = new Date('2026-08-28T12:30:00Z');

describe('a conditional rate is decided, or is said not to be', () => {
  it('has tiered models at all, so nothing below passes on an empty catalogue', () => {
    assert.ok(tiered.length > 0, 'no model declares a tier, so this file checks nothing');
  });

  it('charges the clock tier on a weekday inside the window', () => {
    const flash = MODELS.find((model) => model.id === 'deepseek-v4-flash');
    assert.ok(flash, 'deepseek-v4-flash is not in the catalogue');

    const peak = effectivePricing(flash, PEAK);
    assert.equal(peak.inputPerMTok, 0.44);
    assert.equal(peak.outputPerMTok, 1.32);
    assert.equal(peak.tier.applied, 'peak');
    assert.equal(peak.tier.decided, true);
    // The sentence a reader checks against the provider's page.
    assert.match(peak.tier.because, /06:00-10:00 UTC/);
    assert.match(peak.tier.because, /Monday to Friday/);
  });

  it('charges the base rate at the same hour on a Saturday', () => {
    /**
     * The half a naive implementation gets wrong and nobody notices, because
     * the hour matches and the weekday check is one `&&` somebody can drop.
     * Off-peak is the common case here: peak is 35 hours of 168.
     */
    const flash = MODELS.find((model) => model.id === 'deepseek-v4-flash');
    const weekend = effectivePricing(flash, WEEKEND);
    assert.equal(weekend.inputPerMTok, 0.22);
    assert.equal(weekend.tier.applied, null);
    assert.equal(weekend.tier.decided, true, 'a clock tier is always decidable');
  });

  it('charges the base rate on a weekday outside every window', () => {
    const flash = MODELS.find((model) => model.id === 'deepseek-v4-flash');
    const quiet = effectivePricing(flash, QUIET);
    assert.equal(quiet.inputPerMTok, 0.22);
    assert.equal(quiet.tier.decided, true);
  });

  it('reads the hour list as the hours a window covers, not its endpoints', () => {
    /**
     * `01:00-04:00` is three hours and is written `[1, 2, 3]`. Written
     * `[1, 4]` it would charge peak at 04:30 and off-peak at 02:30, which is
     * exactly inverted and would look right in review. Checked at every hour of
     * a weekday rather than at the two the catalogue happens to name.
     */
    const flash = MODELS.find((model) => model.id === 'deepseek-v4-flash');
    const peakHours = [];
    for (let hour = 0; hour < 24; hour += 1) {
      const at = new Date(Date.UTC(2026, 7, 28, hour, 30));
      if (effectivePricing(flash, at).tier.applied === 'peak') peakHours.push(hour);
    }
    assert.deepEqual(peakHours, [1, 2, 3, 6, 7, 8, 9], 'the peak window is not the published one');
  });

  it('prices a cache read at each tier, from the published dollars', () => {
    /**
     * The provider publishes four cache-hit prices for these two models and
     * this checks all four, in dollars, rather than checking a ratio against
     * itself. `$0.007` off-peak and `$0.014` at peak on Flash; `$0.022` and
     * `$0.044` on Pro.
     *
     * A tier carries no multiplier of its own, and this is the test that says
     * why it does not need one: the ratio is 3.18% at both DeepSeek rates to
     * the last digit, so multiplying the tier's input rate by the model's
     * multiplier already lands on the provider's number. The first draft gave
     * `PricingTier` a `multipliers` field and then could not write a test that
     * told its presence from its absence, which is the argument for removing
     * it rather than for keeping it just in case.
     */
    /*
      Dated since 2026-09-10, when DeepSeek cut Flash's price and its cache
      ratio with it: the first two rows are V4 Flash before the cut, the next
      four are V4.1 Flash and the retired V4 Flash id after it, both billed at
      the new price ($0.003 off-peak, $0.006 at peak).
    */
    const AFTER_PEAK = new Date('2026-10-07T07:30:00Z'); // a Wednesday, peak
    const AFTER_WEEKEND = new Date('2026-10-10T12:00:00Z'); // a Saturday
    const published = [
      ['deepseek-v4-flash', PEAK, 0.014],
      ['deepseek-v4-flash', WEEKEND, 0.007],
      ['deepseek-v4-flash', AFTER_PEAK, 0.006],
      ['deepseek-v4-flash', AFTER_WEEKEND, 0.003],
      ['deepseek-flash', AFTER_PEAK, 0.006],
      ['deepseek-flash', AFTER_WEEKEND, 0.003],
      ['deepseek-v4-pro', PEAK, 0.044],
      ['deepseek-v4-pro', WEEKEND, 0.022],
    ];
    for (const [id, when, expected] of published) {
      const model = MODELS.find((entry) => entry.id === id);
      const rates = effectivePricing(model, when);
      const cacheRead = rates.inputPerMTok * multipliersFor(model, when).cacheRead;
      assert.ok(
        Math.abs(cacheRead - expected) < 0.0005,
        `${id} at ${when.toISOString()} reads cache at ${cacheRead}, published ${expected}`,
      );
    }
  });

  it('gives the dearer rate when a condition cannot be decided, and says so', () => {
    /**
     * The rule this whole field exists to make possible. A size tier priced
     * without a token count is not knowable, so the answer is the ceiling and
     * the answer says it is not decided. A floor picked for looking better is
     * the flattering direction, and this product's whole argument is that it
     * does not take it.
     */
    const made = {
      id: 'made-up',
      displayName: 'Made Up',
      inputPerMTok: 2,
      outputPerMTok: 12,
      contextWindow: 1_000_000,
      cacheMinTokens: 1024,
      capability: 'large',
      tier: 'opus',
      tiers: [
        { id: 'long', when: { kind: 'input-tokens-above', tokens: 200_000 }, inputPerMTok: 4, outputPerMTok: 18 },
      ],
    };

    const unknown = effectivePricing(made, PEAK);
    assert.equal(unknown.inputPerMTok, 4, 'an undecided tier returned the cheaper rate');
    assert.equal(unknown.outputPerMTok, 18);
    assert.equal(unknown.tier.decided, false);
    assert.match(unknown.tier.because, /200,000 input tokens/);
    assert.match(unknown.tier.because, /token count was not given/);

    const short = effectivePricing(made, PEAK, { inputTokens: 1000 });
    assert.equal(short.inputPerMTok, 2, 'a short prompt was charged the long-prompt rate');
    assert.equal(short.tier.decided, true);
    assert.equal(short.tier.applied, null);

    const long = effectivePricing(made, PEAK, { inputTokens: 200_001 });
    assert.equal(long.inputPerMTok, 4);
    assert.equal(long.tier.applied, 'long');
    assert.equal(long.tier.decided, true);

    // The boundary is *above*, exactly as the provider words it.
    assert.equal(effectivePricing(made, PEAK, { inputTokens: 200_000 }).tier.applied, null);
  });

  it('leaves a model with no tiers exactly as it was', () => {
    // Every other model in the catalogue, and the reason this field could be
    // added at all: 31 call sites keep working because nothing changed for them.
    const opus = MODELS.find((model) => model.id === 'claude-opus-5');
    const rates = effectivePricing(opus, PEAK);
    assert.equal(rates.inputPerMTok, 5);
    assert.equal(rates.outputPerMTok, 25);
    assert.equal(rates.tier, null, 'a model with no tiers reported one');
    assert.equal(rates.promoApplied, false);
  });
});

describe('an alias is a statement about billing, and cannot be about two models', () => {
  /**
   * Found by planting, and the plant was the point: claiming `mistral-large-2`
   * as an alias of `mistral-large-2512` passed everything. That is not a
   * cosmetic collision. An alias declares *this id bills at exactly this rate*,
   * so an id that is both a model of its own and an alias of another has two
   * prices in one table, and whichever one a lookup happens to find is the one
   * somebody's bill gets computed at.
   *
   * The dangerous version of exactly that shape is already in this catalogue: a
   * **retired** model claimed as an alias of its own replacement would price a
   * refused id at the live rate and quietly delete the historical one, which is
   * the row a usage log full of old calls needs.
   *
   * What this cannot check is whether the provider agrees an alias exists. That
   * is a statement reviewed the way a price is reviewed — though for Mistral it
   * was measured: `GET /v1/models` declares `mistral-large-latest` and
   * `mistral-large-2512` as aliases of each other.
   */
  it('never uses another model\'s id as an alias', () => {
    const ids = new Set(MODELS.map((model) => model.id));
    const collisions = [];
    for (const model of MODELS) {
      for (const alias of model.aliases ?? []) {
        if (ids.has(alias)) collisions.push(`${model.id} claims ${alias}, which is a model of its own`);
      }
    }
    assert.deepEqual(collisions, [], 'an id is priced twice at two different rates');
  });

  it('never lets two models claim the same alias', () => {
    // The other half. Two entries claiming one alias is the same defect from
    // the other side: the id resolves to whichever the lookup reaches first.
    const claimed = new Map();
    const twice = [];
    for (const model of MODELS) {
      for (const alias of model.aliases ?? []) {
        if (claimed.has(alias)) twice.push(`${alias} is claimed by ${claimed.get(alias)} and ${model.id}`);
        claimed.set(alias, model.id);
      }
    }
    assert.deepEqual(twice, [], 'one id is claimed by two models');
  });

  it('has aliases at all, so neither check above is empty', () => {
    const withAliases = MODELS.filter((model) => (model.aliases ?? []).length > 0);
    assert.ok(withAliases.length >= 2, `only ${withAliases.length} models declare an alias`);
  });
});

describe('the catalogue declares tiers that can be reviewed', () => {
  it('gives every tier an id, and never two the same on one model', () => {
    // The id is printed, so a reader can see which rate they were charged. Two
    // tiers sharing one is a report that cannot say which applied.
    for (const model of tiered) {
      const ids = model.tiers.map((tier) => tier.id);
      assert.ok(ids.every((id) => typeof id === 'string' && id.length > 0), `${model.id} has an unnamed tier`);
      assert.equal(new Set(ids).size, ids.length, `${model.id} declares one tier id twice`);
    }
  });

  it('declares no tier that is cheaper than the base rate', () => {
    /**
     * Not a style rule. The base is what applies when nothing matches, and an
     * undecided condition falls back to the dearest candidate — so a tier
     * *below* the base would make the ceiling a floor and quietly invert the
     * whole safety argument. A provider offering a discount expresses it by
     * putting the discount in the base and the full price in the tier, which is
     * how DeepSeek is written here.
     */
    for (const model of tiered) {
      for (const tier of model.tiers) {
        assert.ok(
          tier.inputPerMTok >= model.inputPerMTok,
          `${model.id}: tier "${tier.id}" is cheaper than the base rate`,
        );
      }
    }
  });

  it('never combines a tier with a promotion', () => {
    /**
     * No provider here does both, and a model that grew both would get a rate
     * this repository composed out of two real ones — the composed figure the
     * first rule of the doctrine is about. `effectivePricing` returns the tier
     * and ignores the promotion, so the two must never appear together.
     */
    const both = tiered.filter((model) => model.promo !== undefined).map((model) => model.id);
    assert.deepEqual(both, [], 'a model declares both a tier and a promotion');
  });

  it('describes every condition in words a reviewer can check', () => {
    for (const model of tiered) {
      const decided = effectivePricing(model, PEAK, { inputTokens: 1 });
      assert.ok(decided.tier, `${model.id} produced no tier decision at all`);
      assert.ok(decided.tier.because.length > 10, `${model.id}: the reason is not a sentence`);
    }
  });

  it('is cited in the pricing prose where a reader would look for it', () => {
    // A rate that depends on the clock, documented nowhere, is a surprise on a
    // bill. Checked against the file rather than assumed.
    const doc = readFileSync(join(ROOT, 'docs/commands.md'), 'utf8');
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    assert.ok(
      /peak/i.test(doc) || /peak/i.test(readme),
      'no page mentions that a priced model can charge by the clock',
    );
  });
});

describe('a price that changed is priced as it was billed then', () => {
  /**
   * DeepSeek cut Flash's price "at 04:00 UTC on Sept 10, 2026" and retired
   * V4 Flash the same day, so one id billed two ways in one month. These pin
   * the instant, not the day: 2026-09-10 is a Thursday, 03:00 UTC is peak
   * and 04:00 UTC is not, so a day-granular boundary would misprice the one
   * hour on either side that a careless cut-over gets wrong.
   */
  const flash = () => MODELS.find((entry) => entry.id === 'deepseek-v4-flash');

  it('changes at the published instant, to the millisecond', () => {
    const before = effectivePricing(flash(), new Date('2026-09-10T03:59:59.999Z'));
    assert.equal(before.inputPerMTok, 0.44, 'the last peak minute of the old price');
    const after = effectivePricing(flash(), new Date('2026-09-10T04:00:00.000Z'));
    assert.equal(after.inputPerMTok, 0.15, 'the first off-peak minute of the new price');
  });

  it('carries the cache ratio of its own period', () => {
    assert.equal(multipliersFor(flash(), new Date('2026-09-01T12:00:00Z')).cacheRead, 0.0318);
    assert.equal(multipliersFor(flash(), new Date('2026-09-20T12:00:00Z')).cacheRead, 0.02);
    // Undated, the question is about today, and today is the current price.
    assert.equal(multipliersFor(flash()).cacheRead, 0.02);
  });

  it('prices a log that straddles the change, each call at its own rate', () => {
    const line = (ts) =>
      JSON.stringify({ model: 'deepseek-v4-flash', ts, usage: { input_tokens: 1_000_000, output_tokens: 0 } });
    // Two Saturdays, both off-peak: $0.22 before the cut, $0.15 after.
    const report = profileUsage([line('2026-09-05T12:00:00Z'), line('2026-09-12T12:00:00Z')].join('\n'), {
      catalogue: BUNDLED_CATALOGUE,
    });
    assert.equal(Math.round(report.total.totalUsd * 100) / 100, 0.37);
  });

  it('bills a call at its own hour, whatever hour the report runs', () => {
    /*
      The bill priced every call at the report's date, so a DeepSeek log read
      during peak hours came out all peak and read on a Saturday all
      off-peak. One peak call and one off-peak call, read at both: the same
      $1.98 either way, $1.32 + $0.66.
    */
    const line = (ts) =>
      JSON.stringify({ model: 'deepseek-v4-pro', ts, usage: { input_tokens: 1_000_000, output_tokens: 0 } });
    const log = [line('2026-10-07T07:30:00Z'), line('2026-10-10T12:00:00Z')].join('\n');
    for (const on of [new Date('2026-10-14T07:30:00Z'), new Date('2026-10-17T12:00:00Z')]) {
      const report = profileUsage(log, { catalogue: BUNDLED_CATALOGUE, on });
      assert.equal(Math.round(report.total.totalUsd * 100) / 100, 1.98, `read at ${on.toISOString()}`);
    }
  });

  it('holds every history in the catalogue to the shape this reads', () => {
    for (const model of MODELS) {
      if (model.history === undefined) continue;
      let last = -Infinity;
      for (const period of model.history) {
        const at = new Date(period.until).getTime();
        assert.ok(Number.isFinite(at), `${model.id}: ${period.until} is not an instant`);
        assert.ok(at > last, `${model.id}: history is not earliest first`);
        assert.ok(period.inputPerMTok > 0 && period.outputPerMTok > 0, `${model.id}: a period with no price`);
        last = at;
      }
    }
  });
});

describe('the id a provider log carries is the id that prices', () => {
  it('prices OpenAI\'s dated GPT-5 snapshots, which is what a usage export names', () => {
    /*
      `gpt-5-2025-08-07` and its mini and nano siblings are the ids OpenAI's
      own usage records carry, and until 2026-10-11 they were unpriced gaps.
      Read off the deprecations page, which retires them on 2026-12-11.
    */
    for (const [snapshot, input] of [
      ['gpt-5-2025-08-07', 1.25],
      ['gpt-5-mini-2025-08-07', 0.25],
      ['gpt-5-nano-2025-08-07', 0.05],
    ]) {
      const line = JSON.stringify({ model: snapshot, usage: { input_tokens: 1_000_000, output_tokens: 0 } });
      const report = profileUsage(line, { catalogue: BUNDLED_CATALOGUE });
      assert.deepEqual(report.unpricedModels, [], `${snapshot} is unpriced`);
      assert.equal(report.total.totalUsd, input, snapshot);
    }
  });
});
