import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { estimateTokens } from '@trazum/core';

import { KNOWN_ENCODINGS, canCount, openaiCounter } from '../dist/index.js';

/**
 * OpenAI's own tokenizer, and the one thing an optional counter must never do.
 *
 * The word this package makes available is **exact**, and it is the strongest
 * word this tool uses about a count. Everything here exists so that word is
 * only ever attached to a figure that earned it: a model whose encoding is not
 * in the tables refuses, rather than being counted with a nearby one and
 * labelled the same way.
 */

describe('a model it has the encoding for', () => {
  it('counts with the encoding the model actually uses', () => {
    const gpt5 = openaiCounter('gpt-5');
    assert.equal(gpt5.ok, true);
    assert.equal(gpt5.encoding, 'o200k_base');

    const older = openaiCounter('gpt-3.5-turbo');
    assert.equal(older.ok, true);
    assert.equal(older.encoding, 'cl100k_base');
  });

  it('gives two different encodings different counts for the same text', () => {
    /**
     * The reason the encoding is on the result rather than implied. If both
     * tables produced the same number for everything, choosing between them
     * would not matter and this package could have shipped one.
     *
     * The first version of this check used an English sentence and passed for
     * the wrong reason: `o200k_base` and `cl100k_base` agree exactly on plain
     * Latin prose, so it asserted a difference that was not there and would
     * have gone on passing if both models had been mapped to one table. Chinese
     * is where the two tables genuinely diverge, and it is also where the
     * choice between them costs real money.
     */
    const text = '这是一个关于季度支出的技术说明，涉及缓存命中率与模型分层。';
    const modern = openaiCounter('gpt-5');
    const older = openaiCounter('gpt-3.5-turbo');
    assert.notEqual(
      modern.count(text),
      older.count(text),
      'the two tables agree, so this check no longer proves the encoding is chosen',
    );
  });

  it('counts an empty string as nothing rather than throwing', () => {
    assert.equal(openaiCounter('gpt-5').count(''), 0);
  });

  it('is stable across calls, so a directory is not counted twice differently', () => {
    const counter = openaiCounter('gpt-5');
    const text = 'A prompt somebody wrote, with punctuation: commas, colons; and a number 42.';
    assert.equal(counter.count(text), counter.count(text));
    assert.equal(openaiCounter('gpt-5').count(text), counter.count(text));
  });
});

describe('a model it does not have the encoding for', () => {
  it('refuses rather than counting with the newest table', () => {
    /**
     * `gpt-5-codex` is a real OpenAI model whose rank table this package's
     * dependency does not name. Defaulting to `o200k_base` would be right most
     * of the time and would be a guess every time, and the figure would go out
     * labelled exact.
     */
    const result = openaiCounter('gpt-5-codex');
    assert.equal(result.ok, false);
    assert.equal(result.refusal.reason, 'unknown-encoding');
    assert.equal(result.refusal.model, 'gpt-5-codex');
  });

  it('refuses a model OpenAI has not shipped yet, in both directions', () => {
    for (const model of ['gpt-5.5', 'gpt-6', 'o9-titanic']) {
      assert.equal(openaiCounter(model).ok, false, `${model} was counted`);
    }
  });

  it('refuses another family rather than claiming to know whose it is', () => {
    /**
     * A Claude model refuses as `unknown-encoding` and not as *wrong family*.
     * This package holds encodings, not a catalogue: deciding which provider
     * owns an id belongs to the pricing catalogue, and asserting it from a rank
     * table would put a second source of truth behind an answer already held in
     * one place.
     */
    const result = openaiCounter('claude-sonnet-5');
    assert.equal(result.ok, false);
    assert.equal(result.refusal.reason, 'unknown-encoding');
  });

  it('names what it does hold, so a refusal is actionable', () => {
    const result = openaiCounter('gpt-6');
    assert.deepEqual([...result.refusal.known], [...KNOWN_ENCODINGS]);
    assert.ok(result.refusal.known.includes('o200k_base'));
  });

  it('refuses an empty and a whitespace model id', () => {
    for (const model of ['', '   ']) {
      assert.equal(openaiCounter(model).ok, false, `${JSON.stringify(model)} was counted`);
    }
  });

  it('answers `canCount` the same way it answers `openaiCounter`', () => {
    // Two entry points that disagree would let a report say it counted a model
    // exactly and then hand out a heuristic figure.
    for (const model of ['gpt-5', 'gpt-4', 'gpt-5-codex', 'claude-sonnet-5', 'gpt-6', '']) {
      assert.equal(canCount(model), openaiCounter(model).ok, `they disagree on ${model}`);
    }
  });
});

