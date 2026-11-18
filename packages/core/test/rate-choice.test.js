import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MODELS, effectivePricing, multipliersFor } from '../dist/index.js';

/**
 * The edges of choosing a rate.
 *
 * Every test here exists because mutation testing changed a line of
 * `effectivePricing`, `holds` or `pricedAt` in `pricing.ts` and nothing failed
 * (#745). Each expected figure is one of the catalogue's own numbers, read
 * here from the row, or a number of a row written for the test; none is a
 * provider's price typed in. Each rule is quoted from where it is written:
 * `types.ts` for the fields, `pricing.ts` for `effectivePricing`.
 *
 * What these do not hold, and why, is in `docs/mutation-testing.md`: the
 * memos, which change the time and not the answer, and the two ties between
 * bands of the same input rate, which no document decides.
 */

/** A row written for the test: only what `effectivePricing` and `multipliersFor` read. */
const row = (fields) => ({
  id: 'written-for-the-test',
  displayName: 'Written for the test',
  inputPerMTok: 2,
  outputPerMTok: 12,
  contextWindow: 1_000_000,
  cacheMinTokens: null,
  capability: 'mid',
  tier: 'sonnet',
  ...fields,
});
const band = (id, tokens, inputPerMTok, outputPerMTok) => ({
  id, when: { kind: 'input-tokens-above', tokens }, inputPerMTok, outputPerMTok,
});

describe('a period of the price history', () => {
  it('without ratios of its own is priced at the row\'s, not at the defaults', () => {
    // types.ts, PricePeriod.multipliers: "absent means the row's own".
    const model = row({
      multipliers: { cacheRead: 0.25, cacheWrite5m: 1, cacheWrite1h: 1, batch: null },
      history: [{ until: '2026-06-01T00:00:00Z', inputPerMTok: 3, outputPerMTok: 18 }],
    });
    const may = new Date('2026-05-15T12:00:00Z');
    assert.equal(effectivePricing(model, may).inputPerMTok, 3, 'the period is the one in force');
    assert.deepEqual({ ...multipliersFor(model, may) }, { cacheRead: 0.25, cacheWrite5m: 1, cacheWrite1h: 1, batch: null });
    // A row with no batch API keeps its standard price for a batch call, in the period too.
    assert.equal(effectivePricing(model, may, { batch: true }).inputPerMTok, 3);
  });
});

describe('a rate by the clock, Monday to Friday', () => {
  // types.ts, ModelPricing.tiers: DeepSeek's peak is "01:00-04:00 and 06:00-10:00 UTC, Monday to Friday".
  const model = MODELS.find((m) => m.tiers?.some((tier) => tier.when.kind === 'utc-hours' && tier.when.weekdaysOnly));
  const peak = model?.tiers.find((tier) => tier.when.kind === 'utc-hours' && tier.when.weekdaysOnly);
  const hour = String(peak?.when.hours[0]).padStart(2, '0');

  it('is in the catalogue, so nothing below passes on an empty one', () => {
    assert.ok(model && peak);
  });

  it('does not apply on a Sunday, and does on the Monday after at the same hour', () => {
    const sunday = effectivePricing(model, new Date(`2026-11-15T${hour}:30:00Z`));
    assert.equal(sunday.tier.applied, null);
    assert.equal(sunday.inputPerMTok, model.inputPerMTok);
    const monday = effectivePricing(model, new Date(`2026-11-16T${hour}:30:00Z`));
    assert.equal(monday.tier.applied, peak.id);
    assert.equal(monday.inputPerMTok, peak.inputPerMTok);
    assert.equal(monday.outputPerMTok, peak.outputPerMTok);
  });

  it('is never reported as a promotion', () => {
    // pricing.ts, effectivePricing: "Tiers first, and a promotion never runs on top of one."
    assert.equal(effectivePricing(model, new Date(`2026-11-16T${hour}:30:00Z`)).promoApplied, false);
  });
});

describe('a promotion', () => {
  const model = MODELS.find((m) => m.promo !== undefined && m.tiers === undefined && m.history === undefined);

  it('applies to the last millisecond of the day it runs until, and not after', () => {
    // types.ts, promo.until: "ISO date (inclusive) the promotional price applies until."
    assert.ok(model, 'no promotion in the catalogue to hold');
    const last = new Date(`${model.promo.until}T23:59:59.999Z`);
    const inside = effectivePricing(model, last);
    assert.equal(inside.promoApplied, true);
    assert.equal(inside.inputPerMTok, model.promo.inputPerMTok);
    assert.equal(inside.outputPerMTok, model.promo.outputPerMTok);
    const after = effectivePricing(model, new Date(last.getTime() + 1));
    assert.equal(after.promoApplied, false);
    assert.equal(after.inputPerMTok, model.inputPerMTok);
  });

  it('still applies to a row whose list of conditional rates is empty, which is a row with none', () => {
    // pricing.ts, effectivePricing: "A model with no tiers gets `null`."
    const model = row({ tiers: [], promo: { inputPerMTok: 1, outputPerMTok: 6, until: '2026-12-31' } });
    const rates = effectivePricing(model, new Date('2026-11-18T12:00:00Z'));
    assert.equal(rates.tier, null);
    assert.equal(rates.promoApplied, true);
    assert.equal(rates.inputPerMTok, 1);
  });
});

describe('a band that cannot be decided is billed at the dearest candidate', () => {
  // pricing.ts, effectivePricing: a condition that could not be evaluated gets
  // "the **dearer** of the candidate rates", and "the cheapest, which is the base".
  const long = band('over-200k', 200_000, 4, 18);
  const longer = band('over-1m', 1_000_000, 6, 24);

  for (const [order, tiers] of [['in the order written', [long, longer]], ['written the other way round', [longer, long]]]) {
    it(`picks the dearest of two bands, ${order}`, () => {
      const rates = effectivePricing(row({ tiers }), new Date('2026-11-18T12:00:00Z'));
      assert.equal(rates.tier.decided, false);
      assert.equal(rates.tier.applied, 'over-1m');
      assert.equal(rates.inputPerMTok, 6);
      assert.equal(rates.outputPerMTok, 24);
      assert.deepEqual(rates.tier.floor, { inputPerMTok: 2, outputPerMTok: 12 });
      assert.equal(rates.promoApplied, false);
    });
  }

  it('picks the base when the only band is below it', () => {
    // A pricing overlay replaces a row's price and keeps its bands
    // (`{ ...model, ...patch }` in pricing-overlay.ts), so a base raised past
    // a band is a row that can arrive.
    const rates = effectivePricing(row({ inputPerMTok: 5, outputPerMTok: 20, tiers: [long] }), new Date('2026-11-18T12:00:00Z'));
    assert.equal(rates.tier.decided, false);
    assert.equal(rates.tier.applied, null);
    assert.equal(rates.inputPerMTok, 5);
    assert.equal(rates.outputPerMTok, 20);
  });

  it('is decided once the prompt is known', () => {
    const rates = effectivePricing(row({ tiers: [long, longer] }), new Date('2026-11-18T12:00:00Z'), { inputTokens: 300_000 });
    assert.equal(rates.tier.decided, true);
    assert.equal(rates.tier.applied, 'over-200k');
    assert.equal(rates.inputPerMTok, 4);
    assert.equal(rates.promoApplied, false);
  });
});
