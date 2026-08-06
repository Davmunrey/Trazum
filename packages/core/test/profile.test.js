import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { countSentences, profilePrompt } from '../dist/index.js';

/**
 * `profilePrompt` measures a prompt so a ranking can explain itself.
 *
 * The temptation this module exists to resist is a score out of a hundred.
 * These tests are mostly about the measurements being *checkable* — a reader
 * with the prompt in front of them should be able to arrive at the same numbers
 * by counting, which is the only property that makes a metric arguable.
 */

describe('counting sentences', () => {
  it('counts terminal punctuation', () => {
    assert.equal(countSentences('One. Two! Three?'), 3);
  });

  it('counts a bullet or heading with no full stop as one thing said', () => {
    // Zero would make every bulleted prompt look infinitely verbose, since it
    // is the denominator of the density figure.
    assert.equal(countSentences('- Be brief\n- Answer in English\n- Use JSON'), 3);
    assert.equal(countSentences('# Rules\n\nBe brief.'), 2);
  });

  it('ignores code, so a block is not forty sentences', () => {
    const prompt = 'Use this.\n\n```python\na = 1\nb = 2\nc = 3\nd = 4\n```\n\nReturn it.';
    // The two prose sentences, and the fence's own lines are protected.
    assert.equal(countSentences(prompt), 2);
  });

  it('handles CJK terminal punctuation', () => {
    assert.equal(countSentences('簡潔に答えてください。英語で答えてください。'), 2);
  });

  it('is zero for an empty prompt rather than throwing', () => {
    assert.equal(countSentences(''), 0);
    assert.equal(countSentences('   \n\n  '), 0);
  });
});

describe('what a prompt is made of', () => {
  const PADDED = `You are an expert assistant.

Please, in order to be able to help, I basically need you to kindly analyse {{query}} and, if you don't mind, classify it into one of the categories that are available to you.

Thank you very much!`;

  const DENSE = 'Classify {{query}}.\nCategories: billing, technical, account.\nReturn JSON.';

  it('reports density independently of length', () => {
    // The whole point of a ratio. A padded short prompt and a padded long one
    // must look the same, or the metric is just "size" again.
    const padded = profilePrompt(PADDED);
    const dense = profilePrompt(DENSE);

    assert.ok(
      padded.tokensPerSentence > dense.tokensPerSentence * 2,
      `padded ${padded.tokensPerSentence} vs dense ${dense.tokensPerSentence}`,
    );

    // And doubling a prompt must not change its density much: same writing,
    // twice as much of it.
    const doubled = profilePrompt(`${PADDED}\n\n${PADDED}`);
    assert.ok(
      Math.abs(doubled.tokensPerSentence - padded.tokensPerSentence) < 2,
      `density moved with length: ${padded.tokensPerSentence} → ${doubled.tokensPerSentence}`,
    );
  });

  it('separates what cannot be trimmed from what can', () => {
    // A prompt that is mostly code has far less headroom than its size
    // suggests, and a ranking that hides this sends somebody to spend an
    // afternoon on a file that cannot move.
    const codeHeavy = `Use this for {{input}}:

\`\`\`python
def classify(text):
    features = extract(text)
    weights = load_weights("model.bin")
    return argmax([dot(features, w) for w in weights])
\`\`\`

Return the name.`;
    const profile = profilePrompt(codeHeavy);

    assert.ok(profile.protectedTokens > 0);
    assert.ok(
      profile.protectedTokens / profile.tokens > 0.5,
      `only ${profile.protectedTokens}/${profile.tokens} counted as protected`,
    );
  });

  it('counts few-shot examples and what they cost', () => {
    const withExamples = `Classify the message.

Example 1:
Input: My card was declined.
Output: billing

Example 2:
Input: The app crashes.
Output: technical

Example 3:
Input: Change my email.
Output: account

Now classify: {{query}}`;
    const profile = profilePrompt(withExamples);

    assert.ok(profile.examples >= 3, `found ${profile.examples} examples`);
    assert.ok(profile.exampleTokens > 0);
    assert.ok(profile.exampleTokens < profile.tokens);
  });

  it('reports zero examples rather than guessing at prose', () => {
    const profile = profilePrompt(DENSE);
    assert.equal(profile.examples, 0);
    assert.equal(profile.exampleTokens, 0);
  });

  it('survives an empty prompt', () => {
    const profile = profilePrompt('');
    assert.equal(profile.tokens, 0);
    assert.equal(profile.sentences, 0);
    // Not NaN and not Infinity, which is what `tokens / sentences` gives here.
    assert.equal(profile.tokensPerSentence, 0);
  });
});

describe('it is measurements, not a score', () => {
  it('exposes no combined index for anyone to cite', () => {
    // The property this module was designed around, asserted so a later change
    // that adds `score: 74` has to argue with a test rather than slip in. A
    // number nobody can reproduce by hand cannot be disagreed with, and the
    // weights that produce it get tuned until the ranking looks right.
    const profile = profilePrompt('Be brief. Answer in English.');
    const forbidden = ['score', 'rating', 'grade', 'index', 'complexity'];
    const keys = Object.keys(profile).map((key) => key.toLowerCase());

    for (const word of forbidden) {
      assert.equal(
        keys.some((key) => key.includes(word)),
        false,
        `PromptProfile grew a "${word}" field — every number here must be checkable by hand`,
      );
    }
  });

  it('every field is a count or a ratio with units', () => {
    const profile = profilePrompt('Be brief. Answer in English.');
    for (const [key, value] of Object.entries(profile)) {
      assert.equal(typeof value, 'number', `${key} is not a number`);
      assert.ok(Number.isFinite(value), `${key} is ${value}`);
      assert.ok(value >= 0, `${key} is negative`);
    }
  });
});