describe('why this package is worth installing at all', () => {
  /**
   * Measured against this repository's own corpus and its committed OpenAI
   * ground truth, rather than against samples written here.
   *
   * `token-ground-truth.openai.json` holds 47 samples counted through OpenAI's
   * API with a real key. Two things are worth asserting against it, and they
   * point in opposite directions: that this package reproduces those counts, so
   * the offline table can be trusted in place of the paid call; and that the
   * heuristic does not, by enough that twenty-two megabytes is a fair price.
   */
  const here = dirname(fileURLToPath(import.meta.url));
  const coreTest = join(here, '..', '..', 'core', 'test');
  const truth = JSON.parse(
    readFileSync(join(coreTest, 'fixtures', 'token-ground-truth.openai.json'), 'utf8'),
  );
  const sampleText = (file) => readFileSync(join(coreTest, 'corpus', file), 'utf8');

  it('has a fixture with samples in it at all', () => {
    // Without this, every check below passes by looping over nothing.
    assert.ok(truth.samples.length >= 40, `only ${truth.samples.length} samples`);
    assert.equal(truth.provider, 'openai');
  });

  it('reproduces every count the API produced, exactly', () => {
    /**
     * The claim the release notes make, under test. A paid API call and an
     * offline rank table agreeing to the token on 47 samples is what makes the
     * error figure below a measurement rather than an assertion -- and it is
     * what licenses anybody to use this package in place of the call.
     *
     * Exact, not "close": these are the same tokenizer, and a divergence of one
     * token would mean the table and the service had drifted apart, which is a
     * thing to find out here rather than in somebody's invoice.
     */
    const counter = openaiCounter(truth.model);
    assert.equal(counter.ok, true, `this package cannot count ${truth.model}`);

    const differing = truth.samples
      .map((sample) => ({ sample, counted: counter.count(sampleText(sample.file)) }))
      .filter(({ sample, counted }) => counted !== sample.actualTokens)
      .map(({ sample, counted }) => `${sample.file}: table ${counted}, API ${sample.actualTokens}`);

    assert.deepEqual(
      differing,
      [],
      `the rank tables and OpenAI's own counter disagree on ${differing.length} of `
        + `${truth.samples.length} samples`,
    );
  });

  it('disagrees with the heuristic by enough to be worth the twenty-two megabytes', () => {
    /**
     * The estimator is published under a band measured against Anthropic and
     * explicitly not against anybody else. Against OpenAI it is 112.4% out at
     * worst, which `band.ts` now states -- and this is that figure arriving from
     * the other side, so a release that quietly improved the estimator would
     * make this check fail rather than let the package go on claiming a value
     * it no longer has.
     */
    const worst = Math.max(
      ...truth.samples.map((sample) => {
        const exact = sample.actualTokens;
        return Math.abs(estimateTokens(sampleText(sample.file)) - exact) / exact;
      }),
    );

    assert.ok(
      worst > 0.4,
      `the heuristic is within ${(worst * 100).toFixed(1)}% across the whole corpus, so this `
        + 'package is twenty-two megabytes for very little — re-read the threshold in the roadmap',
    );
  });

  it('and the heuristic was never a lie, only a Claude one', () => {
    /**
     * The other half of the honesty, and the half the first draft of this file
     * got wrong: it asserted the estimator was close on English prose against
     * OpenAI, and it is 60% out. It is not close, and it never claimed to be --
     * `ESTIMATE_ERROR_BAND_PCT` is a measurement against Anthropic's tokenizer,
     * a fact `BAND_CALIBRATED_PROVIDER` exists to name.
     *
     * So what is asserted is the true version: the estimator is worst here on
     * the classes `band.ts` already says it is worst on, rather than uniformly
     * wrong in a way that would mean it was simply broken.
     */
    const byFile = new Map(
      truth.samples.map((sample) => [
        sample.file,
        Math.abs(estimateTokens(sampleText(sample.file)) - sample.actualTokens) / sample.actualTokens,
      ]),
    );

    const best = Math.min(...byFile.values());
    assert.ok(
      best < 0.25,
      `the estimator is at least ${(best * 100).toFixed(1)}% out on every single sample, which `
        + 'would make it broken rather than calibrated elsewhere',
    );
  });
});
