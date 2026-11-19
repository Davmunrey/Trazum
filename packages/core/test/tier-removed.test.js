import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  MODELS,
  PRICING_MODEL_KEYS,
  PricingOverlayError,
  applyPricingOverlay,
  buildAdvisories,
  catalogueFromOverlay,
  cheapestOfCapability,
  cheapestOfCapabilityIn,
  listModels,
  openrouterOverlay,
  parsePricingOverlay,
  recommendTier,
} from '../dist/index.js';
import * as core from '../dist/index.js';
import { record } from '../../../scripts/record-recommendations.mjs';

/**
 * `tier` on a model, removed in 3.0.0 (#764).
 *
 * It was deprecated in 1.8.0 in favour of `capability` and kept in step with
 * it until then. These hold the three halves of the removal: the field does
 * not come back on a model, an overlay that still writes it is refused by
 * name, and every recommendation that used to choose by it chooses by
 * `capability` and gives the answer it gave before.
 *
 * `recommendTier` and the lookups that take its answer speak `capability`
 * too, `small`, `mid` and `large`, and the recorded answers were carried over
 * to those names without changing a model: `capability-names.test.js` holds
 * the names and the surfaces they reach.
 */

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Every object in a JSON document that is a model: it has a price and a window. */
function modelsIn(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) modelsIn(item, found);
  } else if (value !== null && typeof value === 'object') {
    if ('inputPerMTok' in value && 'contextWindow' in value) found.push(value);
    for (const item of Object.values(value)) modelsIn(item, found);
  }
  return found;
}

describe('`tier` does not come back on a model', () => {
  it('not in the type', () => {
    const types = withoutComments(source('../src/types.ts'));
    const start = types.indexOf('export interface ModelPricing {');
    assert.notEqual(start, -1, 'ModelPricing is not where this test looks for it');
    const body = types.slice(start, types.indexOf('\n}', start));
    assert.doesNotMatch(body, /^\s*(readonly\s+)?tier\??\s*:/m, '`tier` is a member of ModelPricing again');
    assert.match(body, /^\s*capability\s*:\s*Capability;/m, 'the replacement is not where it was');
  });

  it('not in the catalogue', () => {
    assert.ok(MODELS.length > 0);
    for (const list of [MODELS, listModels(), BUNDLED_CATALOGUE.models]) {
      for (const model of list) {
        assert.equal('tier' in model, false, `${model.id} carries \`tier\``);
        assert.ok(model.capability, `${model.id} has no capability`);
      }
    }
  });

  it('not in a JSON document that carries a model', () => {
    // The catalogue as JSON is what `GET /api/optimize` serves, and the
    // OpenRouter overlay is what `--pricing-live` writes; both carry models
    // whole. The web route is called for real in apps/web/test/api.test.mjs,
    // and the `ownrate` snippet is parsed in packages/cli/test/switch-cli.test.js.
    const fromFeed = openrouterOverlay(
      { data: [{ id: 'acme/new', name: 'Acme New', context_length: 32_000, pricing: { prompt: '0.000001', completion: '0.000002' } }] },
      { knownIds: new Set(), lastReviewed: '2027-01-15' },
    );
    const documents = {
      catalogue: JSON.parse(JSON.stringify(listModels())),
      'openrouter overlay': JSON.parse(JSON.stringify(fromFeed.overlay)),
    };
    for (const [name, document] of Object.entries(documents)) {
      const models = modelsIn(document);
      assert.ok(models.length > 0, `${name}: no model in it, so nothing was checked`);
      for (const model of models) assert.equal('tier' in model, false, `${name} carries \`tier\` on a model`);
    }
  });

  it('not among the keys an overlay may write', () => {
    assert.equal(PRICING_MODEL_KEYS.includes('tier'), false);
    assert.ok(PRICING_MODEL_KEYS.includes('capability'));
  });
});

