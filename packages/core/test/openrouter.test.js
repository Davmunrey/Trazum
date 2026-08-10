import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  applyPricingOverlay,
  buildAdvisories,
  modelFrom,
  openrouterOverlay,
} from '../dist/index.js';

/**
 * Prices from a live feed, and the facts that feed does not carry.
 *
 * The bundled catalogue is a table somebody typed: stale the day after, and
 * covering only the providers whoever typed it reached for. OpenRouter publishes
 * price and context window for hundreds of models as data, which is a better
 * source than anybody's memory.
 *
 * What it does **not** publish is whether a model has prompt caching or the
 * minimum prefix it caches at — and that is the input to the largest saving
 * Trazum reports. Most of this file is about that gap being represented rather
 * than filled in.
 */

const payload = (models) => ({ data: models });
const known = new Set(BUNDLED_CATALOGUE.models.map((m) => m.id));
const build = (models, options = {}) =>
  openrouterOverlay(payload(models), { knownIds: known, lastReviewed: '2026-08-10', ...options });

describe('reading the feed', () => {
  it('converts per-token strings to per-million numbers', () => {
    // OpenRouter quotes USD per token as a decimal string: "0.000003" is three
    // dollars per million. Getting this wrong by 10^6 is not a subtle error in
    // a report whose whole output is money.
    const { overlay } = build([
      { id: 'acme/fast', name: 'Acme Fast', context_length: 128000, pricing: { prompt: '0.000003', completion: '0.000015' } },
    ]);

    assert.equal(overlay.models['acme/fast'].inputPerMTok, 3);
    assert.equal(overlay.models['acme/fast'].outputPerMTok, 15);
  });

  it('refuses a model with no usable price rather than recording zero', () => {
    /**
     * Free models quote "0" and half-priced entries sometimes quote "-1".
     *
     * Recorded at zero, both make every saving Trazum computes zero as well —
     * and a report full of $0.00 reads as "nothing to gain here" rather than as
     * "this catalogue has no price for that". They are skipped, and the skip is
     * counted so it can be reported.
     */
    const { overlay, skipped } = build([
      { id: 'acme/free', name: 'Free', context_length: 8000, pricing: { prompt: '0', completion: '0' } },
      { id: 'acme/odd', name: 'Odd', context_length: 8000, pricing: { prompt: '-1', completion: '0.00001' } },
      { id: 'acme/none', name: 'None', context_length: 8000 },
    ]);

    assert.deepEqual(Object.keys(overlay.models), []);
    assert.equal(skipped.length, 3);
    assert.deepEqual([...new Set(skipped.map((s) => s.reason))], ['no usable price']);
  });

  it('refuses a model with no context window', () => {
    const { overlay, skipped } = build([
      { id: 'acme/x', name: 'X', pricing: { prompt: '0.000001', completion: '0.000002' } },
    ]);
    assert.deepEqual(Object.keys(overlay.models), []);
    assert.deepEqual(skipped, [{ id: 'acme/x', reason: 'no context window' }]);
  });

  it('rejects a payload that is not the models endpoint', () => {
    // A 200 with an HTML body, or a different endpoint entirely. Throwing names
    // the mistake; returning an empty overlay would look like a provider that
    // has no models.
    assert.throws(() => openrouterOverlay({}, { knownIds: known, lastReviewed: '2026-08-10' }), /no "data" array/);
    assert.throws(() => openrouterOverlay('<html>', { knownIds: known, lastReviewed: '2026-08-10' }), /no "data" array/);
  });
});

describe('what it refuses to overwrite', () => {
  it('refreshes only the three things the feed actually knows', () => {
    /**
     * For a model the bundled catalogue already has, this touches price in,
     * price out and context window — and nothing else.
     *
     * `cacheMinTokens`, `caching`, `capability` and `tier` were written by
     * somebody who looked them up. The feed has no opinion on them, and
     * replacing a researched fact with a blank is not a refresh.
     */
    const id = BUNDLED_CATALOGUE.models[0].id;
    const { overlay } = build([
      { id, name: 'renamed by the feed', context_length: 12345, pricing: { prompt: '0.000009', completion: '0.00009' } },
    ]);

    assert.deepEqual(Object.keys(overlay.models[id]).sort(), [
      'contextWindow',
      'inputPerMTok',
      'outputPerMTok',
    ]);
  });

  it('so a refresh cannot damage what the bundled entry knew', () => {
    const before = BUNDLED_CATALOGUE.models[0];
    const { overlay } = build([
      { id: before.id, name: 'x', context_length: 12345, pricing: { prompt: '0.000009', completion: '0.00009' } },
    ]);
    const after = modelFrom(applyPricingOverlay(BUNDLED_CATALOGUE, overlay), before.id);

    assert.equal(after.inputPerMTok, 9, 'the price was not refreshed');
    assert.equal(after.cacheMinTokens, before.cacheMinTokens);
    assert.equal(after.caching, before.caching);
    assert.equal(after.capability, before.capability);
    assert.equal(after.displayName, before.displayName, 'the feed renamed a known model');
  });
});

