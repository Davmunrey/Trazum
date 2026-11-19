import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import * as core from '../dist/index.js';
import { BUNDLED_CATALOGUE, buildAdvisories, cheapestOfCapability, cheapestOfCapabilityIn, recommendTier, recommendTierDetailed } from '../dist/index.js';

/**
 * `recommendTier` answers in the catalogue's own words, from 3.0.0.
 *
 * It said `haiku`, `sonnet` or `opus`, the names of one vendor's ladder, about a
 * task that might be sent to any vendor's model; a model's own scale was
 * `small`, `mid` and `large`, and a translation table between the two lived in
 * the pricing module. The owner decided on 2026-11-19 that the answer moves to
 * the model's scale with no window in which both are spoken, so these hold what
 * that leaves: the answer, the names that went, and the one sentence that quotes
 * the answer to a reader.
 */

const recorded = JSON.parse(readFileSync(new URL('./fixtures/recommendations.json', import.meta.url), 'utf8'));
const on = new Date(`${recorded.on}T12:00:00Z`);

/** A name of the old ladder, quoted the way the advisory quotes its answer. */
const OLD_NAME_QUOTED = /["“](haiku|sonnet|opus)["”]/i;

describe('recommendTier answers in `small`, `mid` and `large`', () => {
  it('reads each recorded prompt as the capability the prompt is named for', () => {
    // The prompts are named for the answer they were written to draw, so a
    // mapping that moved one name (`mid` read as `small`) fails here by name.
    assert.deepEqual(Object.keys(recorded.prompts), ['small', 'mid', 'large']);
    for (const [name, [prompt, tokens]] of Object.entries(recorded.prompts)) {
      assert.equal(recommendTier(prompt, tokens), name, `a prompt written to read as ${name}`);
      assert.equal(recommendTierDetailed(prompt, tokens).capability, name);
    }
  });

  it('never answers with a name of the old ladder, or with `frontier` or `unknown`', () => {
    const seen = new Set();
    for (const tokens of [10, 200, 800, 1600, 4500, 9000]) {
      for (const prompt of [
        'Translate this sentence into English.',
        'Write a short paragraph about the weather.',
        'Analyse the architecture, design a migration and debug the agent step by step.',
        'Classify the sentiment: yes or no.',
        '```\ncode\n```\nExplain why this fails.',
        '',
      ]) {
        seen.add(recommendTier(prompt, tokens));
      }
    }
    assert.deepEqual([...seen].sort(), ['large', 'mid', 'small'], 'the sweep did not reach all three answers');
  });

  it('the detail carries `capability` and no longer `tier`', () => {
    const [prompt, tokens] = recorded.prompts.small;
    const seen = recommendTierDetailed(prompt, tokens);
    assert.equal('capability' in seen, true);
    assert.equal('tier' in seen, false, '`tier` is back on what recommendTierDetailed returns');
  });
});

describe('the lookups that take the answer take the same names', () => {
  it('cheapestOfCapability and cheapestOfCapabilityIn find a model of that capability', () => {
    for (const capability of ['small', 'mid', 'large', 'frontier']) {
      assert.equal(cheapestOfCapability(capability).capability, capability);
      assert.equal(cheapestOfCapabilityIn(BUNDLED_CATALOGUE, capability, on).capability, capability);
    }
  });

  it('a name of the old ladder finds nothing', () => {
    for (const old of ['haiku', 'sonnet', 'opus']) {
      assert.throws(() => cheapestOfCapability(old), /No models for capability/, old);
      assert.throws(() => cheapestOfCapabilityIn(BUNDLED_CATALOGUE, old, on), /No models for capability/, old);
    }
  });

  it('the old names are not exported, and nothing translates between the two vocabularies', () => {
    for (const gone of ['cheapestOfTier', 'cheapestOfTierIn', 'CAPABILITY_OF_TIER']) {
      assert.equal(gone in core, false, `\`${gone}\` is exported again`);
    }
  });
});

describe('the advisory quotes the answer in the same words', () => {
  const usageFor = (model) => ({ model, callsPerMonth: 10_000, avgOutputTokens: 400, batchEligible: false });

  it('in both languages, at each answer, for every model that is told to move down', () => {
    let quoted = 0;
    for (const locale of ['en', 'es']) {
      for (const [name, [prompt, tokens]] of Object.entries(recorded.prompts)) {
        for (const model of BUNDLED_CATALOGUE.models) {
          const advisories = buildAdvisories(prompt, tokens, usageFor(model.id), { on, locale });
          for (const advisory of advisories) {
            assert.doesNotMatch(`${advisory.title} ${advisory.detail}`, OLD_NAME_QUOTED, `${model.id} at ${name} in ${locale}`);
          }
          const downgrade = advisories.find((a) => a.id === 'model-downgrade');
          if (downgrade === undefined) continue;
          assert.ok(downgrade.detail.includes(`"${name}"`), `${model.id}: the advisory does not quote "${name}" in ${locale}`);
          quoted++;
        }
      }
    }
    assert.ok(quoted > 100, `only ${quoted} advisories quoted the answer, so this checks little`);
  });
});