describe('an overlay that writes `tier` is refused', () => {
  const refusal = (fn) => {
    let caught;
    try {
      fn();
    } catch (error) {
      caught = error;
    }
    assert.ok(caught, 'an overlay with `tier` was accepted');
    assert.ok(caught instanceof PricingOverlayError, `refused, but not as an overlay error: ${caught}`);
    return caught.message;
  };

  it('on a model the catalogue has, naming the key and its replacement', () => {
    for (const tier of ['haiku', 'sonnet', 'opus', 'frontier', 'unknown', 'enormous']) {
      const message = refusal(() =>
        parsePricingOverlay(JSON.stringify({ lastReviewed: '2027-01-15', models: { 'claude-opus-5': { tier } } }), 'overlay.json'),
      );
      assert.match(message, /"models\.claude-opus-5\.tier"/, 'the refusal does not name the key');
      assert.match(message, /"capability"/, 'the refusal does not say what to write instead');
      assert.match(message, /^overlay\.json: /, 'the refusal does not name the file');
    }
  });

  it('on a new model that is otherwise complete, `capability` included', () => {
    const message = refusal(() =>
      catalogueFromOverlay(
        JSON.stringify({
          lastReviewed: '2027-01-15',
          models: {
            'acme-1': { displayName: 'Acme 1', inputPerMTok: 1, outputPerMTok: 2, contextWindow: 8000, cacheMinTokens: null, capability: 'mid', tier: 'sonnet' },
          },
        }),
      ),
    );
    assert.match(message, /"models\.acme-1\.tier"/);
  });

  it('when the overlay is handed over as an object, which no parser read', () => {
    const message = refusal(() =>
      applyPricingOverlay(BUNDLED_CATALOGUE, { lastReviewed: '2027-01-15', models: { 'claude-opus-5': { inputPerMTok: 6, tier: 'opus' } } }),
    );
    assert.match(message, /"models\.claude-opus-5\.tier"/);
  });

  it('a patch that is not an object is left to the checks that were there before', () => {
    const catalogue = applyPricingOverlay(BUNDLED_CATALOGUE, { lastReviewed: '2027-01-15', models: { 'claude-opus-5': null } });
    assert.deepEqual(catalogue.byId.get('claude-opus-5'), BUNDLED_CATALOGUE.byId.get('claude-opus-5'));
  });

  it('and the same overlay without it is read', () => {
    const catalogue = catalogueFromOverlay(JSON.stringify({ lastReviewed: '2027-01-15', models: { 'claude-opus-5': { capability: 'large' } } }));
    assert.equal(catalogue.byId.get('claude-opus-5').capability, 'large');
    assert.equal('tier' in catalogue.byId.get('claude-opus-5'), false);
  });
});

