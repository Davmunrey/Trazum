import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

// The pure half is on the main entry point; only the loader needs "/node".
// Splitting the imports here is also the shape a consumer should copy.
import {
  BUNDLED_CATALOGUE,
  catalogueFromOverlay,
  cheapestOfTierIn,
  modelFrom,
  optimize,
  parsePricingOverlay,
  withExactTokenCounts,
} from '../dist/index.js';
import { loadConfig } from '../dist/node.js';

const scratch = () => mkdtemp(join(tmpdir(), 'trazum-pricing-'));

const overlay = (models, lastReviewed = '2027-01-15') =>
  JSON.stringify({ lastReviewed, models });

describe('the bundled catalogue', () => {
  it('is a value, not module state', () => {
    // An overlay must not change what any other caller sees. Two catalogues have
    // to be able to coexist in one process, or this is a global mutable price
    // list wearing a function's clothes.
    const before = modelFrom(BUNDLED_CATALOGUE, 'claude-opus-5').inputPerMTok;
    const overlaid = catalogueFromOverlay(overlay({ 'claude-opus-5': { inputPerMTok: 99 } }));

    assert.equal(modelFrom(overlaid, 'claude-opus-5').inputPerMTok, 99);
    assert.equal(
      modelFrom(BUNDLED_CATALOGUE, 'claude-opus-5').inputPerMTok,
      before,
      'applying an overlay mutated the bundled catalogue',
    );
  });

  it('reports nothing overridden', () => {
    assert.deepEqual(BUNDLED_CATALOGUE.overriddenModels, []);
    assert.deepEqual(BUNDLED_CATALOGUE.addedModels, []);
  });
});

describe('applying an overlay', () => {
  it('replaces only the fields it names', () => {
    const before = modelFrom(BUNDLED_CATALOGUE, 'claude-opus-5');
    const after = modelFrom(
      catalogueFromOverlay(overlay({ 'claude-opus-5': { inputPerMTok: 7 } })),
      'claude-opus-5',
    );

    assert.equal(after.inputPerMTok, 7);
    assert.equal(after.outputPerMTok, before.outputPerMTok, 'an unnamed field changed');
    assert.equal(after.contextWindow, before.contextWindow);
    assert.equal(after.displayName, before.displayName);
  });

  it('says which models it touched', () => {
    const catalogue = catalogueFromOverlay(
      overlay({
        'claude-opus-5': { inputPerMTok: 7 },
        'claude-sonnet-5': { inputPerMTok: 4 },
      }),
    );
    assert.deepEqual(catalogue.overriddenModels, ['claude-opus-5', 'claude-sonnet-5']);
    assert.deepEqual(catalogue.addedModels, []);
  });

  it('takes the overlay date, not the bundled one', () => {
    // A catalogue is only as current as its most recently touched half. Reporting
    // the bundled date over corrected prices would be a lie about provenance.
    const catalogue = catalogueFromOverlay(
      overlay({ 'claude-opus-5': { inputPerMTok: 7 } }, '2027-03-01'),
    );
    assert.equal(catalogue.lastReviewed, '2027-03-01');
    assert.notEqual(catalogue.lastReviewed, BUNDLED_CATALOGUE.lastReviewed);
  });

  it('can add a model the bundled catalogue does not have', () => {
    const catalogue = catalogueFromOverlay(
      overlay({
        'claude-future-6': {
          displayName: 'Claude Future 6',
          inputPerMTok: 2,
          outputPerMTok: 8,
          contextWindow: 2_000_000,
          cacheMinTokens: 256,
          tier: 'opus',
          capability: 'large',
        },
      }),
    );
    assert.deepEqual(catalogue.addedModels, ['claude-future-6']);
    assert.equal(modelFrom(catalogue, 'claude-future-6').inputPerMTok, 2);
    assert.equal(catalogue.models.length, BUNDLED_CATALOGUE.models.length + 1);
  });

  it('refuses a half-defined new model', () => {
    // Overriding one field of a known model needs only that field. Inventing a
    // model needs all of them: a missing price would compute as undefined
    // somewhere and report a saving that does not exist.
    assert.throws(
      () => catalogueFromOverlay(overlay({ 'claude-future-6': { inputPerMTok: 2 } })),
      /has to be complete. Missing: displayName, outputPerMTok, contextWindow, cacheMinTokens, tier/,
    );
  });

  it('can withdraw a promotion with null', () => {
    // Sonnet 5 ships with introductory pricing. When a promotion ends early, the
    // overlay has to be able to remove it, not just change its numbers.
    assert.ok(modelFrom(BUNDLED_CATALOGUE, 'claude-sonnet-5').promo, 'fixture assumes a promo');
    const catalogue = catalogueFromOverlay(overlay({ 'claude-sonnet-5': { promo: null } }));
    assert.equal(modelFrom(catalogue, 'claude-sonnet-5').promo, undefined);
  });

  it('ranks a tier on the effective price, promotion included', () => {
    const on = new Date('2026-07-01T00:00:00Z');
    // Scoped to one provider, as the advisory does: switching vendor is a
    // migration rather than a cheaper model, and unscoped this now finds a
    // GPT model that costs a fifth of any Claude one.
    // Sonnet 5's introductory 2/10 beats Sonnet 4.6's 3/15 while it is live.
    assert.equal(
      cheapestOfTierIn(BUNDLED_CATALOGUE, 'sonnet', on, 'anthropic').id,
      'claude-sonnet-5',
    );
    // Withdraw it and the two tie on list price, so the first listed wins —
    // deterministic either way, which is the property that matters.
    const withdrawn = catalogueFromOverlay(overlay({ 'claude-sonnet-5': { promo: null } }));
    assert.ok(
      ['claude-sonnet-5', 'claude-sonnet-4-6'].includes(
        cheapestOfTierIn(withdrawn, 'sonnet', on, 'anthropic').id,
      ),
    );
  });

  it('searches the whole catalogue when no provider is named', () => {
    // The documented default, kept so the signature stayed additive. Nothing in
    // this repository calls it that way — the advisory always names a provider —
    // but a caller who wants "cheapest anywhere" can ask for it.
    const on = new Date('2026-07-01T00:00:00Z');
    const anywhere = cheapestOfTierIn(BUNDLED_CATALOGUE, 'sonnet', on);
    const anthropic = cheapestOfTierIn(BUNDLED_CATALOGUE, 'sonnet', on, 'anthropic');
    assert.notEqual(anywhere.provider, undefined);
    assert.ok(
      anywhere.inputPerMTok <= anthropic.inputPerMTok,
      'the unscoped search should never be dearer than a scoped one',
    );
  });
});

