import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { SPAWN_ENV } from './env.mjs';

import { BUNDLED_CATALOGUE, BAND_CALIBRATED_PROVIDER, bandGoverns } from '@trazum/core';

const CLI = new URL('../dist/index.js', import.meta.url).pathname;

/**
 * The estimator's band belongs to one family, and so does the exact counter.
 *
 * `±10%` is measured against Claude's tokenizer over twenty-one samples.
 * `--exact-tokens` counts with Anthropic's endpoint. Both facts were true and
 * neither was enforced, so three claims escaped the family they were measured
 * in:
 *
 * 1. `optimize --exact-tokens --model gpt-5` handed **the user's own model id**
 *    to Anthropic's `count_tokens`. Either a confusing upstream error, or a
 *    number counted with the wrong tokenizer and labelled *exact* — the
 *    strongest word this tool uses about a count.
 * 2. The context-overflow advisory said *"The call will fail"* as a fact, on
 *    any family, using Claude's band as the margin.
 * 3. Both context advisories told every reader to *"settle it with
 *    --exact-tokens; the counting endpoint is free"*, which for most of the
 *    seven priced families is a counter for a different tokenizer.
 *
 * Everything below is derived from `BUNDLED_CATALOGUE`. A family that gains a
 * measured band and its own counter leaves these assertions by having its
 * provider stop being foreign, with nothing here edited.
 */

const run = (args, env = {}) =>
  spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...SPAWN_ENV, ...env },
    timeout: 30000,
  });

const dir = mkdtempSync(join(tmpdir(), 'trazum-band-'));
const prompt = join(dir, 'p.txt');
writeFileSync(prompt, 'You are a helpful assistant. Please be very concise in all your responses.\n');

/** One priced model per provider, so the suite grows with the catalogue. */
const oneModelPer = new Map();
for (const model of BUNDLED_CATALOGUE.models) {
  if (model.provider && !oneModelPer.has(model.provider)) oneModelPer.set(model.provider, model.id);
}

describe('--exact-tokens refuses a family its counter cannot count', () => {
  it('has a foreign family to talk about at all', () => {
    // If every priced provider is ever countable from here, this suite is
    // describing a problem that no longer exists and should be rewritten
    // rather than weakened.
    const foreign = [...oneModelPer.keys()].filter((p) => !bandGoverns(p));
    assert.ok(foreign.length > 0, 'every priced provider is the calibrated one — rewrite this suite');
  });

  for (const [provider, model] of oneModelPer) {
    if (bandGoverns(provider)) continue;

    it(`${provider} (${model}): refused by name, before any key is asked for`, () => {
      /**
       * `ANTHROPIC_API_KEY` is deliberately absent. The refusal must not be
       * *"set a key"* — sending somebody on another family to find a credential
       * that could not have helped them is the failure this replaced.
       */
      const said = run(['optimize', prompt, '--model', model, '--exact-tokens']).stderr;

      assert.match(said, new RegExp(model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'the refusal does not name the model');
      assert.match(said, new RegExp(provider), 'the refusal does not name the family');
      assert.doesNotMatch(said, /ANTHROPIC_API_KEY/, 'sent to find a key that could not help');
      // A refusal never arrives bare.
      assert.match(said, /Drop --exact-tokens|own tooling/, 'the refusal names no way forward');
    });
  }

  it(`${BAND_CALIBRATED_PROVIDER}: not refused for its family — it is the one that is counted`, () => {
    /**
     * The silent half, and the one that matters most. A guard that refuses
     * everything passes every test above and breaks the feature.
     */
    const model = oneModelPer.get(BAND_CALIBRATED_PROVIDER);
    assert.ok(model, 'the calibrated provider prices no models');
    const said = run(['optimize', prompt, '--model', model, '--exact-tokens']).stderr;

    assert.match(said, /ANTHROPIC_API_KEY/, 'the calibrated family was refused for its family');
    assert.doesNotMatch(said, /counts Claude's tokenizer, and/, 'refused the family it can count');
  });

  it('a model whose provider the catalogue does not record is refused as that, not as unknown', () => {
    /**
     * `provider` is optional on a priced model, and `--pricing` lets anybody
     * supply a catalogue. This branch is the only one that reaches the
     * provider-less message — and the first draft of that message said the
     * model *"is not in the price catalogue at all"*, which is false in the one
     * case that can produce it. Found by running it rather than by reading it.
     */
    const houseModel = JSON.parse(JSON.stringify(BUNDLED_CATALOGUE.models[0]));
    delete houseModel.provider;
    delete houseModel.id;
    const pricing = join(dir, 'pricing.json');
    writeFileSync(
      pricing,
      JSON.stringify({
        lastReviewed: BUNDLED_CATALOGUE.lastReviewed,
        models: { 'house-model-1': houseModel },
      }),
    );

    const said = run([
      'optimize', prompt, '--pricing', pricing, '--model', 'house-model-1', '--exact-tokens',
    ]).stderr;

    assert.match(said, /records no provider for "house-model-1"/);
    assert.doesNotMatch(said, /not a model in the price catalogue/, 'told a falsehood about the catalogue');
  });
});

describe('bandGoverns is not a check that can never fail', () => {
  /**
   * The predicate is handed the values it exists to reject, directly. Twice
   * this session a property assertion that looped only over today's correct
   * values turned out to be unable to fire at all, because an earlier check in
   * the same file caught every change first.
   */
  it('rejects every family but the calibrated one', () => {
    assert.equal(bandGoverns(BAND_CALIBRATED_PROVIDER), true);
    for (const provider of ['openai', 'google', 'deepseek', 'xai', 'mistral', 'moonshot']) {
      assert.equal(bandGoverns(provider), false, `${provider} was treated as the calibrated family`);
    }
  });

  it('treats a missing provider as not covered, never as covered', () => {
    // The flattering reading of missing information is the one this project
    // does not take: absence of a provider is not evidence of Claude.
    assert.equal(bandGoverns(undefined), false);
    assert.equal(bandGoverns(null), false);
    assert.equal(bandGoverns(''), false);
  });
});