describe('recommendations choose by `capability`, and give the answers they gave before', () => {
  /**
   * Recorded from the tree before the removal, where they chose by `tier`.
   * Every model in the catalogue, at three prompts the heuristic reads as
   * `small`, `mid` and `large`, and the cheapest of each capability by provider.
   * A catalogue change that moves one of these answers is a recommendation
   * changing: `node scripts/record-recommendations.mjs` writes the file again
   * from the build; read its diff, commit it with the change and say why.
   */
  const recorded = JSON.parse(source('./fixtures/recommendations.json'));
  const on = new Date(`${recorded.on}T12:00:00Z`);
  const or = (fn) => {
    try {
      return fn().id;
    } catch {
      return null;
    }
  };

  /** The model a `model-downgrade` advisory names, read from the catalogue's own names. */
  const candidateIn = (advisory, model) => {
    if (!advisory) return null;
    const named = MODELS.filter(
      (m) => m.provider === model.provider && m.id !== model.id && advisory.detail.includes(m.displayName),
    ).sort((a, b) => b.displayName.length - a.displayName.length);
    assert.ok(named.length > 0, `${model.id}: the advisory names no model of its provider`);
    return named[0].id;
  };

  it('the file is what scripts/record-recommendations.mjs writes from this build', () => {
    // So the script that a price change runs cannot drift from the file it
    // rewrites: the same questions, asked of this build, give this text.
    assert.equal(record(core, recorded), source('./fixtures/recommendations.json'));
  });

  it('the heuristic reads the three prompts as it did', () => {
    for (const [name, [prompt, tokens]] of Object.entries(recorded.prompts)) {
      assert.equal(recommendTier(prompt, tokens), recorded.recommendTier[name], name);
    }
  });

  it('the cheapest of each capability', () => {
    for (const [capability, id] of Object.entries(recorded.cheapestOfCapability)) {
      assert.equal(or(() => cheapestOfCapability(capability)), id, `cheapestOfCapability(${capability})`);
      for (const [provider, expected] of Object.entries(recorded.cheapestOfCapabilityIn[capability])) {
        const found = or(() => cheapestOfCapabilityIn(BUNDLED_CATALOGUE, capability, on, provider === '*' ? undefined : provider));
        assert.equal(found, expected, `cheapestOfCapabilityIn(${capability}, ${provider})`);
      }
    }
  });

  it('the cheaper model every catalogue model is offered', () => {
    let named = 0;
    for (const [id, answers] of Object.entries(recorded.downgrade)) {
      const model = BUNDLED_CATALOGUE.byId.get(id);
      assert.ok(model, `${id} left the catalogue: update the recorded answers and say why`);
      for (const [name, expected] of Object.entries(answers)) {
        const [prompt, tokens] = recorded.prompts[name];
        const usage = { model: id, callsPerMonth: 10_000, avgOutputTokens: 400, batchEligible: false };
        const advisory = buildAdvisories(prompt, tokens, usage, { on, locale: 'en' }).find((a) => a.id === 'model-downgrade');
        assert.equal(candidateIn(advisory, model), expected, `${id} at a ${name} prompt`);
        if (expected !== null) named++;
      }
    }
    assert.ok(named > 100, `only ${named} answers name a model, so this checks little`);
  });

  it('a model is ranked by the `capability` it carries', () => {
    // Nothing can write `tier` any more, so moving `capability` alone must move
    // the answer: Haiku 5.5 restated as `mid` stops being the cheapest `small`
    // and becomes the cheapest `mid`.
    const anthropic = (catalogue, capability) => or(() => cheapestOfCapabilityIn(catalogue, capability, on, 'anthropic'));
    assert.equal(anthropic(BUNDLED_CATALOGUE, 'small'), 'claude-haiku-5-5', 'the example moved: pick another');
    const moved = catalogueFromOverlay(JSON.stringify({ lastReviewed: '2027-01-15', models: { 'claude-haiku-5-5': { capability: 'mid' } } }));
    assert.notEqual(anthropic(moved, 'small'), 'claude-haiku-5-5');
    assert.equal(anthropic(moved, 'mid'), 'claude-haiku-5-5');

    // And the advisory, on two models an overlay adds with no provider.
    const added = catalogueFromOverlay(
      JSON.stringify({
        lastReviewed: '2027-01-15',
        models: {
          'acme-big': { displayName: 'Acme Big', inputPerMTok: 10, outputPerMTok: 40, contextWindow: 200_000, cacheMinTokens: null, capability: 'large' },
          'acme-small': { displayName: 'Acme Small', inputPerMTok: 1, outputPerMTok: 4, contextWindow: 200_000, cacheMinTokens: null, capability: 'small' },
          'acme-odd': { displayName: 'Acme Odd', inputPerMTok: 5, outputPerMTok: 20, contextWindow: 200_000, cacheMinTokens: null, capability: 'unknown' },
        },
      }),
    );
    const [prompt, tokens] = recorded.prompts.small;
    const advise = (model) =>
      buildAdvisories(prompt, tokens, { model, callsPerMonth: 10_000, avgOutputTokens: 400, batchEligible: false }, { on, pricing: added, locale: 'en' })
        .find((a) => a.id === 'model-downgrade');
    assert.match(advise('acme-big')?.detail ?? '', /Acme Small/, 'a `large` model was not offered the `small` one');
    assert.equal(advise('acme-odd'), undefined, 'a model of unrecorded capability was told it is overpowered');
    // `unknown` is a name the lookups take as well, and it finds `unknown`.
    assert.equal(or(() => cheapestOfCapabilityIn(added, 'unknown', on)), 'acme-odd');
  });
});