describe('an invalid overlay is loud', () => {
  // Same posture as the config parser, for the same reason: a typo'd model id
  // would silently price against the bundled number, and a budget decision made
  // on a price nobody applied is the failure this file exists to prevent.
  const rejects = (document, pattern) =>
    assert.throws(
      () => parsePricingOverlay(typeof document === 'string' ? document : JSON.stringify(document)),
      pattern,
    );

  it('rejects malformed JSON and non-objects', () => {
    rejects('{ "models": ', /not valid JSON/);
    rejects('[]', /top level must be an object/);
  });

  it('requires lastReviewed, and requires it to be a date', () => {
    rejects({ models: { 'claude-opus-5': { inputPerMTok: 1 } } }, /"lastReviewed" is required/);
    rejects(
      { lastReviewed: 'June 2027', models: { 'claude-opus-5': { inputPerMTok: 1 } } },
      /date like 2026-06-24/,
    );
  });

  it('rejects an unknown key and names the nearest', () => {
    rejects({ lastReviewed: '2027-01-01', model: {} }, /did you mean "models"\?/);
    rejects(
      { lastReviewed: '2027-01-01', models: { 'claude-opus-5': { inputPerMtok: 1 } } },
      /did you mean "inputPerMTok"\?/,
    );
  });

  it('rejects prices that cannot be prices', () => {
    const at = (value) => ({ lastReviewed: '2027-01-01', models: { 'claude-opus-5': { inputPerMTok: value } } });
    rejects(at(0), /greater than 0/);
    rejects(at(-1), /greater than 0/);
    rejects(at('5'), /must be a number/);
    rejects(
      { lastReviewed: '2027-01-01', models: { 'claude-opus-5': { contextWindow: 1.5 } } },
      /whole number/,
    );
  });

  it('rejects an empty models block or an empty model', () => {
    rejects({ lastReviewed: '2027-01-01', models: {} }, /non-empty object/);
    rejects(
      { lastReviewed: '2027-01-01', models: { 'claude-opus-5': {} } },
      /is empty — remove it, or say what it changes/,
    );
  });

  it('rejects a partial promotion', () => {
    // Half a promotion has no meaning: a price with no end date, or an end date
    // with no price, would either never expire or expire into nothing.
    rejects(
      { lastReviewed: '2027-01-01', models: { 'claude-opus-5': { promo: { inputPerMTok: 2 } } } },
      /needs all of inputPerMTok, outputPerMTok, until/,
    );
    rejects(
      {
        lastReviewed: '2027-01-01',
        models: { 'claude-opus-5': { promo: { inputPerMTok: 2, outputPerMTok: 8, until: 'soon' } } },
      },
      /must be a date like/,
    );
  });

  it('rejects a bad tier and an implausible id', () => {
    rejects(
      { lastReviewed: '2027-01-01', models: { 'claude-opus-5': { tier: 'enormous' } } },
      /must be one of frontier, opus, sonnet, haiku/,
    );
    rejects({ lastReviewed: '2027-01-01', models: { '../etc/passwd': { inputPerMTok: 1 } } }, /not a plausible model id/);
  });

  it('names the file it could not read', () => {
    assert.throws(() => parsePricingOverlay('{ bad', 'prices.json'), /^PricingOverlayError: prices\.json:/);
  });
});