describe('the facts the feed does not carry', () => {
  const added = () => {
    const { overlay } = build([
      { id: 'acme/new', name: 'Acme New', context_length: 200000, pricing: { prompt: '0.000002', completion: '0.00001' } },
    ]);
    return applyPricingOverlay(BUNDLED_CATALOGUE, overlay);
  };

  it('marks caching as unknown rather than absent or present', () => {
    const model = modelFrom(added(), 'acme/new');
    assert.equal(model.caching, 'unknown');
    assert.equal(model.cacheMinTokens, null);
    assert.equal(model.capability, 'unknown');
    assert.equal(model.tier, 'unknown');
  });

  it('and null is not zero, because zero is a claim', () => {
    // Zero would say "caches from the very first token", which is the most
    // optimistic reading available and true of nothing.
    assert.notEqual(modelFrom(added(), 'acme/new').cacheMinTokens, 0);
  });

  it('so no caching advice is offered for it', () => {
    /**
     * The two available lies are symmetrical and both are worse than silence.
     * Assume caching works and Trazum offers a saving that cannot be bought at
     * any price — the Mistral bug in a new costume. Assume it does not and
     * Trazum hides the biggest saving there is.
     */
    const prompt = `${'You are a careful assistant. '.repeat(200)}\n\nAnswer {{q}}.`;
    const usage = { model: 'acme/new', callsPerMonth: 50_000, avgOutputTokens: 300, cacheHitRate: 0.9 };

    const advisories = buildAdvisories(prompt, 1500, usage, { pricing: added() });

    const ids = advisories.map((a) => a.id);
    assert.ok(!ids.includes('prompt-caching'), `caching advised for an unknown model: ${ids}`);
    assert.ok(!ids.includes('prompt-caching-not-worth-it'), `caching ruled out for an unknown model: ${ids}`);
  });

  it('and it is never suggested as a cheaper alternative to anything', () => {
    // A model whose capability nobody recorded cannot be known to be adequate
    // for somebody else's task, however little it costs.
    const catalogue = added();
    const advisories = buildAdvisories(
      'Summarise {{doc}} in one line.',
      40,
      { model: 'claude-opus-5', callsPerMonth: 50_000, avgOutputTokens: 100, cacheHitRate: 0 },
      { pricing: catalogue },
    );

    for (const advisory of advisories) {
      assert.ok(
        !JSON.stringify(advisory).includes('acme/new'),
        `an unknown-capability model was recommended: ${advisory.id}`,
      );
    }
  });

  it('is never told to downgrade to something cheaper', () => {
    /**
     * The direction the first version of this file missed. It checked that an
     * unknown model is never *recommended* to somebody else, and never that the
     * unknown model itself escapes being told it is overpowered — which is the
     * branch the code actually guards. Removing that guard left every test
     * green.
     */
    const advisories = buildAdvisories(
      'Summarise {{doc}} in one line.',
      40,
      { model: 'acme/new', callsPerMonth: 50_000, avgOutputTokens: 100, cacheHitRate: 0 },
      { pricing: added() },
    );

    assert.ok(
      !advisories.some((a) => a.id === 'model-downgrade'),
      'a model of unrecorded capability was told it was overpowered',
    );
  });

  it('but still gets every advisory that has nothing to do with capability', () => {
    /**
     * The other half, and it caught a bug: the guard was written as an early
     * `return`, which skipped `output-dominated` and
     * `contradictory-instructions` as well. An unknown capability is a reason
     * to say nothing about capability, not to stop reading the prompt.
     */
    const contradictory = 'Answer in English. Always reply in the customer\'s own language.';
    const advisories = buildAdvisories(
      contradictory,
      40,
      { model: 'acme/new', callsPerMonth: 50_000, avgOutputTokens: 4000, cacheHitRate: 0 },
      { pricing: added() },
    );

    const ids = advisories.map((a) => a.id);
    assert.ok(
      ids.includes('contradictory-instructions') || ids.includes('output-dominated'),
      `the unknown-capability guard swallowed unrelated advisories: ${ids.join(', ') || '(none)'}`,
    );
  });

  it('a known model still gets its caching advice, so the guard is not a blanket', () => {
    // The other half. If `unknown` had been implemented by switching caching
    // advice off, every one of these tests would still pass.
    const prompt = `${'You are a careful assistant. '.repeat(200)}\n\nAnswer {{q}}.`;
    const advisories = buildAdvisories(
      prompt,
      1500,
      { model: 'claude-opus-5', callsPerMonth: 50_000, avgOutputTokens: 300, cacheHitRate: 0.9 },
      { pricing: BUNDLED_CATALOGUE },
    );

    assert.ok(
      advisories.some((a) => a.id === 'prompt-caching'),
      'a model with a known cache minimum lost its caching advice',
    );
  });
});
