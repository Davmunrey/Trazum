import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BUNDLED_CATALOGUE,
  BAND_CALIBRATED_PROVIDER,
  ESTIMATE_ERROR_BAND_PCT,
  buildAdvisories,
  bandGoverns,
  estimateTokens,
} from '../dist/index.js';

/**
 * The context advisory may not state a Claude measurement as a fact about
 * another family.
 *
 * `contextOverflow` said *"The call will fail"* — the most absolute sentence
 * this product produces, with no dollar figure to hedge it — whenever the
 * estimate exceeded the window by more than `±10%`. That band is the
 * estimator's measured error **against Claude's tokenizer**, over twenty-one
 * samples. Applied to `gpt-5` it is a number borrowed from a different
 * tokenizer and presented as the margin, which is the first rule in this
 * project's doctrine: measured never merges with estimated without saying
 * which half is which.
 *
 * The fix is not a wider band for the unmeasured families. Inventing a second
 * number would be the same mistake with worse arithmetic. It is that certainty
 * is not a conclusion this input supports, and the advisory says so.
 */

const anthropicModel = BUNDLED_CATALOGUE.models.find((m) => m.provider === BAND_CALIBRATED_PROVIDER);
const foreignModel = BUNDLED_CATALOGUE.models.find((m) => m.provider && !bandGoverns(m.provider));

const CHUNK = 'lorem ipsum dolor sit amet consectetur adipiscing elit ';

/**
 * Text of roughly a target token count.
 *
 * Grown by doubling to get close and then by one chunk at a time, because
 * doubling alone overshoots — the first draft of this file asked for 1.01x a
 * 1,000,000-token window and produced 1,966,080 tokens, which lands in the
 * *certain* overflow branch and made a correct implementation fail a test about
 * the uncertain one. The input was wrong, not the code.
 */
const about = (target) => {
  const perChunk = estimateTokens(CHUNK);
  let text = CHUNK.repeat(Math.ceil(target / perChunk));
  // The estimator is not exactly linear in chunks, so top up — but by repeat,
  // never one chunk at a time: appending a 54-character string a million times
  // is quadratic and hung the suite for two minutes on the first attempt.
  while (estimateTokens(text) < target) {
    text += CHUNK.repeat(Math.max(1, Math.ceil((target - estimateTokens(text)) / perChunk)));
  }
  return text;
};

/** Far enough past the window that Claude's band could not reach back under it. */
const wellOver = (model) =>
  about(Math.ceil(model.contextWindow * (1 + ESTIMATE_ERROR_BAND_PCT / 100) * 1.5));

const advise = (model, text) =>
  buildAdvisories(
    text,
    estimateTokens(text),
    { model: model.id, callsPerMonth: 1000, avgOutputTokens: 100 },
    { pricing: BUNDLED_CATALOGUE, count: estimateTokens },
  );

const overflowFor = (model) =>
  advise(model, wellOver(model)).find((a) => a.id === 'context-overflow');

describe('a prompt far over the window, on an estimate', () => {
  it('found both a calibrated and a foreign model to compare', () => {
    assert.ok(anthropicModel, 'no model from the calibrated provider');
    assert.ok(foreignModel, 'no model from any other provider — nothing to protect');
  });

  it('tells the calibrated family the call fails, because it does', () => {
    const advisory = overflowFor(anthropicModel);
    assert.ok(advisory, 'no context-overflow advisory was raised at all');
    assert.match(advisory.detail, /The call will fail/);
  });

  it('never tells another family the call fails', () => {
    /**
     * The whole point. Same prompt, same distance past the window, different
     * tokenizer — and the only honest difference is that here the margin is
     * the unknown.
     */
    const advisory = overflowFor(foreignModel);
    assert.ok(advisory, 'no context-overflow advisory was raised at all');
    assert.doesNotMatch(
      advisory.detail,
      /The call will fail/,
      `${foreignModel.id} was told a Claude measurement as a fact`,
    );
    assert.match(advisory.detail, /measured against Claude's tokenizer/);
    assert.match(advisory.detail, new RegExp(foreignModel.displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('never sends another family to a counter for a different tokenizer', () => {
    /**
     * `--exact-tokens` counts with Anthropic's endpoint. Recommending it to
     * somebody on GPT was pointing them at a counter that would refuse them or
     * hand back the wrong number — and the CLI now refuses that call outright,
     * so this advice would have named a command that cannot run.
     */
    const advisory = overflowFor(foreignModel);
    assert.doesNotMatch(advisory.detail, /--exact-tokens/, 'recommended a Claude-only counter');
    assert.doesNotMatch(advisory.detail, /counting endpoint is free/);
  });

  it('still offers it to the family it works for', () => {
    // The silent half: the advice is not deleted, it is bounded.
    const nearly = BUNDLED_CATALOGUE.models.find((m) => m.provider === BAND_CALIBRATED_PROVIDER);
    // Just over the line, inside the band — the case where "probably" is the
    // honest word and --exact-tokens is what settles it.
    const text = about(Math.ceil(nearly.contextWindow * 1.01));
    const found = advise(nearly, text).find(
      (a) => a.id === 'context-overflow' || a.id === 'context-near-limit',
    );
    assert.ok(found, 'no context advisory near the limit');
    assert.match(found.detail, /--exact-tokens/, 'the calibrated family lost advice that works for it');
  });
});