describe('what the report says about where prices came from', () => {
  it('bundled prices report the bundled date and nothing overridden', () => {
    const result = optimize('Please summarise this text. Thank you.');
    assert.equal(result.pricingSource.lastReviewed, BUNDLED_CATALOGUE.lastReviewed);
    assert.deepEqual(result.pricingSource.overriddenModels, []);
  });

  it('overlaid prices say so, and change the money', () => {
    // Without this a figure from the bundled catalogue and a figure from
    // somebody's JSON file look identical, and a reader cannot tell which they
    // are reading.
    const usage = { model: 'claude-opus-5', callsPerMonth: 50_000, avgOutputTokens: 300 };
    const prompt = `Please could you kindly summarise this. Thank you. ${'Extra detail. '.repeat(20)}`;

    const bundled = optimize(prompt, { usage });
    const pricing = catalogueFromOverlay(
      overlay({ 'claude-opus-5': { inputPerMTok: 50 } }, '2027-05-05'),
    );
    const overlaid = optimize(prompt, { usage, pricing });

    assert.deepEqual(overlaid.pricingSource.overriddenModels, ['claude-opus-5']);
    assert.equal(overlaid.pricingSource.lastReviewed, '2027-05-05');
    assert.ok(
      overlaid.savings.monthlySavingsUsd > bundled.savings.monthlySavingsUsd,
      'a tenfold input price should change the saving',
    );
  });

  it('prices advisories against the overlay too', () => {
    // The advisories are where most of the money is. Pricing the report from one
    // catalogue and the advisories from another would be the worst of both.
    const usage = { model: 'claude-opus-5', callsPerMonth: 100_000, avgOutputTokens: 200 };
    const prompt = 'Summarise the ticket below and classify it.\n\n{{ticket}}';

    const cheap = catalogueFromOverlay(
      overlay({ 'claude-haiku-4-5': { inputPerMTok: 0.01, outputPerMTok: 0.05 } }),
    );
    const withOverlay = optimize(prompt, { usage, pricing: cheap });
    const withBundled = optimize(prompt, { usage });

    const downgrade = (r) => r.advisories.find((a) => a.id === 'model-downgrade');
    assert.ok(downgrade(withBundled), 'fixture should produce a downgrade advisory');
    assert.ok(downgrade(withOverlay), 'fixture should produce a downgrade advisory');
    assert.ok(
      downgrade(withOverlay).estimatedMonthlyUsd > downgrade(withBundled).estimatedMonthlyUsd,
      'a cheaper haiku should make the downgrade advisory worth more: ' +
        `${downgrade(withBundled).estimatedMonthlyUsd} -> ${downgrade(withOverlay).estimatedMonthlyUsd}`,
    );
  });
});

