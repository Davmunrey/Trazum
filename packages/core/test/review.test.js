import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { analyzeExamples, estimateTokens, reviewExamples } from '../dist/index.js';

/** Fake provider: answers with whatever we hand it, without touching the network. */
function fakeProvider(reply) {
  return {
    name: 'fake',
    model: 'fake-1',
    async complete() {
      return typeof reply === 'function' ? reply() : reply;
    },
  };
}

/**
 * Two examples that teach the same thing in different words, plus one that
 * teaches something else. Word overlap between the first two is around 0.54 —
 * deliberately below the deterministic threshold, which is the whole reason
 * this pass exists.
 */
const PARAPHRASED = [
  'Classify the review.',
  '',
  'Example 1:',
  'Input: The product arrived quickly and works great.',
  'Output: positive',
  '',
  'Example 2:',
  'Input: The item turned up fast and does its job well.',
  'Output: positive',
  '',
  'Example 3:',
  'Input: Terrible quality, broke after one day.',
  'Output: negative',
].join('\n');

describe('semantic example review', () => {
  it('reports what the deterministic detector deliberately misses', () => {
    // Establishing the premise: word overlap does not catch this pair, which
    // is why a model is worth a call here.
    assert.equal(analyzeExamples(PARAPHRASED, estimateTokens).redundant.length, 0);
  });

  it('reads a well-formed answer', async () => {
    const review = await reviewExamples(
      PARAPHRASED,
      fakeProvider('[{"keep": 0, "redundant": [1], "reason": "both map fast delivery to positive"}]'),
    );
    assert.ok(review);
    assert.equal(review.exampleCount, 3);
    assert.equal(review.groups.length, 1);
    assert.deepEqual(review.groups[0].redundant, [1]);
    assert.equal(review.groups[0].keep, 0);
    assert.match(review.groups[0].reason, /fast delivery/);
    assert.ok(review.redundantTokens > 0);
  });

  it('reads an answer the model wrapped in a code fence', async () => {
    const review = await reviewExamples(
      PARAPHRASED,
      fakeProvider('```json\n[{"keep": 0, "redundant": [1], "reason": "same"}]\n```'),
    );
    assert.equal(review.groups.length, 1);
  });

  it('reads an answer buried in prose', async () => {
    const review = await reviewExamples(
      PARAPHRASED,
      fakeProvider('Sure! Here is the analysis:\n[{"keep":0,"redundant":[1],"reason":"same"}]\nHope that helps.'),
    );
    assert.equal(review.groups.length, 1);
  });

  it('accepts an empty result as a real answer', async () => {
    const review = await reviewExamples(PARAPHRASED, fakeProvider('[]'));
    assert.deepEqual(review.groups, []);
    assert.equal(review.redundantTokens, 0);
    assert.equal(review.unusableResponse, undefined);
  });

  it('skips the call entirely when there is nothing to review', async () => {
    let called = false;
    const provider = {
      name: 'fake',
      model: 'fake-1',
      async complete() {
        called = true;
        return '[]';
      },
    };
    assert.equal(await reviewExamples('Just a prompt with no examples.', provider), null);
    assert.equal(await reviewExamples('Example 1:\nInput: only one', provider), null);
    assert.equal(called, false, 'should not pay for a call it does not need');
  });
});

describe('the review distrusts what the model returns', () => {
  // Everything here is a suggestion from an untrusted source. A model that
  // answers badly must produce an empty review, never a crash and never a
  // saving the prompt could not deliver.

  it('survives an answer that is not JSON at all', async () => {
    const review = await reviewExamples(PARAPHRASED, fakeProvider('I think examples 1 and 2 match.'));
    assert.deepEqual(review.groups, []);
    assert.match(review.unusableResponse, /I think/);
  });

  it('survives malformed JSON', async () => {
    const review = await reviewExamples(PARAPHRASED, fakeProvider('[{"keep": 0, "redundant":'));
    assert.deepEqual(review.groups, []);
  });

  it('drops indices that do not exist', async () => {
    const review = await reviewExamples(
      PARAPHRASED,
      fakeProvider('[{"keep": 0, "redundant": [1, 99, -3], "reason": "x"}]'),
    );
    assert.deepEqual(review.groups[0].redundant, [1]);
  });

  it('drops a group whose keep index is out of range', async () => {
    const review = await reviewExamples(
      PARAPHRASED,
      fakeProvider('[{"keep": 42, "redundant": [1], "reason": "x"}]'),
    );
    assert.deepEqual(review.groups, []);
  });

  it('drops an example claiming to be redundant with itself', async () => {
    const review = await reviewExamples(
      PARAPHRASED,
      fakeProvider('[{"keep": 1, "redundant": [1], "reason": "x"}]'),
    );
    assert.deepEqual(review.groups, []);
  });

  it('counts an example once however many groups claim it', async () => {
    // Overlapping groups would otherwise count the same tokens twice and
    // report a saving larger than the prompt contains.
    const review = await reviewExamples(
      PARAPHRASED,
      fakeProvider(
        '[{"keep": 0, "redundant": [1], "reason": "a"}, {"keep": 2, "redundant": [1], "reason": "b"}]',
      ),
    );
    assert.equal(review.groups.length, 1);
    const total = review.groups.reduce((sum, g) => sum + g.redundant.length, 0);
    assert.equal(total, 1);
    assert.equal(review.redundantTokens, review.groups[0].tokens);
  });

  it('never reports more redundant tokens than the examples hold', async () => {
    const review = await reviewExamples(
      PARAPHRASED,
      fakeProvider('[{"keep": 0, "redundant": [1, 2], "reason": "x"}]'),
    );
    const exampleTokens = analyzeExamples(PARAPHRASED, estimateTokens).examples.reduce(
      (sum, e) => sum + e.tokens,
      0,
    );
    assert.ok(review.redundantTokens > 0);
    assert.ok(review.redundantTokens < exampleTokens);
  });

  it('truncates an over-long reason rather than passing it through', async () => {
    const review = await reviewExamples(
      PARAPHRASED,
      fakeProvider(`[{"keep": 0, "redundant": [1], "reason": "${'x'.repeat(500)}"}]`),
    );
    assert.ok(review.groups[0].reason.length <= 160);
  });

  it('lets a provider error surface', async () => {
    // A broken answer is the model's problem and gets swallowed; a broken
    // provider is the caller's configuration and must not be.
    const provider = {
      name: 'fake',
      model: 'fake-1',
      async complete() {
        throw new Error('endpoint responded 502');
      },
    };
    await assert.rejects(() => reviewExamples(PARAPHRASED, provider), /502/);
  });
});