describe('loading an overlay through the config', () => {
  it('resolves the path relative to the config, not the working directory', async () => {
    // A config found by walking upward has to find its own overlay, or the
    // feature breaks precisely when the config feature is being useful.
    const root = await scratch();
    await writeFile(join(root, 'trazum.config.json'), '{"pricing":"prices.json"}');
    await writeFile(join(root, 'prices.json'), overlay({ 'claude-opus-5': { inputPerMTok: 11 } }));

    const loaded = await loadConfig({ from: root });
    assert.equal(modelFrom(loaded.pricing, 'claude-opus-5').inputPerMTok, 11);
    assert.match(loaded.pricingPath, /prices\.json$/);
  });

  it('gives the bundled catalogue when no overlay is named', async () => {
    const root = await scratch();
    await writeFile(join(root, 'trazum.config.json'), '{"level":"safe"}');

    const loaded = await loadConfig({ from: root });
    assert.equal(loaded.pricing, BUNDLED_CATALOGUE);
    assert.equal(loaded.pricingPath, null);
  });

  it('a named overlay that does not exist is an error', async () => {
    // Same reasoning as --config: somebody who points at a price list is not
    // asking for the bundled one.
    const root = await scratch();
    await writeFile(join(root, 'trazum.config.json'), '{"pricing":"nope.json"}');
    await assert.rejects(loadConfig({ from: root }), /no such pricing overlay/);
  });

  it('rejects an overlay path pointing outside the project', async () => {
    const root = await scratch();
    await writeFile(join(root, 'trazum.config.json'), '{"pricing":"../elsewhere/prices.json"}');
    await assert.rejects(loadConfig({ from: root }), /relative path inside the project/);
  });

  it('accepts a model the overlay introduces', async () => {
    // The ordering this exists to pin: validating usage.model before reading the
    // overlay would reject a config that is correct.
    const root = await scratch();
    await writeFile(
      join(root, 'trazum.config.json'),
      JSON.stringify({ pricing: 'prices.json', usage: { model: 'claude-future-6' } }),
    );
    await writeFile(
      join(root, 'prices.json'),
      overlay({
        'claude-future-6': {
          displayName: 'Claude Future 6',
          inputPerMTok: 2,
          outputPerMTok: 8,
          contextWindow: 2_000_000,
          cacheMinTokens: 256,
          tier: 'opus',
          capability: 'large',
        },
      }),
    );

    const loaded = await loadConfig({ from: root });
    assert.equal(loaded.config.usage.model, 'claude-future-6');
  });

  it('still rejects a model nothing defines, just later', async () => {
    const root = await scratch();
    await writeFile(join(root, 'trazum.config.json'), JSON.stringify({ usage: { model: 'gpt-9' } }));
    await assert.rejects(loadConfig({ from: root }), /names no such model: "gpt-9"/);
  });

  it('suggests the nearest model on a typo', async () => {
    const root = await scratch();
    await writeFile(
      join(root, 'trazum.config.json'),
      JSON.stringify({ usage: { model: 'claude-opus-4' } }),
    );
    await assert.rejects(loadConfig({ from: root }), /did you mean "claude-opus-5"\?/);
  });
});

describe('recomputing with exact counts', () => {
  it('refuses to silently revert to bundled prices', async () => {
    // The token counts would come from one source and the money from another, and
    // the report would disagree with itself with nothing to show why.
    const pricing = catalogueFromOverlay(overlay({ 'claude-opus-5': { inputPerMTok: 50 } }));
    const result = optimize('Please summarise this. Thank you.', {
      usage: { model: 'claude-opus-5' },
      pricing,
    });

    await assert.rejects(
      withExactTokenCounts(result, async () => 100),
      /needs the same catalogue passed as its third argument/,
    );

    // And works when given it.
    const recomputed = await withExactTokenCounts(result, async () => 100, pricing);
    assert.equal(recomputed.tokenSource, 'external');
    assert.deepEqual(recomputed.pricingSource.overriddenModels, ['claude-opus-5']);
  });

  it('needs no catalogue when none was used', async () => {
    const result = optimize('Please summarise this. Thank you.');
    const recomputed = await withExactTokenCounts(result, async () => 100);
    assert.equal(recomputed.tokenSource, 'external');
  });
});
